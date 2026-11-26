import logging
from typing import Optional

from kubernetes_asyncio import client

from ..services.sensitive_data_filter import _redact_string
from .errors import describe_error
from .helm import CONTROL_CHARS
from .kube import field
from .state import job_pods

logger = logging.getLogger(__name__)

HELM_CONTAINER = "helm"
LOG_TAIL_LINES = 100
LOG_LIMIT_BYTES = 16384


def clean_log(text: str) -> str:
    return _redact_string(CONTROL_CHARS.sub("", text))


def _newest(pods: list[dict]) -> Optional[dict]:
    named = [pod for pod in pods if isinstance(field(pod, "metadata", "name"), str)]
    return max(named, key=lambda pod: str(field(pod, "metadata", "creationTimestamp") or ""), default=None)


async def job_log(api, namespace: str, job: dict) -> Optional[str]:
    try:
        pod = _newest(await job_pods(api, namespace, job))
        if pod is None:
            return None
        text = await client.CoreV1Api(api).read_namespaced_pod_log(
            field(pod, "metadata", "name"),
            namespace,
            container=HELM_CONTAINER,
            tail_lines=LOG_TAIL_LINES,
            limit_bytes=LOG_LIMIT_BYTES,
        )
    except Exception as e:
        logger.warning("Reading the marketplace install log failed: %s", describe_error(e))
        return None
    return clean_log(text) if isinstance(text, str) else None
