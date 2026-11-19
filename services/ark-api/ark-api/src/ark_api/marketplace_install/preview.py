import asyncio
import json
import logging
import re
import weakref
from dataclasses import dataclass
from typing import Any, Optional

import aiohttp
from kubernetes_asyncio.client.rest import ApiException
from kubernetes_asyncio.dynamic.exceptions import ResourceNotFoundError, ResourceNotUniqueError

from ark_sdk.impersonation import ImpersonationConfig
from ark_sdk.k8s import read_secret_labels
from ark_sdk.secret_scope import is_reserved_name, scope_kind

from ..api.v1.client_utils import create_dynamic_client, get_impersonating_api_client
from ..models.marketplace_installs import InstallResourceState
from . import checks
from .checks import ObjectRef
from .constants import ARK_GROUP, installer_username
from .errors import describe_error

logger = logging.getLogger(__name__)

RELEASE_NAME_ANNOTATION = "meta.helm.sh/release-name"
MAX_PARALLEL_REQUESTS = 8
MAX_DETAIL_CHARS = 300
POD_SECURITY = re.compile(r"(would violate|violates) PodSecurity")
WARNING_HEADER = re.compile(r'^\d{3} \S+ "(.*)"$')


_DISCOVERY_LOCKS: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock]" = weakref.WeakKeyDictionary()


def _discovery_lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    lock = _DISCOVERY_LOCKS.get(loop)
    if lock is None:
        lock = _DISCOVERY_LOCKS[loop] = asyncio.Lock()
    return lock


@dataclass(frozen=True)
class Row:
    api_version: str
    kind: str
    name: str
    namespace: Optional[str]
    state: InstallResourceState
    message: Optional[str] = None
    owned_by_release: Optional[str] = None
    hook: bool = False
    ref: Optional[ObjectRef] = None


def _short(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= MAX_DETAIL_CHARS else text[: MAX_DETAIL_CHARS - 1] + "…"


def _warning_text(header: str) -> str:
    match = WARNING_HEADER.match(header.strip())
    return match.group(1).replace('\\"', '"') if match else header


def _status_message(error: ApiException) -> str:
    try:
        body = json.loads(error.body or "{}")
    except (TypeError, ValueError):
        body = {}
    message = body.get("message") if isinstance(body, dict) else None
    return _short(message if isinstance(message, str) and message else f"{error.status} {error.reason}")


async def _personal_secrets(namespace: str, objects: list[dict]) -> tuple[set[str], set[str]]:
    names = set()
    for obj in objects:
        names.update(name for name in checks.referenced_secret_names(obj) if not is_reserved_name(name))
    personal, unknown = set(), set()
    for name in sorted(names):
        try:
            labels = await read_secret_labels(namespace, name)
        except (ApiException, aiohttp.ClientError) as e:
            logger.warning("Reading the labels of a referenced Secret failed: %s", describe_error(e))
            unknown.add(name)
            continue
        if labels is not None and scope_kind(labels) == "personal":
            personal.add(name)
    return personal, unknown


class _Cluster:
    def __init__(self, dynamic, namespace: str):
        self.dynamic = dynamic
        self.namespace = namespace
        self.resources: dict[tuple[str, str], Any] = {}
        self.limit = asyncio.Semaphore(MAX_PARALLEL_REQUESTS)

    async def resource(self, api_version: str, kind: str):
        key = (api_version, kind)
        if key not in self.resources:
            try:
                async with _discovery_lock():
                    resource = await self.dynamic.resources.get(api_version=api_version, kind=kind)
            except (ResourceNotFoundError, ResourceNotUniqueError):
                resource = None
            self.resources[key] = resource if hasattr(resource, "namespaced") else None
        return self.resources[key]

    async def existing(self, resource, name: str) -> Optional[dict]:
        async with self.limit:
            try:
                found = await self.dynamic.get(resource, name=name, namespace=self.namespace)
            except ApiException as e:
                if e.status == 404:
                    return None
                raise
        return found.to_dict()

    async def dry_run_warnings(self, resource, obj: dict) -> list[str]:
        body = {**obj, "metadata": {**checks.metadata(obj), "namespace": self.namespace}}
        async with self.limit:
            response = await self.dynamic.create(
                resource, body=body, namespace=self.namespace, dry_run="All", serialize=False
            )
        try:
            return list(response.headers.getall("Warning", []))
        finally:
            response.release()


async def _cluster_row(cluster: _Cluster, obj: dict, base: dict, ref: ObjectRef, resource) -> Row:
    try:
        existing = await cluster.existing(resource, ref.name)
    except aiohttp.ClientError:
        return Row(**base, state="unverifiable", message="Could not reach the API server", ref=ref)
    except ApiException as e:
        if e.status == 403:
            return Row(**base, state="unverifiable", message="The installer account cannot read this object", ref=ref)
        return Row(**base, state="unverifiable", message=_status_message(e), ref=ref)
    if existing is not None:
        annotations = checks.metadata(existing).get("annotations")
        owner = annotations.get(RELEASE_NAME_ANNOTATION) if isinstance(annotations, dict) else None
        if isinstance(owner, str) and owner:
            return Row(**base, state="conflict-release", owned_by_release=owner, message=f"Already owned by release {owner}", ref=ref)
        return Row(**base, state="conflict-unmanaged", message="Already exists and no release owns it", ref=ref)
    if checks.group_of(obj) == ARK_GROUP:
        return Row(**base, state="free", ref=ref)
    try:
        warnings = await cluster.dry_run_warnings(resource, obj)
    except aiohttp.ClientError:
        return Row(**base, state="unverifiable", message="Could not reach the API server", ref=ref)
    except ApiException as e:
        message = _status_message(e)
        if POD_SECURITY.search(message):
            return Row(**base, state="psa-violation", message=message, ref=ref)
        return Row(**base, state="unverifiable", message=f"Rejected by the API server: {message}", ref=ref)
    violations = [_warning_text(w) for w in warnings if POD_SECURITY.search(w)]
    if violations:
        return Row(**base, state="psa-violation", message=_short(" ".join(violations)), ref=ref)
    return Row(**base, state="free", ref=ref)


async def _object_row(cluster: _Cluster, obj: dict, roles: set[str], personal: set[str], unknown: set[str]) -> Row:
    meta = checks.metadata(obj)
    api_version, kind, name = obj["apiVersion"], obj["kind"], meta.get("name")
    base = {
        "api_version": api_version,
        "kind": kind,
        "name": name if isinstance(name, str) else "",
        "namespace": meta.get("namespace") if isinstance(meta.get("namespace"), str) else None,
        "hook": checks.is_hook(obj),
    }
    resource = await cluster.resource(api_version, kind)
    namespaced = None if resource is None else bool(resource.namespaced)
    verdict = checks.manifest_verdict(obj, cluster.namespace, roles, namespaced, personal)
    if verdict is not None:
        return Row(**base, state=verdict.state, message=verdict.message)
    if resource is None:
        return Row(**base, state="unverifiable", message=f"The cluster has no single resource for {kind} in {api_version}")
    if not isinstance(name, str) or not name:
        return Row(**base, state="unverifiable", message="The object has no fixed name")
    if unchecked := sorted(checks.referenced_secret_names(obj) & unknown):
        return Row(**base, state="unverifiable", message=f"Could not check the Secret {unchecked[0]}")
    ref = ObjectRef(api_version=api_version, kind=kind, name=name, plural=resource.name, namespaced=True)
    return await _cluster_row(cluster, obj, base, ref, resource)


async def check_objects(namespace: str, objects: list[dict]) -> list[Row]:
    roles = checks.rendered_roles(objects)
    personal, unknown = await _personal_secrets(namespace, objects)
    installer = ImpersonationConfig(username=installer_username(namespace), groups=[])
    async with get_impersonating_api_client(installer) as api:
        cluster = _Cluster(await create_dynamic_client(api), namespace)
        return list(await asyncio.gather(*(_object_row(cluster, obj, roles, personal, unknown) for obj in objects)))
