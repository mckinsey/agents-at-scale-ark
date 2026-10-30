"""Keep personal Secrets out of every resource field except Query MCP header overrides."""
import logging
from typing import Any, Callable, Dict, Iterator, Optional, Tuple, Union

from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.k8s import get_context, read_secret_labels
from ark_sdk.secret_scope import SecretScope, is_reserved_name

logger = logging.getLogger(__name__)

PERSONAL_SECRET_REF_ERROR = (
    "This resource references a Secret it cannot use. Personal secrets can only be referenced "
    "from MCP server header overrides of a Query that sets a labelSelector."
)
SECRET_REF_CHECK_ERROR = "Could not check the Secrets this resource references"

SecretRefPath = Tuple[Union[str, int], ...]
SecretRefAllowed = Callable[[SecretRefPath, Dict[str, Any]], bool]

_SECRET_KEY_REF = "secretKeyRef"
_QUERY_OVERRIDE_HEADER_TAIL = ("value", "valueFrom", _SECRET_KEY_REF)


def iter_secret_refs(obj: Any, path: SecretRefPath = ()) -> Iterator[Tuple[SecretRefPath, str]]:
    """Yield (path, name) for every secretKeyRef name in obj; key case is ignored so no spelling slips past."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            key_path = path + (key,)
            if isinstance(key, str) and key.casefold() == _SECRET_KEY_REF.casefold() and isinstance(value, dict):
                for field, name in value.items():
                    if isinstance(field, str) and field.casefold() == "name" and isinstance(name, str):
                        yield key_path, name
            else:
                yield from iter_secret_refs(value, key_path)
    elif isinstance(obj, list):
        for index, item in enumerate(obj):
            yield from iter_secret_refs(item, path + (index,))


def _has_label_selector(selector: Any) -> bool:
    return isinstance(selector, dict) and bool(selector.get("matchLabels") or selector.get("matchExpressions"))


def query_override_header_allows(path: SecretRefPath, spec: Dict[str, Any]) -> bool:
    """Allow only overrides[i].headers[j].value.valueFrom.secretKeyRef of an mcpserver override with a labelSelector."""
    if len(path) != 7 or path[0] != "overrides" or path[2] != "headers" or path[4:] != _QUERY_OVERRIDE_HEADER_TAIL:
        return False
    override_index, header_index = path[1], path[3]
    if not isinstance(override_index, int) or not isinstance(header_index, int):
        return False
    overrides = spec.get("overrides")
    if not isinstance(overrides, list) or override_index >= len(overrides):
        return False
    override = overrides[override_index]
    return (
        isinstance(override, dict)
        and override.get("resourceType") == "mcpserver"
        and _has_label_selector(override.get("labelSelector"))
    )


def no_personal_refs(path: SecretRefPath, spec: Dict[str, Any]) -> bool:
    return False


async def _read_labels(namespace: str, name: str) -> Optional[Dict[str, str]]:
    try:
        return await read_secret_labels(namespace, name)
    except ApiException as e:
        logger.error(f"Failed to read labels of a referenced Secret in namespace {namespace}: {e.status} {e.reason}")
        raise HTTPException(status_code=500, detail=SECRET_REF_CHECK_ERROR) from None


async def enforce_personal_secret_refs(
    spec: Dict[str, Any],
    *,
    namespace: Optional[str],
    caller_scope: SecretScope,
    allow: SecretRefAllowed = no_personal_refs,
) -> None:
    """Reject spec with 422 unless every reserved-name ref is a shared Ark Secret or the caller's own in an allowed field.

    Labels are read as the service account: the outcome is ark-api's decision and
    must not depend on the caller's RBAC on Secrets.
    """
    namespace = namespace or get_context()["namespace"]
    labels_by_name: Dict[str, Optional[Dict[str, str]]] = {}
    for path, name in iter_secret_refs(spec):
        if not is_reserved_name(name):
            continue
        if name not in labels_by_name:
            labels_by_name[name] = await _read_labels(namespace, name)
        labels = labels_by_name[name]
        if SecretScope().contains(labels):
            continue
        if allow(path, spec) and caller_scope.owns(labels):
            continue
        raise HTTPException(status_code=422, detail=PERSONAL_SECRET_REF_ERROR)
