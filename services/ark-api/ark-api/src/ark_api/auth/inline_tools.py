"""Inline Tool authoring guard.

Inline authoring stores executable code, so it must reach Kubernetes as the end
user and be admitted (or denied) as that user. Persisting it under ark-api's
shared service account would make the author permission meaningless, which is
why this is the one write path that refuses the ordinary service-account route.

The guard is called from inside the endpoint rather than from the error
decorator: the impersonation fallback retries the endpoint with
``impersonation=None``, so re-evaluating it there is what stops a denied inline
write from succeeding as the service account.
"""

from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException

from ark_sdk.impersonation import ImpersonationConfig

from .impersonation_config import ImpersonationSettings

INLINE_TYPE = "inline"

_DETAIL = (
    "Inline tool authoring requires an authenticated end-user identity with "
    "impersonation enabled: inline source is never stored under ark-api's "
    "service account"
)


def spec_is_inline(spec: Mapping[str, Any] | None) -> bool:
    """True when a Tool spec is, or carries, inline configuration."""
    if not isinstance(spec, Mapping):
        return False
    return spec.get("type") == INLINE_TYPE or spec.get("inline") is not None


def is_ark_tool(group: str | None, kind: str | None) -> bool:
    """True for the ark Tool resource on the generic resource routes."""
    return (group or "").lower() == "ark.mckinsey.com" and (kind or "").lower() in (
        "tool",
        "tools",
    )


def require_inline_authoring_identity(
    impersonation: ImpersonationConfig | None,
    *specs: Mapping[str, Any] | None,
) -> None:
    """Reject an inline authoring write that has no end-user identity.

    Pass both the stored and the submitted spec on updates: a write that removes
    inline source is an inline spec change too.
    """
    if not any(spec_is_inline(spec) for spec in specs):
        return

    settings = ImpersonationSettings.from_env()
    if not settings.enabled:
        raise HTTPException(
            status_code=403, detail=_DETAIL + " (impersonation is disabled)"
        )

    if impersonation is None or not (impersonation.username or "").strip():
        raise HTTPException(status_code=403, detail=_DETAIL)
