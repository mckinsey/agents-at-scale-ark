import logging
from contextlib import asynccontextmanager
from typing import Optional

from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient

from ark_sdk.impersonation import ImpersonationConfig

from ..models.context import PermissionsResponse

logger = logging.getLogger(__name__)

ARK_API_GROUP = "ark.mckinsey.com"
WILDCARD = "*"


@asynccontextmanager
async def _impersonating_api_client(impersonation: ImpersonationConfig):
    async with ApiClient() as api:
        api.set_default_header("Impersonate-User", impersonation.username)
        if impersonation.groups:
            api.set_default_header(
                "Impersonate-Group", ",".join(impersonation.groups)
            )
        yield api


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

    try:
        async with _impersonating_api_client(impersonation) as api:
            authz = client.AuthorizationV1Api(api)
            review = await authz.create_self_subject_rules_review(
                client.V1SelfSubjectRulesReview(
                    spec=client.V1SelfSubjectRulesReviewSpec(namespace=namespace)
                )
            )
    except Exception as e:
        logger.warning("SelfSubjectRulesReview failed: %s", e)
        return PermissionsResponse(status="unavailable", reason=str(e))

    status = review.status
    if status is None:
        return PermissionsResponse(
            status="unavailable", reason="No review status returned"
        )

    if status.incomplete or status.evaluation_error:
        return PermissionsResponse(
            status="unavailable",
            reason=status.evaluation_error or "Authorization evaluation incomplete",
        )

    return PermissionsResponse(
        status="ok",
        rules=build_ark_rules(status.resource_rules),
    )
