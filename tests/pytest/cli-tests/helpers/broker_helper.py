import time
from typing import Any, Optional
from urllib.parse import urljoin

import requests

from helpers.ark_api_helper import get_api_url

# OTLP AnyValue is a oneof: exactly one of these keys is set per attribute value.
# Order mirrors the broker's own extractValue (services/ark-broker .../otlp.ts).
_ANY_VALUE_KEYS = (
    "stringValue",
    "intValue",
    "doubleValue",
    "boolValue",
    "arrayValue",
    "kvlistValue",
    "bytesValue",
)


def get_broker_url() -> str:
    return f"{get_api_url()}/v1/broker"


def _fetch_json(path: str, params: Optional[dict] = None, timeout: int = 10) -> Any:
    resp = requests.get(urljoin(f"{get_broker_url()}/", path.lstrip("/")), params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _attr_value(value: Any) -> Any:
    """Unwrap a single OTLP AnyValue ({"stringValue": "x"}) to its scalar."""
    if not isinstance(value, dict):
        return value
    for key in _ANY_VALUE_KEYS:
        if key in value:
            return value[key]
    return value


def _span_attrs(span: dict) -> dict:
    return {a["key"]: _attr_value(a.get("value")) for a in span.get("attributes", [])}


def get_traces(limit: int = 100, session_id: Optional[str] = None) -> list[dict]:
    data = _fetch_json("traces", {"limit": limit, "session_id": session_id})
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
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            for trace in get_traces(limit=limit):
                if get_root_query_span(trace, query_name) is not None:
                    return trace
        except requests.RequestException:
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
        except requests.RequestException:
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
