NAMESPACE_PATTERN = r"^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$"

ARK_GROUP = "ark.mckinsey.com"
INSTALL_RESOURCE = "marketplaceinstalls"
INSTALL_VERB = "create"

INSTALLER_SERVICE_ACCOUNT = "ark-marketplace-installer"

POLICY_NAME_PREFIX = "ark-marketplace-installer-sa-"
BOOTSTRAP_SUFFIX = "-bootstrap"


def installer_username(namespace: str) -> str:
    return f"system:serviceaccount:{namespace}:{INSTALLER_SERVICE_ACCOUNT}"


def policy_names(namespace: str) -> tuple[str, str]:
    name = f"{POLICY_NAME_PREFIX}{namespace}"
    return name, f"{name}{BOOTSTRAP_SUFFIX}"
