"""Emit one ``Impersonate-Group`` header per group at the transport layer.

ark_sdk builds the ``Impersonate-Group`` header as a single comma-joined value
(``",".join(groups)``) in ``client.py`` (``_build_headers``) and ``k8s.py``
(``SecretClient._get_api_client``). It has to: both Kubernetes client libraries
carry headers in a plain ``dict`` (``Configuration.default_headers`` /
``ApiClient`` default headers / per-call ``header_params``), and a dict cannot
hold two values for the same key. A single comma-joined header is read by the API
server as ONE group whose name literally contains commas, so group-based RBAC
silently fails for any user in more than one group.

The lowest common choke point that CAN emit repeated headers is
``RESTClientObject.request``: the async client (``kubernetes_asyncio``) accepts an
aiohttp ``CIMultiDict`` and the sync client (``kubernetes``) accepts a urllib3
``HTTPHeaderDict``, both of which serialise repeated headers correctly. ark uses
BOTH clients — ``kubernetes_asyncio`` for the async paths (``SecretClient``, the
generated context/namespace calls) and the sync ``kubernetes`` client for the
generated resource clients (``versions.py``) — so we patch both.

``apply()`` is idempotent and is invoked automatically when ``ark_sdk.k8s`` is
imported (every client-construction path imports it), so every consumer —
ark-api, executors, the CLI — gets correct multi-group impersonation without any
extra wiring. It is also safe to call explicitly.
"""
import logging

logger = logging.getLogger("ark_sdk")

_HEADER = "Impersonate-Group"


def _split(value):
    return [g.strip() for g in str(value).split(",") if g.strip()]


def _needs_split(headers):
    return (
        headers is not None
        and _HEADER in headers
        and "," in str(headers[_HEADER])
    )


def _patch_async():
    try:
        from multidict import CIMultiDict
        from kubernetes_asyncio.client import rest as arest
    except Exception:
        return
    if getattr(arest.RESTClientObject.request, "_ark_group_patch", False):
        return
    original = arest.RESTClientObject.request

    async def request(self, *args, **kwargs):
        headers = kwargs.get("headers")
        if _needs_split(headers):
            multi = CIMultiDict(headers)
            multi.popall(_HEADER, None)
            for g in _split(headers[_HEADER]):
                multi.add(_HEADER, g)
            kwargs["headers"] = multi
        return await original(self, *args, **kwargs)

    request._ark_group_patch = True
    arest.RESTClientObject.request = request


def _patch_sync():
    try:
        from urllib3 import HTTPHeaderDict
        from kubernetes.client import rest as srest
    except Exception:
        return
    if getattr(srest.RESTClientObject.request, "_ark_group_patch", False):
        return
    original = srest.RESTClientObject.request

    def request(self, *args, **kwargs):
        headers = kwargs.get("headers")
        if _needs_split(headers):
            hh = HTTPHeaderDict()
            for name, value in headers.items():
                if name == _HEADER:
                    continue
                hh.add(name, value)
            for g in _split(headers[_HEADER]):
                hh.add(_HEADER, g)
            kwargs["headers"] = hh
        return original(self, *args, **kwargs)

    request._ark_group_patch = True
    srest.RESTClientObject.request = request


def apply() -> None:
    """Idempotently install the multi-group impersonation patch on both clients."""
    _patch_async()
    _patch_sync()
    logger.debug(
        "multi-group impersonation patch applied (sync + async k8s clients)"
    )
