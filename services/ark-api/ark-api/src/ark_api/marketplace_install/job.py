import os
from dataclasses import dataclass
from typing import Optional

from .constants import (
    CHART_VERSION_ANNOTATION,
    DIGEST_ANNOTATION,
    INSTALL_LABEL,
    INSTALLED_BY_ANNOTATION,
    INSTALLER_SERVICE_ACCOUNT,
    ITEM_ANNOTATION,
    SOURCE_ANNOTATION,
    job_name,
)
from .logs import HELM_CONTAINER

HELM_TIMEOUT_ENV = "MARKETPLACE_INSTALL_HELM_TIMEOUT_SECONDS"
TOTAL_TIMEOUT_ENV = "MARKETPLACE_INSTALL_TOTAL_TIMEOUT_SECONDS"
JOB_DEADLINE_ENV = "MARKETPLACE_INSTALL_JOB_DEADLINE_SECONDS"
IMAGE_ENV = "MARKETPLACE_INSTALL_IMAGE"
IMAGE_PULL_SECRETS_ENV = "MARKETPLACE_INSTALL_IMAGE_PULL_SECRETS"
DEFAULT_HELM_TIMEOUT_SECONDS = 600
DEFAULT_TOTAL_TIMEOUT_SECONDS = 660
DEFAULT_JOB_DEADLINE_SECONDS = 900
TIMEOUT_EXIT_CODE = 124
KILL_AFTER_SECONDS = 10
RUN_AS_USER = 1001
WORK_VOLUME = "work"
WORK_DIR = "/work"


@dataclass(frozen=True)
class InstallSpec:
    namespace: str
    source: str
    item: str
    release: str
    chart_ref: str
    digest: str
    chart_version: str
    plain_http: bool
    installed_by: Optional[str]


def _positive_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


def image() -> Optional[str]:
    value = os.getenv(IMAGE_ENV, "").strip()
    return value or None


def _pull_secrets() -> list[dict]:
    names = [name.strip() for name in os.getenv(IMAGE_PULL_SECRETS_ENV, "").split(",") if name.strip()]
    return [{"name": name} for name in names]


def argv(spec: InstallSpec) -> list[str]:
    helm_timeout = _positive_int(HELM_TIMEOUT_ENV, DEFAULT_HELM_TIMEOUT_SECONDS)
    total_timeout = _positive_int(TOTAL_TIMEOUT_ENV, DEFAULT_TOTAL_TIMEOUT_SECONDS)
    args = [
        "timeout",
        "-k",
        str(KILL_AFTER_SECONDS),
        "--signal=TERM",
        str(total_timeout),
        "helm",
        "install",
        spec.release,
        f"{spec.chart_ref}@{spec.digest}",
        "--namespace",
        spec.namespace,
        "--wait",
        "--timeout",
        f"{helm_timeout}s",
        "--skip-crds",
    ]
    if spec.plain_http:
        args.append("--plain-http")
    if spec.installed_by:
        args += ["--description", f"installed-by={spec.installed_by}"]
    return args


def _annotations(spec: InstallSpec) -> dict[str, str]:
    annotations = {
        SOURCE_ANNOTATION: spec.source,
        ITEM_ANNOTATION: spec.item,
        DIGEST_ANNOTATION: spec.digest,
        CHART_VERSION_ANNOTATION: spec.chart_version,
    }
    if spec.installed_by:
        annotations[INSTALLED_BY_ANNOTATION] = spec.installed_by
    return annotations


def _container(spec: InstallSpec, container_image: str) -> dict:
    return {
        "name": HELM_CONTAINER,
        "image": container_image,
        "command": argv(spec),
        "env": [
            {"name": "HOME", "value": WORK_DIR},
            {"name": "TMPDIR", "value": WORK_DIR},
            {"name": "HELM_CACHE_HOME", "value": f"{WORK_DIR}/helm/cache"},
            {"name": "HELM_CONFIG_HOME", "value": f"{WORK_DIR}/helm/config"},
            {"name": "HELM_DATA_HOME", "value": f"{WORK_DIR}/helm/data"},
        ],
        "securityContext": {
            "allowPrivilegeEscalation": False,
            "capabilities": {"drop": ["ALL"]},
            "readOnlyRootFilesystem": True,
            "runAsNonRoot": True,
        },
        "resources": {
            "requests": {"cpu": "50m", "memory": "64Mi"},
            "limits": {"cpu": "500m", "memory": "256Mi"},
        },
        "volumeMounts": [{"name": WORK_VOLUME, "mountPath": WORK_DIR}],
    }


def build(spec: InstallSpec, container_image: str) -> dict:
    labels = {INSTALL_LABEL: spec.release}
    pod_spec: dict = {
        "serviceAccountName": INSTALLER_SERVICE_ACCOUNT,
        "restartPolicy": "Never",
        "securityContext": {
            "runAsNonRoot": True,
            "runAsUser": RUN_AS_USER,
            "seccompProfile": {"type": "RuntimeDefault"},
        },
        "containers": [_container(spec, container_image)],
        "volumes": [{"name": WORK_VOLUME, "emptyDir": {}}],
    }
    if secrets := _pull_secrets():
        pod_spec["imagePullSecrets"] = secrets
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": job_name(spec.release),
            "namespace": spec.namespace,
            "labels": labels,
            "annotations": _annotations(spec),
        },
        "spec": {
            "backoffLimit": 0,
            "activeDeadlineSeconds": _positive_int(JOB_DEADLINE_ENV, DEFAULT_JOB_DEADLINE_SECONDS),
            "podFailurePolicy": {
                "rules": [
                    {
                        "action": "FailJob",
                        "onExitCodes": {
                            "containerName": HELM_CONTAINER,
                            "operator": "In",
                            "values": [TIMEOUT_EXIT_CODE],
                        },
                    }
                ]
            },
            "template": {
                "metadata": {
                    "labels": labels,
                    "annotations": {"sidecar.istio.io/inject": "false", "linkerd.io/inject": "disabled"},
                },
                "spec": pod_spec,
            },
        },
    }
