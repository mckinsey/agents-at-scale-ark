import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...marketplace_install import (
    capability,
    catalog,
    events,
    gate,
    helm,
    install,
    job,
    lock,
    logs,
    preview,
    preview_cache,
    state,
)
from ...marketplace_install.constants import NAMESPACE_PATTERN, installer_username
from ...marketplace_install.errors import describe_error, install_error
from ...models.marketplace_installs import (
    CapabilityReason,
    MarketplaceInstallCapability,
    MarketplaceInstallError,
    MarketplaceInstallList,
    MarketplaceInstallPreview,
    MarketplaceInstallPreviewRequest,
    MarketplaceInstallRecord,
    MarketplaceInstallRequest,
    MarketplaceInstallResource,
)
from .client_utils import get_impersonating_api_client

ITEM_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$"
SOURCE_PATTERN = r"^[-._a-zA-Z0-9]+$"
LOG_STATES = {"installing", "failed", "timed-out"}
POST_TIMEOUT_ENV = "MARKETPLACE_INSTALL_POST_TIMEOUT_SECONDS"
DEFAULT_POST_TIMEOUT_SECONDS = 20.0
PREVIEW_TIMEOUT_ENV = "MARKETPLACE_INSTALL_PREVIEW_TIMEOUT_SECONDS"
DEFAULT_PREVIEW_TIMEOUT_SECONDS = 25.0
HELM_ERROR_STATUS = {helm.CHART_UNAVAILABLE: 502, helm.RENDER_FAILED: 422}

router = APIRouter(
    prefix="/namespaces/{namespace}/marketplace-installs",
    tags=["marketplace-installs"],
)


async def _first_reason(
    namespace: str, request: Request, impersonation: Optional[ImpersonationConfig]
) -> Optional[CapabilityReason]:
    if os.getenv("READ_ONLY_MODE", "false").lower() == "true":
        return "read-only"
    denial = gate.identity_denial(request)
    if denial is not None:
        return denial
    if not await capability.installer_enabled(namespace):
        return "namespace-not-enabled"
    if not await capability.policy_in_place(namespace):
        return "policy-missing"
    if not gate.is_open_mode() and not await gate.can_install(impersonation, namespace):
        return "not-permitted"
    return None


@router.get("/capability", response_model=MarketplaceInstallCapability)
async def get_marketplace_install_capability(
    request: Request,
    namespace: str = Path(pattern=NAMESPACE_PATTERN),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceInstallCapability:
    reason = await _first_reason(namespace, request, impersonation)
    return MarketplaceInstallCapability(enabled=reason is None, reason=reason)


def _seconds(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


def _preview_timeout() -> float:
    return _seconds(PREVIEW_TIMEOUT_ENV, DEFAULT_PREVIEW_TIMEOUT_SECONDS)


async def _require_namespace_ready(namespace: str) -> None:
    if not await capability.installer_enabled(namespace):
        raise install_error(409, "namespace-not-enabled", "Marketplace installs are not enabled in this namespace")
    if not await capability.policy_in_place(namespace):
        raise install_error(
            409, "policy-missing", "The admission policy that protects the installer account is missing"
        )


async def _render(resolved: "catalog.ResolvedItem", namespace: str):
    async with helm.workspace() as workdir:
        try:
            pulled = await helm.pull(resolved.chart_ref, resolved.plain_http, workdir)
            objects = await helm.template(pulled.path, resolved.release, namespace, workdir)
        except helm.HelmError as e:
            raise install_error(HELM_ERROR_STATUS[e.code], e.code, e.message) from None
    return pulled, objects


async def _build_preview(
    request: Request,
    namespace: str,
    item: str,
    source: str,
    impersonation: Optional[ImpersonationConfig],
) -> MarketplaceInstallPreview:
    await gate.require_install(request, impersonation, namespace)
    await _require_namespace_ready(namespace)
    resolved = await catalog.resolve(namespace, source, item, impersonation)
    await _require_absent(namespace, resolved)
    pulled, objects = await _render(resolved, namespace)
    rows = await preview.check_objects(namespace, objects)
    blocked = any(row.state != "free" for row in rows)
    preview_cache.put(
        namespace,
        source,
        item,
        preview_cache.PreviewEntry(
            release=resolved.release,
            chart_ref=resolved.chart_ref,
            chart_version=pulled.version,
            digest=pulled.digest,
            blocked=blocked,
            objects=tuple(row.ref for row in rows if row.ref is not None),
            created_at=preview_cache.now(),
        ),
    )
    return MarketplaceInstallPreview(
        source=source,
        itemName=item,
        chartName=resolved.chart_ref.rsplit("/", 1)[-1],
        chartRef=resolved.chart_ref,
        chartVersion=pulled.version,
        digest=pulled.digest,
        releaseName=resolved.release,
        namespace=namespace,
        blocked=blocked,
        expiresAt=datetime.now(timezone.utc) + timedelta(seconds=preview_cache.ttl_seconds()),
        resources=[
            MarketplaceInstallResource(
                apiVersion=row.api_version,
                kind=row.kind,
                name=row.name,
                namespace=row.namespace,
                state=row.state,
                ownedByRelease=row.owned_by_release,
                hook=row.hook,
                message=row.message,
            )
            for row in rows
        ],
    )


@router.post("/{item}/preview", response_model=MarketplaceInstallPreview, responses={409: {"model": MarketplaceInstallError}})
async def preview_marketplace_install(
    request: Request,
    body: MarketplaceInstallPreviewRequest,
    namespace: str = Path(pattern=NAMESPACE_PATTERN),
    item: str = Path(pattern=ITEM_PATTERN),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceInstallPreview:
    timeout = _preview_timeout()
    try:
        async with asyncio.timeout(timeout):
            return await _build_preview(request, namespace, item, body.source, impersonation)
    except TimeoutError:
        raise install_error(
            504, "preview-timeout", f"The preview did not finish within {timeout:g} seconds"
        ) from None


def _installer_api(namespace: str):
    return get_impersonating_api_client(ImpersonationConfig(username=installer_username(namespace), groups=[]))


async def _record_of(api, namespace: str, resolved: "catalog.ResolvedItem") -> MarketplaceInstallRecord:
    record = state.record(await state.load(api, namespace, resolved.release))
    record.source = record.source or resolved.source
    record.itemName = record.itemName or resolved.item
    return record


async def _current_record(namespace: str, resolved: "catalog.ResolvedItem") -> MarketplaceInstallRecord:
    async with _installer_api(namespace) as api:
        return await _record_of(api, namespace, resolved)


async def _require_absent(namespace: str, resolved: "catalog.ResolvedItem") -> None:
    record = await _current_record(namespace, resolved)
    if record.state != "installable":
        raise install_error(
            409,
            "already-installed",
            f"Release {resolved.release} of marketplace item {resolved.item} is {record.state}",
            record=record,
        )


@router.get("", response_model=MarketplaceInstallList)
async def list_marketplace_installs(
    request: Request,
    namespace: str = Path(pattern=NAMESPACE_PATTERN),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceInstallList:
    await gate.require_read(request, impersonation, namespace)
    await _require_namespace_ready(namespace)
    async with _installer_api(namespace) as api:
        observed = await state.load_all(api, namespace)
    return MarketplaceInstallList(items=[state.record(entry) for entry in observed])


@router.get("/{item}", response_model=MarketplaceInstallRecord)
async def get_marketplace_install(
    request: Request,
    namespace: str = Path(pattern=NAMESPACE_PATTERN),
    item: str = Path(pattern=ITEM_PATTERN),
    source: str = Query(min_length=1, max_length=253, pattern=SOURCE_PATTERN),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceInstallRecord:
    await gate.require_read(request, impersonation, namespace)
    await _require_namespace_ready(namespace)
    async with _installer_api(namespace) as api:
        found = await state.item_job(api, namespace, source, item)
        if found is None:
            release = (await catalog.resolve(namespace, source, item, impersonation)).release
        else:
            release = found[0]
        observed = await state.load(api, namespace, release)
        record = state.record(observed)
        record.source, record.itemName = source, item
        record.events = await events.collect(api, namespace, release, observed.job)
        if (
            record.state in LOG_STATES
            and observed.job is not None
            and await gate.logs_visible(request, impersonation, namespace)
        ):
            record.log = await logs.job_log(api, namespace, observed.job)
    return record


def _installed_by(request: Request) -> Optional[str]:
    if gate.is_open_mode():
        return None
    username = getattr(getattr(request.state, "user_identity", None), "username", None)
    return username if isinstance(username, str) and username.strip() else None


def _cached_preview(namespace: str, item: str, body: MarketplaceInstallRequest, resolved: "catalog.ResolvedItem"):
    entry = preview_cache.get(namespace, body.source, item, body.digest)
    if entry is None or entry.chart_ref != resolved.chart_ref or entry.release != resolved.release:
        raise install_error(409, "preview-expired", "The preview of this item has expired or no longer matches the catalogue")
    if entry.blocked:
        raise install_error(422, "preview-blocked", "The preview of this item found objects that block the install")
    return entry


async def _start(
    request: Request,
    namespace: str,
    item: str,
    body: MarketplaceInstallRequest,
    impersonation: Optional[ImpersonationConfig],
) -> MarketplaceInstallRecord:
    await gate.require_install(request, impersonation, namespace)
    await _require_namespace_ready(namespace)
    resolved = await catalog.resolve(namespace, body.source, item, impersonation)
    current = await _current_record(namespace, resolved)
    if current.state == "installing":
        return current
    if current.state != "installable":
        raise install_error(
            409, "already-installed", f"Release {resolved.release} of marketplace item {item} is {current.state}", record=current
        )
    entry = _cached_preview(namespace, item, body, resolved)
    image = job.image()
    if image is None:
        raise install_error(500, "install-misconfigured", "ark-api has no image configured for install jobs")
    installed_by = _installed_by(request)
    async with get_impersonating_api_client(None) as own, _installer_api(namespace) as api:
        leases = lock.Leases(own, namespace)
        try:
            outcome = await lock.acquire(leases, resolved.release, lambda holder: state.read_job(api, namespace, holder))
        except (ApiException, aiohttp.ClientError) as e:
            raise _cluster_error(e) from None
        if isinstance(outcome, lock.Held):
            raise install_error(
                409, "another-install-active", f"Another marketplace install is running in this namespace: {outcome.holder or 'unknown'}"
            )
        if isinstance(outcome, lock.Resumed):
            return await _record_of(api, namespace, resolved)
        spec = job.InstallSpec(
            namespace=namespace,
            source=body.source,
            item=item,
            release=resolved.release,
            chart_ref=resolved.chart_ref,
            digest=entry.digest,
            chart_version=entry.chart_version,
            plain_http=resolved.plain_http,
            installed_by=installed_by,
        )
        try:
            await _create_install_job(api, spec, entry.objects, image)
        except (HTTPException, ApiException) as e:
            await lock.release_if_ours(leases, outcome.resource_version)
            if isinstance(e, ApiException):
                raise _cluster_error(e) from None
            raise
        except aiohttp.ClientError as e:
            raise _cluster_error(e) from None
        return await _record_of(api, namespace, resolved)


def _cluster_error(error: Exception) -> HTTPException:
    return install_error(502, "cluster-error", f"A Kubernetes request of the install failed: {describe_error(error)}")


async def _create_install_job(api, spec: "job.InstallSpec", objects, image: str) -> None:
    await install.remove_finished_job(api, spec.namespace, spec.release)
    conflict = await install.existing_conflict(api, spec.namespace, objects)
    if conflict is not None:
        raise install_error(409, "conflicts-changed", conflict)
    result, created = await install.create_job(api, spec.namespace, spec.release, job.build(spec, image))
    if result == "foreign":
        raise install_error(409, "foreign-job", f"A Job named {job.job_name(spec.release)} exists and was not created by ark-api")
    if result == "deleting":
        raise install_error(503, "busy", "The previous install Job of this item is still being deleted")
    if result == "created" and created is not None:
        await install.started_event(
            api, spec.namespace, created, f"{spec.installed_by or 'ark-api'} started installing {spec.item} from {spec.source}"
        )


@router.post(
    "/{item}",
    status_code=202,
    response_model=MarketplaceInstallRecord,
    responses={409: {"model": MarketplaceInstallError}, 502: {"model": MarketplaceInstallError}, 503: {"model": MarketplaceInstallError}},
)
async def start_marketplace_install(
    request: Request,
    body: MarketplaceInstallRequest,
    namespace: str = Path(pattern=NAMESPACE_PATTERN),
    item: str = Path(pattern=ITEM_PATTERN),
    impersonation: Optional[ImpersonationConfig] = Depends(get_impersonation_config),
) -> MarketplaceInstallRecord:
    timeout = _seconds(POST_TIMEOUT_ENV, DEFAULT_POST_TIMEOUT_SECONDS)
    try:
        async with asyncio.timeout(timeout):
            return await _start(request, namespace, item, body, impersonation)
    except TimeoutError:
        raise install_error(
            503, "busy", f"The install request did not finish within {timeout:g} seconds; check the install state before retrying"
        ) from None
