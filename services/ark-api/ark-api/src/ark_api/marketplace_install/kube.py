from typing import Any, Optional

from kubernetes_asyncio.client.rest import ApiException

JSON = "application/json"


async def get_json(
    api, path: str, path_params: dict[str, str], query_params: Optional[list[tuple[str, str]]] = None, accept: str = JSON
) -> Any:
    return await api.call_api(
        path,
        "GET",
        path_params=path_params,
        query_params=query_params or [],
        header_params={"Accept": accept},
        auth_settings=["BearerToken"],
        response_types_map={200: "object"},
        _return_http_data_only=True,
    )


async def get_or_none(api, path: str, path_params: dict[str, str]) -> Optional[dict]:
    try:
        found = await get_json(api, path, path_params)
    except ApiException as e:
        if e.status == 404:
            return None
        raise
    return found if isinstance(found, dict) else None


def items_of(data: Any) -> list[dict]:
    items = data.get("items") if isinstance(data, dict) else None
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def field(obj: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(key)
    return obj
