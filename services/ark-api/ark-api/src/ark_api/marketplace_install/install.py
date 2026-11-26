import logging
from datetime import datetime, timezone
from typing import Literal, Optional

import aiohttp
from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException

from .checks import ObjectRef
from .errors import describe_error
from .kube import field, get_or_none
from .state import JOB_PATH, job_complete, our_job, read_job

logger = logging.getLogger(__name__)

STARTED_REASON = "MarketplaceInstallStarted"
EVENT_SOURCE = "ark-api"
JobCreation = Literal["created", "ours", "deleting", "foreign"]


def object_path(ref: ObjectRef) -> str:
    prefix = "/api" if "/" not in ref.api_version else "/apis"
    return f"{prefix}/{ref.api_version}/namespaces/{{namespace}}/{{plural}}/{{name}}"


async def existing_conflict(api, namespace: str, objects: tuple[ObjectRef, ...]) -> Optional[str]:
    for ref in objects:
        params = {"namespace": namespace, "plural": ref.plural, "name": ref.name}
        try:
            found = await get_or_none(api, object_path(ref), params)
        except ApiException as e:
            return f"Could not check {ref.kind} {ref.name}: {e.status} {e.reason}"
        except aiohttp.ClientError:
            return f"Could not check {ref.kind} {ref.name}: the API server could not be reached"
        if found is not None:
            return f"{ref.kind} {ref.name} now exists in the namespace"
    return None


async def remove_finished_job(api, namespace: str, release: str) -> None:
    job = await read_job(api, namespace, release)
    if job is None or not job_complete(job):
        return
    try:
        await client.BatchV1Api(api).delete_namespaced_job(
            field(job, "metadata", "name"), namespace, propagation_policy="Background"
        )
    except ApiException as e:
        if e.status != 404:
            raise


async def create_job(api, namespace: str, release: str, body: dict) -> tuple[JobCreation, Optional[dict]]:
    try:
        created = await client.BatchV1Api(api).create_namespaced_job(namespace, body)
    except ApiException as e:
        if e.status != 409:
            raise
    else:
        return "created", api.sanitize_for_serialization(created)
    name = body["metadata"]["name"]
    existing = await get_or_none(api, JOB_PATH + "/{name}", {"namespace": namespace, "name": name})
    if existing is None or field(existing, "metadata", "deletionTimestamp"):
        return "deleting", existing
    if our_job(existing, release):
        return "ours", existing
    return "foreign", existing


async def started_event(api, namespace: str, job: dict, message: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    name = field(job, "metadata", "name")
    body = {
        "apiVersion": "v1",
        "kind": "Event",
        "metadata": {"generateName": f"{name}.", "namespace": namespace},
        "involvedObject": {
            "apiVersion": "batch/v1",
            "kind": "Job",
            "name": name,
            "namespace": namespace,
            "uid": field(job, "metadata", "uid"),
        },
        "reason": STARTED_REASON,
        "message": message,
        "type": "Normal",
        "source": {"component": EVENT_SOURCE},
        "firstTimestamp": now,
        "lastTimestamp": now,
        "count": 1,
    }
    try:
        await client.CoreV1Api(api).create_namespaced_event(namespace, body)
    except Exception as e:
        logger.warning("Recording the marketplace install event failed: %s", describe_error(e))
