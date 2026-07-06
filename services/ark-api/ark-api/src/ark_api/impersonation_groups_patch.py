"""Fix multi-group impersonation for the Kubernetes clients ark uses.

ark_sdk and ark-api set the ``Impersonate-Group`` header as a single
comma-joined value (``",".join(groups)``). Both Kubernetes client libraries
store headers in a plain dict (one value per name), so they emit a single
comma-joined header — which the API server reads as ONE group with a comma in
its name. Group-based RBAC therefore silently fails for any user in more than
one group.

The comma-join lives in ark_sdk's hand-written overlay — ``client.py``
(``_build_headers``) and ``k8s.py`` (``SecretClient``) — not in generated code.
Fixing it there is the right long-term home, but it can't emit repeated headers
on its own: both clients funnel headers through a plain ``dict`` (``default_headers``
/ per-call ``header_params``), which cannot hold two values for the same name. The
lowest common choke point that CAN is ``RESTClientObject.request`` (aiohttp accepts
a ``CIMultiDict`` and urllib3 an ``HTTPHeaderDict``, both of which emit repeated
headers). ark uses BOTH clients — ``kubernetes_asyncio`` for the ``/v1/context``
preflight & namespaces, and the sync ``kubernetes`` client for the resource
endpoints via ``with_ark_client`` — so we patch both.

The canonical fix now lives in ark_sdk itself (``ark_sdk.impersonation_patch``),
auto-applied when ``ark_sdk.k8s`` is imported, so every consumer (executors, CLI,
...) benefits — not just ark-api. main.py prefers that module and only falls back
to this bundled copy for older ark_sdk releases that predate it. This shim can be
deleted once ark-api depends on an ark_sdk release that includes the fix.

Import and call ``apply()`` once at startup.
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
