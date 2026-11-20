import logging
from typing import Optional

from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

from ..api.v1.client_utils import get_impersonating_api_client
from .constants import installer_username, policy_names
from .errors import describe_error
from . import gate

logger = logging.getLogger(__name__)

DENY_ACTION = "Deny"
FAIL_POLICY = "Fail"


async def installer_enabled(namespace: str) -> bool:
    installer = ImpersonationConfig(username=installer_username(namespace), groups=[])
    try:
        async with get_impersonating_api_client(installer) as api:
            return await gate.review_allowed(api, namespace, "batch", "jobs", "create", None)
    except ApiException as e:
        if e.status != 403:
            logger.warning("Marketplace installer check failed: %s", describe_error(e))
        return False
    except Exception as e:
        logger.warning("Marketplace installer check failed: %s", describe_error(e))
        return False


async def policy_in_place(namespace: str) -> bool:
    try:
        async with get_impersonating_api_client(None) as api:
            admission = client.AdmissionregistrationV1Api(api)
            ns = await client.CoreV1Api(api).read_namespace(name=namespace)
            labels = ns.metadata.labels or {}
            for name in policy_names(namespace):
                problem = await _pair_problem(admission, name, labels)
                if problem is None:
                    return True
                logger.info("Marketplace install policy %s does not protect the installer: %s", name, problem)
            return False
    except Exception as e:
        logger.warning("Marketplace install policy check failed: %s", describe_error(e))
        return False


async def _pair_problem(admission, name: str, labels: dict) -> Optional[str]:
    binding = await _read_or_none(admission.read_validating_admission_policy_binding, name)
    if binding is None:
        return "binding not found"
    if not _binding_enforces(binding, name):
        return "binding is not a Deny binding of the policy with its name"
    policy = await _read_or_none(admission.read_validating_admission_policy, name)
    if policy is None:
        return "policy not found"
    if policy.spec.failure_policy not in (None, FAIL_POLICY):
        return "policy failurePolicy is not Fail"
    if not (_covers(binding.spec.match_resources, labels) and _covers(policy.spec.match_constraints, labels)):
        return "binding or policy does not cover the namespace"
    return None


def _binding_enforces(binding, policy_name: str) -> bool:
    spec = binding.spec
    if spec.policy_name != policy_name or DENY_ACTION not in (spec.validation_actions or []):
        return False
    return not getattr(spec.match_resources, "resource_rules", None)


async def _read_or_none(read, name: str):
    try:
        return await read(name=name)
    except ApiException as e:
        if e.status == 404:
            return None
        raise


def _covers(match_resources, labels: dict) -> bool:
    if getattr(match_resources, "exclude_resource_rules", None) or not _is_empty(
        getattr(match_resources, "object_selector", None)
    ):
        return False
    selector = getattr(match_resources, "namespace_selector", None)
    if selector is None:
        return True
    for key, value in (selector.match_labels or {}).items():
        if labels.get(key) != value:
            return False
    return all(_requirement_met(r, labels) for r in selector.match_expressions or [])


def _is_empty(selector) -> bool:
    return selector is None or not (selector.match_labels or selector.match_expressions)


def _requirement_met(requirement, labels: dict) -> bool:
    present = requirement.key in labels
    values = requirement.values or []
    if requirement.operator == "In":
        return present and labels[requirement.key] in values
    if requirement.operator == "NotIn":
        return not present or labels[requirement.key] not in values
    if requirement.operator == "Exists":
        return present
    if requirement.operator == "DoesNotExist":
        return not present
    return False
