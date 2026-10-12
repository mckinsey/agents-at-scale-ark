"""Allowlist for the generic resource routes.

The generic routes forward a caller-chosen group, version and Kind to the
Kubernetes dynamic client, so on their own they reach anything the identity in
use can reach. Only the tuples the dashboard needs are exposed; everything else
is refused before any Kubernetes call is made.
"""

import logging

from fastapi import HTTPException, Request

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


def is_generic_resource_allowed(group: str, version: str, kind: str, verb: str) -> bool:
    return verb in ALLOWED_GENERIC_RESOURCES.get((group, version, kind), frozenset())


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

