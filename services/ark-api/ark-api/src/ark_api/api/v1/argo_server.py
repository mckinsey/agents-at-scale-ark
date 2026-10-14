"""Workflow listing through Argo Server, sorted by start time newest first.

Argo Server is called without credentials (--auth-mode=server) and reads with
its own service account, so callers must authorize against Kubernetes RBAC first.
"""
import logging
import os
import re
from typing import Optional
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

ARGO_SERVER_URL_ENV = "ARGO_SERVER_URL"
ARGO_SERVER_TIMEOUT_SECONDS = 10.0

WORKFLOW_NAME_FILTER_PATTERN = re.compile(r"[a-z0-9.-]+")


def get_argo_server_url() -> str:
    return os.getenv(ARGO_SERVER_URL_ENV, "").rstrip("/")


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
            response = await http_client.get(url, params=params)
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
