import logging
from typing import Optional

from kubernetes_asyncio import client

from ark_sdk.impersonation import ImpersonationConfig

from ..models.context import PermissionsResponse

logger = logging.getLogger(__name__)

ARK_API_GROUP = "ark.mckinsey.com"
WILDCARD = "*"

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
    except Exception as e:
        logger.warning("SelfSubjectRulesReview failed: %s", e)
        return PermissionsResponse(status="unavailable", reason=UNAVAILABLE_REASON)

    status = review.status
    if status is None:
        logger.warning("SelfSubjectRulesReview returned no status")
        return PermissionsResponse(status="unavailable", reason=UNAVAILABLE_REASON)

    if status.incomplete or status.evaluation_error:
        logger.warning(
            "SelfSubjectRulesReview incomplete: %s", status.evaluation_error
        )
        return PermissionsResponse(status="unavailable", reason=UNAVAILABLE_REASON)

    return PermissionsResponse(
        status="ok",
        rules=build_ark_rules(status.resource_rules),
    )
