"""Workflow listing through Argo Server, sorted by start time newest first.

Argo Server is called with the token in ARGO_SERVER_TOKEN_FILE when set, and
otherwise without credentials (--auth-mode=server), reading with its own service
account. Either way callers must authorize against Kubernetes RBAC first.
"""
import logging
import os
import re
from typing import Optional
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

ARGO_SERVER_URL_ENV = "ARGO_SERVER_URL"
ARGO_SERVER_TOKEN_FILE_ENV = "ARGO_SERVER_TOKEN_FILE"
ARGO_SERVER_TIMEOUT_SECONDS = 10.0

WORKFLOW_NAME_FILTER_PATTERN = re.compile(r"[a-z0-9.-]+")

# Argo Workflows 4.1.0 auto-labels every Workflow with its originating
# WorkflowTemplate, including ones created via spec.workflowTemplateRef through
# the Kubernetes API rather than Argo's own submit API. Below this version the
# label is missing and template filtering relies on a post-fetch workaround.
MINIMUM_SUPPORTED_VERSION = (4, 1, 0)

_VERSION_PATTERN = re.compile(r"v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


def get_argo_server_url() -> str:
    return os.getenv(ARGO_SERVER_URL_ENV, "").rstrip("/")


def _auth_headers() -> dict:
    token_file = os.getenv(ARGO_SERVER_TOKEN_FILE_ENV, "")
    if not token_file:
        return {}
    with open(token_file) as f:
        return {"Authorization": f"Bearer {f.read().strip()}"}


async def get_argo_server_version(base_url: str) -> Optional[str]:
    """Fetch the Argo Server version string, or None if it cannot be determined.

    Best effort: system info must not fail because of what Argo Server returns.
    """
    if not base_url:
        return None
    url = f"{base_url}/api/v1/version"
    try:
        async with httpx.AsyncClient(timeout=ARGO_SERVER_TIMEOUT_SECONDS) as http_client:
            response = await http_client.get(url, headers=_auth_headers())
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, httpx.InvalidURL, ValueError) as e:
        logger.warning(f"Argo Server version check failed: {e}")
        return None
    version = data.get("version") if isinstance(data, dict) else None
    if not isinstance(version, str):
        logger.warning("Argo Server version check returned an unexpected response body")
        return None
    return version


def is_version_supported(version: Optional[str]) -> Optional[bool]:
    """Compare an Argo Server version against MINIMUM_SUPPORTED_VERSION.

    Returns None when the version is missing or unparseable, so callers can
    distinguish "known unsupported" from "unknown" rather than guessing. A
    pre-release (e.g. "4.1.0-rc1") is never supported, regardless of its
    numeric component, since it has no guarantee of the stable release's
    auto-labeling behavior.
    """
    if not version:
        return None
    match = _VERSION_PATTERN.match(version)
    if not match:
        return None
    major, minor, patch, prerelease = match.groups()
    if prerelease:
        return False
    return (int(major), int(minor), int(patch)) >= MINIMUM_SUPPORTED_VERSION


def _workflow_list(
    items: list,
    continue_token: Optional[str] = None,
    remaining_item_count: Optional[int] = None,
) -> dict:
    metadata = {"continue": continue_token} if continue_token else {}
    if remaining_item_count is not None:
        metadata["remainingItemCount"] = remaining_item_count
    return {
        "apiVersion": "argoproj.io/v1alpha1",
        "kind": "WorkflowList",
        "metadata": metadata,
        "items": items,
    }


async def list_workflows(
    base_url: str,
    namespace: str,
    label_selector: Optional[str],
    name_contains: Optional[str],
    limit: Optional[int],
    offset: int,
) -> Optional[dict]:
    """List workflows from Argo Server, newest first.

    Argo Server (>= v3.6) selects each page from its in-memory store ordered by
    start time, so page membership is global. It then re-sorts every page by
    finish time; sorting the page by start time again restores the global order.

    Returns a WorkflowList shaped like the Kubernetes one, with
    metadata.continue set to the next offset when more items exist and
    metadata.remainingItemCount set when the list is paginated. Returns
    None when Argo Server cannot serve the request, so the caller can fall back
    to the Kubernetes API.
    """
    params = {"listOptions.continue": str(offset)}
    field_selectors = []
    if label_selector:
        params["listOptions.labelSelector"] = label_selector
    if name_contains:
        name = name_contains.lower()
        if not WORKFLOW_NAME_FILTER_PATTERN.fullmatch(name):
            return _workflow_list([], remaining_item_count=0 if limit else None)
        field_selectors.append(f"metadata.name={name}")
        params["nameFilter"] = "Contains"
    if limit:
        params["listOptions.limit"] = str(limit)
        field_selectors.append("ext.showRemainingItemCount=true")
    if field_selectors:
        params["listOptions.fieldSelector"] = ",".join(field_selectors)

    url = f"{base_url}/api/v1/workflows/{quote(namespace, safe='')}"
    try:
        async with httpx.AsyncClient(timeout=ARGO_SERVER_TIMEOUT_SECONDS) as http_client:
            response = await http_client.get(url, params=params, headers=_auth_headers())
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"Argo Server workflow list failed, falling back to the Kubernetes API: {e}")
        return None

    items = sorted(body.get("items") or [], key=_started_at, reverse=True)
    remaining = int((body.get("metadata") or {}).get("remainingItemCount") or 0)
    if not limit:
        return _workflow_list(items)
    next_offset = str(offset + len(items)) if remaining > 0 else None
    return _workflow_list(items, next_offset, remaining)


def _started_at(workflow: dict) -> str:
    return (workflow.get("status") or {}).get("startedAt") or ""


async def find_archived_workflow_uid(
    base_url: str,
    namespace: str,
    workflow_name: str,
) -> Optional[str]:
    url = f"{base_url}/api/v1/archived-workflows"
    params = {
        "namespace": namespace,
        "listOptions.fieldSelector": f"metadata.name={workflow_name}",
        "nameFilter": "Exact",
    }
    try:
        async with httpx.AsyncClient(timeout=ARGO_SERVER_TIMEOUT_SECONDS) as http_client:
            response = await http_client.get(url, params=params, headers=_auth_headers())
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning(f"Argo Server archived workflow lookup failed for {workflow_name}: {e}")
        return None
    items = body.get("items") or []
    if not items:
        return None
    return (items[0].get("metadata") or {}).get("uid") or None


async def get_workflow_log(
    base_url: str,
    namespace: str,
    workflow_name: str,
    node_id: str,
    container: str = "main",
    archived_uid: Optional[str] = None,
) -> Optional[str]:
    """Fetch a workflow node's ARCHIVED log through Argo Server's artifact endpoint.

    When the pod is gone, the live pod-log streaming endpoint serves nothing, so
    we read the ``{container}-logs`` artifact (e.g. from S3) that ``archiveLogs:
    true`` uploaded for the node. This is the durable fallback for the Kubernetes
    pod-log API, which only sees logs the kubelet still retains on the node.

    Returns the raw log text, or None when Argo Server has no archived log for
    the node (so the caller can degrade to the "pod deleted" message).
    """
    artifact = f"{container}-logs"
    if archived_uid:
        workflow_path = f"archived-workflows/{quote(archived_uid, safe='')}"
    else:
        workflow_path = f"workflows/{quote(workflow_name, safe='')}"
    url = (
        f"{base_url}/artifact-files/{quote(namespace, safe='')}"
        f"/{workflow_path}"
        f"/{quote(node_id, safe='')}/outputs/{quote(artifact, safe='')}"
    )
    try:
        async with httpx.AsyncClient(timeout=ARGO_SERVER_TIMEOUT_SECONDS) as http_client:
            response = await http_client.get(url, headers=_auth_headers())
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        # A 404 just means nothing was archived for this node — the normal case
        # for workflows that ran before archiveLogs was enabled. Don't shout.
        if e.response.status_code == 404:
            logger.debug(f"No archived log for {workflow_name}/{node_id}")
        else:
            logger.warning(
                f"Argo Server archived-log fetch failed for {workflow_name}/{node_id}: {e}"
            )
        return None
    except httpx.HTTPError as e:
        logger.warning(
            f"Argo Server archived-log fetch failed for {workflow_name}/{node_id}: {e}"
        )
        return None

    return response.text
