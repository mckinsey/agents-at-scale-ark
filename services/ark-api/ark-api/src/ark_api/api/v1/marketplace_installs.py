import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Request

from ark_sdk.impersonation import ImpersonationConfig

from ...auth.dependencies import get_impersonation_config
from ...marketplace_install import capability, catalog, events, gate, helm, logs, preview, preview_cache, state
from ...marketplace_install.constants import NAMESPACE_PATTERN, installer_username
from ...marketplace_install.errors import install_error
from ...models.marketplace_installs import (
    CapabilityReason,
    MarketplaceInstallCapability,
    MarketplaceInstallList,
    MarketplaceInstallPreview,
    MarketplaceInstallPreviewRequest,
    MarketplaceInstallRecord,
    MarketplaceInstallResource,
)
from .client_utils import get_impersonating_api_client

ITEM_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$"
SOURCE_PATTERN = r"^[-._a-zA-Z0-9]+$"
LOG_STATES = {"installing", "failed", "timed-out"}
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


def _preview_timeout() -> float:
    try:
        value = float(os.getenv(PREVIEW_TIMEOUT_ENV, ""))
    except ValueError:
        return DEFAULT_PREVIEW_TIMEOUT_SECONDS
    return value if value > 0 else DEFAULT_PREVIEW_TIMEOUT_SECONDS


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


@router.post("/{item}/preview", response_model=MarketplaceInstallPreview)
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
