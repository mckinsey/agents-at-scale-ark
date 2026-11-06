"""Dynamic Kubernetes client that raises on error responses.

``kubernetes_asyncio.dynamic.DynamicClient.request`` calls ``call_api`` with
``_preload_content=False``. The aiohttp REST client only raises
``ApiException`` when it preloads the body, so an error response comes back as
a raw response and ``meta_request`` wraps the Kubernetes ``Status`` in a
``ResourceInstance`` as if the call had worked. ``handle_k8s_errors`` then
never sees the 404, 403, 409 or 422 (issue #3781). Upstream still behaves this
way, so a version bump does not fix it.

``RaisingDynamicClient`` checks the status first and raises the typed
exceptions from ``kubernetes_asyncio.dynamic.exceptions`` (``NotFoundError``,
``ForbiddenError``, ``ConflictError`` and so on), all subclasses of
``ApiException``, with the ``Status`` body attached. Successful responses are
serialised the way ``meta_request`` does it, including the ``serialize`` and
``serializer`` keyword arguments that discovery relies on.
"""
from kubernetes_asyncio.client.rest import ApiException, RESTResponse
from kubernetes_asyncio.dynamic import DynamicClient, ResourceInstance
from kubernetes_asyncio.dynamic.exceptions import api_exception


class RaisingDynamicClient(DynamicClient):
    async def request(self, method, path, body=None, **params):
        serialize_response = params.pop("serialize", True)
        serializer = params.pop("serializer", ResourceInstance)
        resp = await super().request(method, path, body=body, serialize=False, **params)
        if not 200 <= resp.status <= 299:
            data = await resp.read()
            resp.release()
            http_resp = RESTResponse(resp, data.decode("utf-8", errors="replace"))
            raise api_exception(ApiException(http_resp=http_resp))
        if not serialize_response:
            return resp
        return serializer(self, await resp.json())
