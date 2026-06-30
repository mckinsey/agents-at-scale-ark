"""Fix multi-group impersonation for the Kubernetes clients ark uses.

ark_sdk and ark-api set the ``Impersonate-Group`` header as a single
comma-joined value (``",".join(groups)``). Both Kubernetes client libraries
store headers in a plain dict (one value per name), so they emit a single
comma-joined header — which the API server reads as ONE group with a comma in
its name. Group-based RBAC therefore silently fails for any user in more than
one group.

ark uses BOTH clients:
  * ``kubernetes_asyncio`` — the ``/v1/context`` permission preflight & namespaces
  * ``kubernetes`` (sync)  — the resource endpoints (agents/models/teams/...) via
    ark_sdk's generated ``with_ark_client``

Rather than touch every generated call site, we patch the single choke point each
library funnels through — ``RESTClientObject.request`` — to split a comma-joined
``Impersonate-Group`` back into one repeated header per group. aiohttp
(``CIMultiDict``) and urllib3 (``HTTPHeaderDict``) both emit repeated headers.

Import and call ``apply()`` once at startup (see main.py).
"""
import logging

logger = logging.getLogger("ark-api")

_HEADER = "Impersonate-Group"


def _split(value):
    return [g.strip() for g in value.split(",") if g.strip()]


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
        if headers is not None and _HEADER in headers and "," in str(headers[_HEADER]):
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
        if headers is not None and _HEADER in headers and "," in str(headers[_HEADER]):
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
    logger.info("multi-group impersonation patch applied (sync + async k8s clients)")
