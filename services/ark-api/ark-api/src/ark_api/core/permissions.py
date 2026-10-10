import logging
import os
from typing import Optional

from kubernetes_asyncio import client

from ark_sdk.impersonation import ImpersonationConfig

from ..models.context import PermissionsResponse

logger = logging.getLogger(__name__)

ARK_API_GROUP = "ark.mckinsey.com"
WILDCARD = "*"

# Resources the dashboard access gate requires the user to be able to list.
# Kept in sync with ESSENTIAL_RESOURCES in ark-dashboard's lib/permissions.ts.
# Used only for the access-review fallback below, so the fallback returns
# exactly what the gate needs to render the app or "Access denied".
ESSENTIAL_RESOURCES = ("agents", "models", "queries", "teams", "tools")
ESSENTIAL_VERB = "list"

# Resources the dashboard's read-only gate treats as "editing". Deliberately
# separate from ESSENTIAL_RESOURCES (which is a `list` gate tied to
# lib/permissions.ts) so the two uses don't drift. `queries` is excluded on
# purpose: chat creates a Query, so a view-only "can chat" user would otherwise
# come back editable and get the click-then-403 dashboard this gate exists to
# prevent. All entries live in ARK_API_GROUP so the SubjectAccessReview below
# can check them with a single group.
EDITABLE_RESOURCES = (
    "agents",
    "models",
    "teams",
    "tools",
    "mcpservers",
    "a2aservers",
    "executionengines",
)
CREATE_VERB = "create"

# Returned to the client when permissions cannot be determined. The underlying
# cause (exception text, evaluation errors) is logged server-side rather than
# echoed back, so internal details are not exposed to callers.
UNAVAILABLE_REASON = "Unable to evaluate permissions"


def build_ark_rules(resource_rules) -> dict[str, list[str]]:
    rules: dict[str, set[str]] = {}
    for rule in resource_rules or []:
        api_groups = rule.api_groups or []
        if ARK_API_GROUP not in api_groups and WILDCARD not in api_groups:
            continue
        for resource in rule.resources or []:
            verbs = rules.setdefault(resource, set())
            verbs.update(rule.verbs or [])
    return {resource: sorted(verbs) for resource, verbs in rules.items()}


async def get_ark_permissions(
    impersonation: Optional[ImpersonationConfig],
    namespace: str,
) -> PermissionsResponse:
    if impersonation is None:
        # Open mode performs no authentication, so there is never an identity to
        # impersonate. That is not an error — it means access is unrestricted.
        # Report full permissions so the dashboard's access gate renders the app
        # instead of "Cluster unavailable" when the dashboard runs in sso mode
        # against an open ark-api. In auth-enabled modes a missing identity is
        # still treated as "cannot evaluate".
        auth_mode = os.getenv("AUTH_MODE", "").lower() or "open"
        if auth_mode == "open":
            return PermissionsResponse(status="ok", rules={WILDCARD: [WILDCARD]})
        return PermissionsResponse(
            status="unavailable",
            reason="No user identity to evaluate permissions",
        )

    # Imported lazily: client_utils lives under api.v1, whose package __init__
    # imports this module's caller (namespaces), so a top-level import here is a
    # circular import.
    from ..api.v1.client_utils import get_impersonating_api_client

    try:
        async with get_impersonating_api_client(impersonation) as api:
            authz = client.AuthorizationV1Api(api)
            review = await authz.create_self_subject_rules_review(
                client.V1SelfSubjectRulesReview(
                    spec=client.V1SelfSubjectRulesReviewSpec(namespace=namespace)
                )
            )
            status = review.status
            if status is not None and not (
                status.incomplete or status.evaluation_error
            ):
                return PermissionsResponse(
                    status="ok",
                    rules=build_ark_rules(status.resource_rules),
                )

            # The authorizer could not enumerate a complete rule set. This is
            # expected on clusters whose authorization chain includes a webhook
            # authorizer (e.g. EKS), which answers concrete access decisions but
            # not rule enumeration. Fall back to explicit access reviews, which
            # every authorizer can answer, instead of reporting the whole
            # authorization service as unavailable.
            logger.info(
                "SelfSubjectRulesReview incomplete (%s); falling back to access reviews",
                None if status is None else status.evaluation_error,
            )
            rules = await _access_review_rules(authz, namespace)
            return PermissionsResponse(status="ok", rules=rules)
    except Exception as e:
        logger.warning("Permission evaluation failed: %s", e)
        return PermissionsResponse(status="unavailable", reason=UNAVAILABLE_REASON)


async def _access_review_rules(authz, namespace: str) -> dict[str, list[str]]:
    rules: dict[str, list[str]] = {}
    for resource in ESSENTIAL_RESOURCES:
        if await _can_i(authz, namespace, resource, ESSENTIAL_VERB):
            rules[resource] = [ESSENTIAL_VERB]
    return rules


async def _can_i(authz, namespace: str, resource: str, verb: str) -> bool:
    review = await authz.create_self_subject_access_review(
        client.V1SelfSubjectAccessReview(
            spec=client.V1SelfSubjectAccessReviewSpec(
                resource_attributes=client.V1ResourceAttributes(
                    namespace=namespace,
                    group=ARK_API_GROUP,
                    resource=resource,
                    verb=verb,
                )
            )
        )
    )
    return bool(review.status and review.status.allowed)


def can_edit_from_rules(rules: dict[str, list[str]]) -> Optional[bool]:
    """Derive the edit decision from an already-fetched rule map, or None.

    Returns True/False when `rules` came from a complete SelfSubjectRulesReview
    (so it carries every verb the user holds), and None when it cannot answer —
    either because it is empty or because every verb present is `list`, which is
    the shape the access-review fallback produces (list-only) and so cannot tell
    us about `create`. A None result means the caller must fall back to explicit
    create access reviews.
    """
    wildcard_verbs = rules.get(WILDCARD, [])
    if WILDCARD in wildcard_verbs or CREATE_VERB in wildcard_verbs:
        return True

    seen = {verb for verbs in rules.values() for verb in verbs}
    # No verbs at all, or only `list` (the access-review fallback shape): the map
    # is not authoritative for create, so defer to explicit access reviews.
    if not seen or seen <= {ESSENTIAL_VERB}:
        return None

    for resource in EDITABLE_RESOURCES:
        verbs = rules.get(resource, [])
        if CREATE_VERB in verbs or WILDCARD in verbs:
            return True
    return False


async def user_can_edit(
    impersonation: ImpersonationConfig,
    namespace: str,
    rules: Optional[dict[str, list[str]]] = None,
) -> bool:
    """Whether the impersonated user may write ARK resources in the namespace.

    A namespace-wide "can edit" signal for the dashboard's read-only gate:
    True if the user can `create` at least one editable ARK resource.

    Fast path: when `rules` from a complete SelfSubjectRulesReview are supplied
    (as /v1/context already fetches them), the create decision is read straight
    from them — no extra API calls. Only when the rules cannot answer (empty or
    list-only, e.g. the EKS webhook-authorizer fallback) does this issue
    SubjectAccessReviews, a concrete yes/no every authorizer answers.

    Fails OPEN (returns True) if the check itself errors: the dashboard then
    shows controls enabled and ark-api still enforces RBAC on the real write —
    better than falsely locking out a user who actually has access.
    """
    if rules is not None:
        decision = can_edit_from_rules(rules)
        if decision is not None:
            return decision

    from ..api.v1.client_utils import get_impersonating_api_client

    try:
        async with get_impersonating_api_client(impersonation) as api:
            authz = client.AuthorizationV1Api(api)
            for resource in EDITABLE_RESOURCES:
                if await _can_i(authz, namespace, resource, CREATE_VERB):
                    return True
            return False
    except Exception as e:
        logger.warning("Edit-permission check failed: %s", e)
        return True
