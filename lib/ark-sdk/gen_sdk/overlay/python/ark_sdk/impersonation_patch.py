"""Emit one ``Impersonate-Group`` header per group at the transport layer.

ark_sdk stores the impersonated groups as a list under the ``Impersonate-Group``
key of the client's default headers, in ``client.py`` (``_build_headers``) and
``k8s.py`` (``apply_impersonation_headers``). Both Kubernetes client libraries
carry headers in a plain ``dict`` (``ApiClient.default_headers`` / per-call
``header_params``), which cannot hold two values for the same name, but they
pass the list through unchanged down to ``RESTClientObject.request``.

That is the lowest common choke point that CAN emit repeated headers: the async
client (``kubernetes_asyncio``) accepts an aiohttp ``CIMultiDict`` and the sync
client (``kubernetes``) accepts a urllib3 ``HTTPHeaderDict``. ark uses BOTH
clients, so we patch both. Each list element becomes exactly one header with its
value intact: a group name containing a comma (for example an LDAP DN) stays one
group. A plain string value is passed through as a single group.

``apply()`` is idempotent and is invoked automatically when ``ark_sdk.k8s`` is
imported (every client-construction path imports it), so every consumer —
ark-api, executors, the CLI — gets correct multi-group impersonation without any
extra wiring. It is also safe to call explicitly.
"""
import logging

logger = logging.getLogger("ark_sdk")

_HEADER = "Impersonate-Group"


def _group_list(headers):
    if headers is None or _HEADER not in headers:
        return None
    value = headers[_HEADER]
    if isinstance(value, (list, tuple)):
        return [str(g) for g in value]
    return None


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
        groups = _group_list(headers)
        if groups is not None:
            multi = CIMultiDict(
                (name, value) for name, value in headers.items() if name != _HEADER
            )
            for g in groups:
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
        groups = _group_list(headers)
        if groups is not None:
            hh = HTTPHeaderDict()
            for name, value in headers.items():
                if name == _HEADER:
                    continue
                hh.add(name, value)
            for g in groups:
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
