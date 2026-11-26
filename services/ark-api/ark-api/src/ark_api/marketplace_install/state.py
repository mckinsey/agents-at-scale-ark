import logging
from dataclasses import dataclass, field as dataclass_field
from typing import Optional

from ..models.marketplace_installs import InstallRecordState, InstallStage, MarketplaceInstallRecord
from . import releases
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
from .kube import field, get_json, get_or_none, items_of
from .releases import Revision

logger = logging.getLogger(__name__)

JOB_PATH = "/apis/batch/v1/namespaces/{namespace}/jobs"
POD_PATH = "/api/v1/namespaces/{namespace}/pods"
JOB_NAME_LABEL = "batch.kubernetes.io/job-name"
PLATFORM_STATUSES = {"superseded", "uninstalling", "uninstalled", "pending-upgrade", "pending-rollback"}
TIMEOUT_REASONS = {"PodFailurePolicy", "DeadlineExceeded"}
DEADLINE_DESCRIPTIONS = ("context deadline exceeded", "context canceled")
FAILED_CONDITIONS = ("Failed", "FailureTarget")
MAX_DESCRIPTIONS = 20


@dataclass(frozen=True)
class Derived:
    state: InstallRecordState
    stage: Optional[InstallStage] = None
    failed_stage: Optional[InstallStage] = None


@dataclass
class Observed:
    release: str
    job: Optional[dict] = None
    pods: list[dict] = dataclass_field(default_factory=list)
    revision: Optional[Revision] = None
    description: Optional[str] = None


def _true_conditions(job: dict) -> dict[str, dict]:
    conditions = field(job, "status", "conditions")
    found = {}
    for condition in conditions if isinstance(conditions, list) else []:
        if isinstance(condition, dict) and condition.get("status") == "True" and isinstance(condition.get("type"), str):
            found[condition["type"]] = condition
    return found


def job_complete(job: dict) -> bool:
    return "Complete" in _true_conditions(job)


def job_failed(job: dict) -> bool:
    conditions = _true_conditions(job)
    return "Complete" not in conditions and any(name in conditions for name in FAILED_CONDITIONS)


def job_finished(job: dict) -> bool:
    return job_complete(job) or job_failed(job)


def _job_timed_out(job: dict) -> bool:
    conditions = _true_conditions(job)
    return any(conditions.get(name, {}).get("reason") in TIMEOUT_REASONS for name in FAILED_CONDITIONS)


def _deadline_failure(revision: Optional[Revision], description: Optional[str]) -> bool:
    if revision is None or revision.status != "failed" or not description:
        return False
    return any(marker in description for marker in DEADLINE_DESCRIPTIONS)


def _running_stage(pods: list[dict]) -> InstallStage:
    phases = {field(pod, "status", "phase") for pod in pods}
    if not phases or phases <= {"Pending", None}:
        return "resolve"
    return "apply"


def _failed(revision: Optional[Revision]) -> Derived:
    return Derived("failed", failed_stage="resolve" if revision is None else "apply")


def derive(observed: Observed) -> Derived:
    job, revision = observed.job, observed.revision
    status = revision.status if revision else None
    if revision is not None and (revision.version > 1 or status in PLATFORM_STATUSES):
        return Derived("platform-managed")
    if status == "deployed":
        if job is None or job_complete(job):
            return Derived("installed")
        if not job_failed(job):
            return Derived("installing", stage="ready")
        return Derived("installed")
    if (job is not None and job_failed(job) and _job_timed_out(job)) or _deadline_failure(revision, observed.description):
        return Derived("timed-out", failed_stage="ready")
    if job is not None and job_failed(job):
        return _failed(revision)
    if job is not None and not job_complete(job):
        return Derived("installing", stage=_running_stage(observed.pods))
    if job is not None and revision is None:
        return Derived("installable")
    if job is None and status is not None and (status == "failed" or status.startswith("pending-")):
        return _failed(revision)
    if job is None and revision is None:
        return Derived("installable")
    logger.warning(
        "Marketplace install %s has no matching state (job finished: %s, release status: %s)",
        observed.release,
        job is not None and job_finished(job),
        status,
    )
    return _failed(revision)


def our_job(job: Optional[dict], release: Optional[str] = None) -> bool:
    if not isinstance(job, dict) or field(job, "metadata", "deletionTimestamp"):
        return False
    label = field(job, "metadata", "labels", INSTALL_LABEL)
    if not isinstance(label, str) or not label or (release is not None and label != release):
        return False
    return field(job, "spec", "template", "spec", "serviceAccountName") == INSTALLER_SERVICE_ACCOUNT


def _annotation(job: Optional[dict], key: str) -> Optional[str]:
    value = field(job, "metadata", "annotations", key)
    return value if isinstance(value, str) and value else None


def record(observed: Observed) -> MarketplaceInstallRecord:
    derived = derive(observed)
    job = observed.job
    return MarketplaceInstallRecord(
        source=_annotation(job, SOURCE_ANNOTATION),
        itemName=_annotation(job, ITEM_ANNOTATION),
        release=observed.release,
        chartVersion=_annotation(job, CHART_VERSION_ANNOTATION),
        digest=_annotation(job, DIGEST_ANNOTATION),
        state=derived.state,
        stage=derived.stage,
        failedStage=derived.failed_stage,
        startedAt=field(job, "status", "startTime"),
        installedBy=_annotation(job, INSTALLED_BY_ANNOTATION),
    )


def _owned_by(pod: dict, job: dict) -> bool:
    uid = field(job, "metadata", "uid")
    owners = field(pod, "metadata", "ownerReferences")
    if field(pod, "spec", "serviceAccountName") != INSTALLER_SERVICE_ACCOUNT:
        return False
    return bool(uid) and isinstance(owners, list) and any(isinstance(o, dict) and o.get("uid") == uid for o in owners)


async def job_pods(api, namespace: str, job: dict) -> list[dict]:
    name = field(job, "metadata", "name")
    data = await get_json(api, POD_PATH, {"namespace": namespace}, [("labelSelector", f"{JOB_NAME_LABEL}={name}")])
    return [pod for pod in items_of(data) if _owned_by(pod, job)]


async def _description(api, namespace: str, revision: Optional[Revision]) -> Optional[str]:
    if revision is None or revision.status != "failed" or revision.version > 1:
        return None
    return await releases.failure_description(api, namespace, revision)


async def read_job(api, namespace: str, release: str) -> Optional[dict]:
    job = await get_or_none(api, JOB_PATH + "/{name}", {"namespace": namespace, "name": job_name(release)})
    return job if our_job(job, release) else None


async def load(api, namespace: str, release: str) -> Observed:
    job = await read_job(api, namespace, release)
    pods = await job_pods(api, namespace, job) if job is not None and not job_finished(job) else []
    revision = await releases.latest(api, namespace, release)
    return Observed(release, job, pods, revision, await _description(api, namespace, revision))


async def our_jobs(api, namespace: str) -> dict[str, dict]:
    data = await get_json(api, JOB_PATH, {"namespace": namespace}, [("labelSelector", INSTALL_LABEL)])
    jobs = {}
    for job in items_of(data):
        release = field(job, "metadata", "labels", INSTALL_LABEL)
        if our_job(job) and field(job, "metadata", "name") == job_name(release):
            jobs[release] = job
    return jobs


async def item_job(api, namespace: str, source: str, item: str) -> Optional[tuple[str, dict]]:
    for release, job in sorted((await our_jobs(api, namespace)).items()):
        if _annotation(job, SOURCE_ANNOTATION) == source and _annotation(job, ITEM_ANNOTATION) == item:
            return release, job
    return None


async def load_all(api, namespace: str) -> list[Observed]:
    jobs = await our_jobs(api, namespace)
    revisions = await releases.latest_all(api, namespace)
    observed = []
    described = 0
    for release in sorted(set(jobs) | set(revisions)):
        job, revision = jobs.get(release), revisions.get(release)
        pods = await job_pods(api, namespace, job) if job is not None and not job_finished(job) else []
        description = None
        if revision is not None and revision.status == "failed" and revision.version == 1 and described < MAX_DESCRIPTIONS:
            described += 1
            description = await _description(api, namespace, revision)
        observed.append(Observed(release, job, pods, revision, description))
    return observed
