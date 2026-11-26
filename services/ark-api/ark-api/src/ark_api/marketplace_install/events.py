import logging
from datetime import datetime
from typing import Optional

from ..models.marketplace_installs import MarketplaceInstallEvent
from ..services.sensitive_data_filter import _redact_string
from .errors import describe_error
from .helm import CONTROL_CHARS
from .kube import field, get_json, items_of
from .state import job_pods

logger = logging.getLogger(__name__)

RELEASE_NAME_ANNOTATION = "meta.helm.sh/release-name"
EVENTS_PATH = "/api/v1/namespaces/{namespace}/events"
MAX_EVENTS = 20
MAX_MESSAGE_CHARS = 500


def _uid(obj: Optional[dict]) -> Optional[str]:
    uid = field(obj, "metadata", "uid")
    return uid if isinstance(uid, str) and uid else None


def _owned_by_any(obj: dict, uids: set[str]) -> bool:
    owners = field(obj, "metadata", "ownerReferences")
    return isinstance(owners, list) and any(isinstance(o, dict) and o.get("uid") in uids for o in owners)


async def _list(api, path: str, namespace: str) -> list[dict]:
    return items_of(await get_json(api, path, {"namespace": namespace}))


async def _events_of(api, namespace: str, uid: str) -> list[dict]:
    data = await get_json(api, EVENTS_PATH, {"namespace": namespace}, [("fieldSelector", f"involvedObject.uid={uid}")])
    return [event for event in items_of(data) if field(event, "involvedObject", "uid") == uid]


async def _release_replica_sets(api, namespace: str, release: str) -> set[str]:
    deployments = await _list(api, "/apis/apps/v1/namespaces/{namespace}/deployments", namespace)
    owners = {
        uid
        for deployment in deployments
        if field(deployment, "metadata", "annotations", RELEASE_NAME_ANNOTATION) == release
        and (uid := _uid(deployment))
    }
    if not owners:
        return set()
    replica_sets = await _list(api, "/apis/apps/v1/namespaces/{namespace}/replicasets", namespace)
    return {uid for rs in replica_sets if _owned_by_any(rs, owners) and (uid := _uid(rs))}


def _text(value) -> str:
    return CONTROL_CHARS.sub("", value)[:MAX_MESSAGE_CHARS] if isinstance(value, str) else ""


def _seen(event: dict) -> str:
    for key in ("lastTimestamp", "eventTime"):
        value = event.get(key)
        if isinstance(value, str) and value:
            return value
    return str(field(event, "metadata", "creationTimestamp") or "")


def _time(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def _event(event: dict) -> MarketplaceInstallEvent:
    count = event.get("count")
    return MarketplaceInstallEvent(
        type=_text(event.get("type")),
        reason=_text(event.get("reason")),
        message=_redact_string(_text(event.get("message"))),
        objectKind=_text(field(event, "involvedObject", "kind")),
        objectName=_text(field(event, "involvedObject", "name")),
        count=count if isinstance(count, int) and count > 0 else 1,
        lastSeen=_time(_seen(event)),
    )


async def collect(api, namespace: str, release: str, job: Optional[dict]) -> list[MarketplaceInstallEvent]:
    try:
        uids = await _release_replica_sets(api, namespace, release)
        if job is not None:
            uids |= {uid for uid in [_uid(job)] + [_uid(pod) for pod in await job_pods(api, namespace, job)] if uid}
        if not uids:
            return []
        events = [event for uid in sorted(uids) for event in await _events_of(api, namespace, uid)]
        events.sort(key=_seen, reverse=True)
        return [_event(event) for event in events[:MAX_EVENTS]]
    except Exception as e:
        logger.warning("Reading the marketplace install events failed: %s", describe_error(e))
        return []
