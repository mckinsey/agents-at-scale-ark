import base64
import binascii
import json
import logging
import zlib
from dataclasses import dataclass
from typing import Any, Optional

from kubernetes_asyncio import client

from .errors import describe_error
from .kube import get_json, items_of

logger = logging.getLogger(__name__)

HELM_OWNER_SELECTOR = "owner=helm"
METADATA_ACCEPT = "application/json;as=PartialObjectMetadataList;g=meta.k8s.io;v=v1"
RELEASE_KEY = "release"
GZIP_MAGIC = b"\x1f\x8b\x08"
GZIP_WBITS = 16 + zlib.MAX_WBITS
MAX_RELEASE_BYTES = 4 * 1024 * 1024
MAX_CACHED_DESCRIPTIONS = 256


@dataclass(frozen=True)
class Revision:
    release: str
    version: int
    status: str
    secret_name: str
    resource_version: str = ""


_descriptions: dict[tuple[str, str, str], Optional[str]] = {}


def _revision(item: Any) -> Optional[Revision]:
    meta = item.get("metadata") if isinstance(item, dict) else None
    if not isinstance(meta, dict):
        return None
    labels = meta.get("labels")
    labels = labels if isinstance(labels, dict) else {}
    release, status, version = labels.get("name"), labels.get("status"), labels.get("version")
    secret_name = meta.get("name")
    if not (isinstance(release, str) and release and isinstance(status, str) and status):
        return None
    if not (isinstance(version, str) and version.isdigit() and isinstance(secret_name, str) and secret_name):
        return None
    resource_version = meta.get("resourceVersion")
    return Revision(
        release=release,
        version=int(version),
        status=status,
        secret_name=secret_name,
        resource_version=resource_version if isinstance(resource_version, str) else "",
    )


async def _list(api, namespace: str, selector: str) -> list[Revision]:
    data = await get_json(
        api,
        "/api/v1/namespaces/{namespace}/secrets",
        {"namespace": namespace},
        [("labelSelector", selector)],
        accept=METADATA_ACCEPT,
    )
    return [revision for revision in map(_revision, items_of(data)) if revision is not None]


def _newest(revisions: list[Revision]) -> dict[str, Revision]:
    latest: dict[str, Revision] = {}
    for revision in revisions:
        current = latest.get(revision.release)
        if current is None or revision.version > current.version:
            latest[revision.release] = revision
    return latest


async def latest(api, namespace: str, release: str) -> Optional[Revision]:
    revisions = await _list(api, namespace, f"{HELM_OWNER_SELECTOR},name={release}")
    return _newest(revisions).get(release)


async def latest_all(api, namespace: str) -> dict[str, Revision]:
    return _newest(await _list(api, namespace, HELM_OWNER_SELECTOR))


def _inflate(data: bytes) -> Optional[bytes]:
    if not data.startswith(GZIP_MAGIC):
        return data if len(data) <= MAX_RELEASE_BYTES else None
    inflater = zlib.decompressobj(GZIP_WBITS)
    try:
        inflated = inflater.decompress(data, MAX_RELEASE_BYTES + 1)
    except zlib.error:
        return None
    if len(inflated) > MAX_RELEASE_BYTES or inflater.unconsumed_tail:
        return None
    return inflated


def decode_release(encoded: str) -> Optional[dict]:
    try:
        payload = base64.b64decode(base64.b64decode(encoded, validate=True), validate=True)
    except (binascii.Error, ValueError):
        return None
    inflated = _inflate(payload)
    if inflated is None:
        return None
    try:
        decoded = json.loads(inflated)
    except (UnicodeDecodeError, ValueError, RecursionError):
        return None
    return decoded if isinstance(decoded, dict) else None


def _description_of(release: Optional[dict]) -> Optional[str]:
    info = release.get("info") if release is not None else None
    description = info.get("description") if isinstance(info, dict) else None
    return description if isinstance(description, str) else None


def _remember(key: tuple[str, str, str], description: Optional[str]) -> None:
    if not key[2]:
        return
    while len(_descriptions) >= MAX_CACHED_DESCRIPTIONS:
        _descriptions.pop(next(iter(_descriptions)))
    _descriptions[key] = description


def clear_cache() -> None:
    _descriptions.clear()


async def failure_description(api, namespace: str, revision: Revision) -> Optional[str]:
    key = (namespace, revision.secret_name, revision.resource_version)
    if key[2] and key in _descriptions:
        return _descriptions[key]
    try:
        secret = await client.CoreV1Api(api).read_namespaced_secret(revision.secret_name, namespace)
    except Exception as e:
        logger.warning("Reading Helm release %s failed: %s", revision.secret_name, describe_error(e))
        return None
    data = getattr(secret, "data", None)
    encoded = data.get(RELEASE_KEY) if isinstance(data, dict) else None
    release = decode_release(encoded) if isinstance(encoded, str) else None
    if release is None:
        logger.warning("Helm release %s could not be decoded", revision.secret_name)
    description = _description_of(release)
    _remember(key, description)
    return description
