from dataclasses import dataclass
from typing import Any, Iterator, Optional

from ark_sdk.secret_scope import SCOPE_LABEL, SHARED_SCOPE, is_reserved_name

from ..models.marketplace_installs import InstallResourceState
from ..services.personal_secret_refs import iter_secret_refs
from .constants import INSTALLER_SERVICE_ACCOUNT

RBAC_GROUP = "rbac.authorization.k8s.io"
SKIP_WEBHOOK_LABEL = "ark.mckinsey.com/skip-webhook-validation"
HOOK_ANNOTATION = "helm.sh/hook"
SERVICE_ACCOUNT_NAME_ANNOTATION = "kubernetes.io/service-account.name"

DANGEROUS_VERBS = {"impersonate", "escalate", "bind"}
DANGEROUS_RESOURCES = {"pods/exec", "pods/attach", "pods/ephemeralcontainers", "serviceaccounts/token"}
WILDCARD_SUBRESOURCES = {"pods", "serviceaccounts", "secrets"}


@dataclass(frozen=True)
class Verdict:
    state: InstallResourceState
    message: str


def group_of(obj: dict) -> str:
    api_version = obj.get("apiVersion", "")
    return api_version.split("/", 1)[0] if "/" in api_version else ""


def metadata(obj: dict) -> dict:
    meta = obj.get("metadata")
    return meta if isinstance(meta, dict) else {}


def _string_map(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def is_hook(obj: dict) -> bool:
    return HOOK_ANNOTATION in _string_map(metadata(obj).get("annotations"))


def rendered_roles(objects: list[dict]) -> set[str]:
    roles = set()
    for obj in objects:
        name = metadata(obj).get("name")
        if obj.get("kind") == "Role" and group_of(obj) == RBAC_GROUP and isinstance(name, str):
            roles.add(name)
    return roles


def _walk(value: Any) -> Iterator[tuple[str, Any]]:
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(key, str):
                yield key.casefold(), item
            yield from _walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk(item)


def _name_of(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(key, str) and key.casefold() == "name" and isinstance(item, str):
                return item
    return None


def referenced_secret_names(obj: dict) -> set[str]:
    names = {name for _, name in iter_secret_refs(obj)}
    for key, value in _walk(obj):
        if key == "secretname" and isinstance(value, str):
            names.add(value)
        elif (key == "secret" or key.endswith("secretref")) and (name := _name_of(value)) is not None:
            names.add(name)
        elif key == "imagepullsecrets" and isinstance(value, list):
            names.update(name for item in value if (name := _name_of(item)) is not None)
    return names


def _uses_installer_account(obj: dict) -> bool:
    for key, value in _walk(obj):
        if key in ("serviceaccountname", "serviceaccount") and value == INSTALLER_SERVICE_ACCOUNT:
            return True
    meta = metadata(obj)
    if obj.get("kind") == "ServiceAccount" and meta.get("name") == INSTALLER_SERVICE_ACCOUNT:
        return True
    return _string_map(meta.get("annotations")).get(SERVICE_ACCOUNT_NAME_ANNOTATION) == INSTALLER_SERVICE_ACCOUNT


def _as_set(value: Any) -> set[str]:
    return {item for item in value if isinstance(item, str)} if isinstance(value, list) else set()


def _dangerous_resource(resource: str) -> bool:
    base, _, subresource = resource.partition("/")
    if base == "*" or resource in DANGEROUS_RESOURCES or base == "secrets":
        return True
    return subresource == "*" and base in WILDCARD_SUBRESOURCES


def _dangerous_rule(rule: Any) -> bool:
    if not isinstance(rule, dict):
        return True
    groups, resources, verbs = _as_set(rule.get("apiGroups")), _as_set(rule.get("resources")), _as_set(rule.get("verbs"))
    if RBAC_GROUP in groups or "*" in groups or "*" in verbs or verbs & DANGEROUS_VERBS:
        return True
    return "" in groups and any(_dangerous_resource(resource) for resource in resources)


def _role_escalates(obj: dict) -> bool:
    rules = obj.get("rules")
    if rules is None:
        return False
    if not isinstance(rules, list):
        return True
    return any(_dangerous_rule(rule) for rule in rules)


def _subject_escalates(subject: Any, namespace: str) -> bool:
    if not isinstance(subject, dict):
        return True
    kind, name = subject.get("kind"), subject.get("name")
    if kind == "ServiceAccount":
        return subject.get("namespace", namespace) != namespace or name == INSTALLER_SERVICE_ACCOUNT
    if kind == "User":
        return not isinstance(name, str) or name.startswith("system:")
    return True


def _binding_escalates(obj: dict, namespace: str, chart_roles: set[str]) -> bool:
    role_ref = _string_map(obj.get("roleRef"))
    if role_ref.get("kind") != "Role" or role_ref.get("name") not in chart_roles:
        return True
    subjects = obj.get("subjects") or []
    return not isinstance(subjects, list) or any(_subject_escalates(s, namespace) for s in subjects)


def _rbac_escalation(obj: dict, namespace: str, chart_roles: set[str]) -> Optional[str]:
    if _uses_installer_account(obj):
        return f"Uses the {INSTALLER_SERVICE_ACCOUNT} ServiceAccount, which is admin of the namespace"
    if group_of(obj) != RBAC_GROUP:
        return None
    kind = obj.get("kind")
    if kind == "Role" and _role_escalates(obj):
        return "Grants RBAC, wildcard, Secret, exec, attach, token or impersonation rights"
    if kind == "RoleBinding" and _binding_escalates(obj, namespace, chart_roles):
        return "Binds a role the chart does not define, or binds it to a subject outside the namespace"
    return None


def _reserved_secret(obj: dict) -> Optional[str]:
    if obj.get("kind") != "Secret" or group_of(obj) != "":
        return None
    meta = metadata(obj)
    name = meta.get("name")
    if isinstance(name, str) and is_reserved_name(name):
        return "Uses a name reserved for personal Secrets"
    scope = _string_map(meta.get("labels")).get(SCOPE_LABEL)
    if scope is not None and scope != SHARED_SCOPE:
        return "Carries a personal Secret scope label"
    return None


def manifest_verdict(
    obj: dict,
    namespace: str,
    chart_roles: set[str],
    namespaced: Optional[bool],
    personal_secrets: set[str],
) -> Optional[Verdict]:
    meta = metadata(obj)
    if obj.get("kind") == "CustomResourceDefinition" and group_of(obj) == "apiextensions.k8s.io":
        return Verdict("crd", "Installs a CustomResourceDefinition, which is cluster-wide")
    if namespaced is False:
        return Verdict("cluster-scoped", "Cluster-scoped objects cannot be installed from a tenant namespace")
    target = meta.get("namespace")
    if target not in (None, "", namespace):
        return Verdict("namespace-mismatch", f"Targets namespace {target}, not {namespace}")
    if SKIP_WEBHOOK_LABEL in _string_map(meta.get("labels")):
        return Verdict("skip-webhook-label", f"Sets {SKIP_WEBHOOK_LABEL}, which skips Ark's validation")
    if (reason := _rbac_escalation(obj, namespace, chart_roles)) is not None:
        return Verdict("rbac-escalation", reason)
    if (reason := _reserved_secret(obj)) is not None:
        return Verdict("reserved-secret", reason)
    for name in sorted(referenced_secret_names(obj)):
        if is_reserved_name(name) or name in personal_secrets:
            return Verdict("personal-secret-ref", f"References the personal Secret {name}")
    return None
