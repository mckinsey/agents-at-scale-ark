import hashlib

NAMESPACE_PATTERN = r"^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$"

ARK_GROUP = "ark.mckinsey.com"
INSTALL_RESOURCE = "marketplaceinstalls"
INSTALL_VERB = "create"

INSTALLER_SERVICE_ACCOUNT = "ark-marketplace-installer"

POLICY_NAME_PREFIX = "ark-marketplace-installer-sa-"
BOOTSTRAP_SUFFIX = "-bootstrap"

LOCK_NAME = "marketplace-install-lock"
INSTALL_LABEL = "ark.mckinsey.com/marketplace-install"
SOURCE_ANNOTATION = "ark.mckinsey.com/marketplace-install-source"
ITEM_ANNOTATION = "ark.mckinsey.com/marketplace-install-item"
DIGEST_ANNOTATION = "ark.mckinsey.com/marketplace-install-digest"
CHART_VERSION_ANNOTATION = "ark.mckinsey.com/marketplace-install-chart-version"
INSTALLED_BY_ANNOTATION = "ark.mckinsey.com/marketplace-install-installed-by"
JOB_PREFIX = "marketplace-install-"
MAX_NAME_LENGTH = 63
NAME_HASH_LENGTH = 8


def installer_username(namespace: str) -> str:
    return f"system:serviceaccount:{namespace}:{INSTALLER_SERVICE_ACCOUNT}"


def policy_names(namespace: str) -> tuple[str, str]:
    name = f"{POLICY_NAME_PREFIX}{namespace}"
    return name, f"{name}{BOOTSTRAP_SUFFIX}"


def job_name(release: str) -> str:
    name = f"{JOB_PREFIX}{release}"
    if len(name) <= MAX_NAME_LENGTH:
        return name
    suffix = hashlib.sha256(release.encode()).hexdigest()[:NAME_HASH_LENGTH]
    return f"{name[: MAX_NAME_LENGTH - NAME_HASH_LENGTH - 1].rstrip('-')}-{suffix}"
