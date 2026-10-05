"""Allowlist and identity rule for the generic resource routes.

The generic routes forward a caller-chosen group, version and Kind to the
Kubernetes dynamic client, so on their own they reach anything the identity in
use can reach. Only the tuples the dashboard needs are exposed; everything else
is refused before any Kubernetes call is made.

Writes through these routes can make Argo run containers, so when
authentication is enabled a signed-in user's write must reach Kubernetes as
that user: it needs impersonation and is refused when no user identity is
available. Requests authenticated with an API key, and every request in open
mode, keep running as the service account.
"""

import logging
import os
from typing import Optional

from fastapi import HTTPException, Request

from .constants import AuthMode
from .impersonation_config import ImpersonationSettings

logger = logging.getLogger(__name__)

CORE_GROUP = ""

ALLOWED_GENERIC_RESOURCES: dict[tuple[str, str, str], frozenset[str]] = {
    ("argoproj.io", "v1alpha1", "WorkflowTemplate"): frozenset({"get", "list", "create", "update", "delete"}),
    ("argoproj.io", "v1alpha1", "Workflow"): frozenset({"get", "list", "create"}),
    ("ark.mckinsey.com", "v1alpha1", "Agent"): frozenset({"get"}),
    ("ark.mckinsey.com", "v1alpha1", "Team"): frozenset({"get"}),
    ("ark.mckinsey.com", "v1prealpha1", "ExecutionEngine"): frozenset({"get", "list", "delete"}),
    (CORE_GROUP, "v1", "Service"): frozenset({"list"}),
}

DENIED_DETAIL = "This resource type and operation are not exposed through the generic resources API"

IMPERSONATION_DISABLED_DETAIL = (
    "This operation runs as the signed-in user, but user impersonation is not enabled on the Ark API"
)

NO_USER_IDENTITY_DETAIL = (
    "This operation runs as the signed-in user, but the request carries no user identity"
)


def is_generic_resource_allowed(group: str, version: str, kind: str, verb: str) -> bool:
    return verb in ALLOWED_GENERIC_RESOURCES.get((group, version, kind), frozenset())


def generic_write_identity_denial(request: Request) -> Optional[str]:
    auth_mode = os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN
    if auth_mode == AuthMode.OPEN:
        return None
    if getattr(request.state, "api_key", None) is not None:
        return None
    if not ImpersonationSettings.from_env().enabled:
        return IMPERSONATION_DISABLED_DETAIL
    identity = getattr(request.state, "user_identity", None)
    username = getattr(identity, "username", None)
    if not isinstance(username, str) or not username.strip():
        return NO_USER_IDENTITY_DETAIL
    return None


def require_generic_write_identity(request: Request) -> None:
    denial = generic_write_identity_denial(request)
    if denial is None:
        return
    params = request.path_params
    logger.warning(
        "Denied generic resource write without an end-user identity: method=%r group=%r version=%r kind=%r namespace=%r",
        request.method,
        params.get("group"),
        params.get("version"),
        params.get("kind"),
        request.query_params.get("namespace"),
    )
    raise HTTPException(status_code=403, detail=denial)


class GenericResourceGuard:
    def __init__(self, verb: str, core: bool = False):
        self.verb = verb
        self.core = core

    def __call__(self, request: Request) -> None:
        params = request.path_params
        group = CORE_GROUP if self.core else params.get("group")
        version = params.get("version")
        kind = params.get("kind")
        if (
            group is not None
            and version is not None
            and kind is not None
            and is_generic_resource_allowed(group, version, kind, self.verb)
        ):
            return
        logger.warning(
            "Denied generic resource request: verb=%r group=%r version=%r kind=%r namespace=%r",
            self.verb,
            group,
            version,
            kind,
            request.query_params.get("namespace"),
        )
        raise HTTPException(status_code=403, detail=DENIED_DETAIL)
