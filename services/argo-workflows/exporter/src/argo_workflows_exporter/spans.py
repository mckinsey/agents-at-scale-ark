import hashlib
import json
from datetime import datetime

from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.trace import SpanContext, SpanKind, Status, StatusCode, TraceFlags

SERVICE_NAME = "argo-workflows-exporter"
FAILED_PHASES = {"Failed", "Error"}
FINISHED_PHASES = {"Succeeded", "Failed", "Error", "Skipped", "Omitted"}
RESOURCE = Resource.create({"service.name": SERVICE_NAME})


def _hex_id(seed: str, length: int) -> int:
    return int(hashlib.sha256(seed.encode()).hexdigest()[:length], 16)


def trace_id_for(run: dict) -> int:
    if run.get("trace_id"):
        return int(run["trace_id"], 16)
    return _hex_id(f"argo-workflow:{run['uid']}", 32)


def root_span_id_for(run: dict) -> int:
    return _hex_id(f"argo-workflow-root:{run['uid']}", 16)


def node_span_id_for(run: dict, node_id: str) -> int:
    return _hex_id(f"argo-node:{run['uid']}:{node_id}", 16)


def session_id_for(run: dict) -> str:
    return f"wf-{run['name']}"


def _nanos(timestamp: str | None) -> int | None:
    if not timestamp:
        return None
    return int(datetime.fromisoformat(timestamp).timestamp() * 1_000_000_000)


def _context(trace_id: int, span_id: int, remote: bool = False) -> SpanContext:
    return SpanContext(trace_id=trace_id, span_id=span_id, is_remote=remote, trace_flags=TraceFlags(TraceFlags.SAMPLED))


def _status(phase: str | None, message: str | None) -> Status:
    if phase in FAILED_PHASES:
        return Status(StatusCode.ERROR, message or phase)
    return Status(StatusCode.OK)


def _parameters_json(parameters: list) -> str:
    return json.dumps({p["name"]: p.get("value") for p in parameters})


def is_exportable_node(node: dict) -> bool:
    return node.get("type") == "Pod" and node.get("phase") in FINISHED_PHASES and bool(node.get("finished_at"))


def node_span(run: dict, node: dict) -> ReadableSpan:
    trace_id = trace_id_for(run)
    if run.get("trace_id") and node.get("span_id"):
        parent = _context(trace_id, int(node["span_id"], 16), remote=True)
    else:
        parent = _context(trace_id, root_span_id_for(run), remote=True)

    attributes = {
        "session.id": session_id_for(run),
        "argo.workflow.name": run["name"],
        "argo.workflow.namespace": run["namespace"],
        "argo.workflow.uid": run["uid"],
        "argo.node.id": node["id"],
        "argo.node.name": node.get("name", ""),
        "argo.node.phase": node.get("phase") or "",
        "input.value": _parameters_json(node.get("inputs") or []),
        "output.value": _parameters_json(node.get("outputs") or []),
    }
    if node.get("template_name"):
        attributes["argo.node.template"] = node["template_name"]
    if node.get("exit_code") is not None:
        attributes["argo.node.exit_code"] = str(node["exit_code"])
    if node.get("message"):
        attributes["argo.node.message"] = node["message"]
    log = node.get("log")
    if log:
        attributes["argo.log.excerpt"] = log["excerpt"]
        attributes["argo.log.truncated"] = log["truncated"]
        attributes["argo.log.source"] = log["source"]

    return ReadableSpan(
        name=f"argo.step.{node.get('display_name') or node['id']}",
        context=_context(trace_id, node_span_id_for(run, node["id"])),
        parent=parent,
        resource=RESOURCE,
        attributes=attributes,
        kind=SpanKind.INTERNAL,
        status=_status(node.get("phase"), node.get("message")),
        start_time=_nanos(node.get("started_at")) or _nanos(node.get("finished_at")),
        end_time=_nanos(node.get("finished_at")),
    )


def root_span(run: dict) -> ReadableSpan:
    trace_id = trace_id_for(run)
    return ReadableSpan(
        name=f"argo.workflow.{run['name']}",
        context=_context(trace_id, root_span_id_for(run)),
        parent=None,
        resource=RESOURCE,
        attributes={
            "session.id": session_id_for(run),
            "argo.workflow.name": run["name"],
            "argo.workflow.namespace": run["namespace"],
            "argo.workflow.uid": run["uid"],
            "argo.workflow.phase": run.get("phase") or "",
        },
        kind=SpanKind.INTERNAL,
        status=_status(run.get("phase"), run.get("message")),
        start_time=_nanos(run.get("started_at")) or _nanos(run.get("finished_at")),
        end_time=_nanos(run.get("finished_at")),
    )


def needs_root_span(run: dict) -> bool:
    return not run.get("trace_id") and run.get("phase") in FINISHED_PHASES and bool(run.get("finished_at"))
