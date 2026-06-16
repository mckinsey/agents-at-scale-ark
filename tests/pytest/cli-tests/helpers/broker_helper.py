import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from helpers.ark_api_helper import get_api_url


def get_broker_url() -> str:
    api_url = get_api_url()
    return f"{api_url}/v1/broker"


def _fetch_json(path: str, params: Optional[dict] = None, timeout: int = 10) -> Any:
    url = f"{get_broker_url()}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})}"
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


def _span_attrs(span: dict) -> dict:
    result = {}
    for a in span.get("attributes", []):
        v = a.get("value", {})
        result[a["key"]] = list(v.values())[0] if isinstance(v, dict) and v else v
    return result


def get_traces(limit: int = 100, session_id: Optional[str] = None) -> list[dict]:
    data = _fetch_json("/traces", {"limit": limit, "session_id": session_id})
    return data.get("items", [])


def get_traces_for_session(session_id: str, limit: int = 50) -> list[dict]:
    """Return all traces whose spans carry the given ark.session.id."""
    return get_traces(limit=limit, session_id=session_id)


def find_trace_for_query(query_name: str, limit: int = 200, timeout: int = 30) -> Optional[dict]:
    """Return the trace for query_name, waiting until the root span is present.

    The root span (named ``query.<name>``) is emitted last, after all child
    spans have been recorded.  Matching on the span *name* (not the attribute)
    ensures we only return a complete trace and avoids grabbing a partial trace
    that only contains the early dispatch span.
    """
    root_span_name = f"query.{query_name}"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            for trace in get_traces(limit=limit):
                for span in trace.get("spans", []):
                    if span["name"] == root_span_name:
                        return trace
        except (urllib.error.URLError, json.JSONDecodeError):
            pass
        time.sleep(2)
    return None


def find_traces_for_session(session_id: str, min_count: int = 1, timeout: int = 30) -> list[dict]:
    """Poll until at least min_count traces appear for the given session, then return them."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            traces = get_traces_for_session(session_id)
            if len(traces) >= min_count:
                return traces
        except (urllib.error.URLError, json.JSONDecodeError):
            pass
        time.sleep(2)
    return []


def get_spans_by_kind(trace: dict, kind: str) -> list[dict]:
    result = []
    for span in trace.get("spans", []):
        attrs = _span_attrs(span)
        span_kind = attrs.get("openinference.span.kind", "")
        if span_kind.upper() == kind.upper():
            result.append(span)
    return result


def get_spans_by_name_prefix(trace: dict, prefix: str) -> list[dict]:
    return [s for s in trace.get("spans", []) if s["name"].startswith(prefix)]


def get_root_query_span(trace: dict, query_name: str) -> Optional[dict]:
    for span in trace.get("spans", []):
        if span["name"] == f"query.{query_name}":
            return span
    return None


def get_llm_spans(trace: dict) -> list[dict]:
    return get_spans_by_name_prefix(trace, "llm.")


def get_agent_spans(trace: dict) -> list[dict]:
    return get_spans_by_name_prefix(trace, "agent.")


def get_team_spans(trace: dict) -> list[dict]:
    return get_spans_by_name_prefix(trace, "team.")


def get_turn_spans(trace: dict) -> list[dict]:
    return get_spans_by_name_prefix(trace, "turn.")


def get_tool_spans(trace: dict) -> list[dict]:
    return [s for s in trace.get("spans", []) if s["name"] == "tool.execution"]
