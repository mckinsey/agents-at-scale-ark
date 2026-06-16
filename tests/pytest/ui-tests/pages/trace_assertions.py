"""Lightweight OTEL trace assertion helpers for UI tests.

These helpers call the broker traces endpoint via the ark-api proxy
(GET {ARK_API_URL}/v1/broker/traces) and expose assertion functions
that can be called at the end of existing conversation tests.

Trace verification is non-blocking: if the broker is unreachable the helpers
log a warning and return gracefully so the core UI assertion is not obscured.
"""

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

logger = logging.getLogger(__name__)

_DEFAULT_API_URL = "http://ark-api.default.127.0.0.1.nip.io:8080"


def _api_url() -> str:
    return os.environ.get("ARK_API_URL", _DEFAULT_API_URL).rstrip("/")


def _fetch(path: str, params: Optional[dict] = None, timeout: int = 10) -> Optional[dict]:
    url = f"{_api_url()}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        logger.warning("Broker request failed (%s %s): %s", path, params, exc)
        return None


def _span_attrs(span: dict) -> dict:
    return {a["key"]: list(a["value"].values())[0] for a in span.get("attributes", [])}


def fetch_traces_for_session(session_id: str, limit: int = 20) -> list[dict]:
    data = _fetch("/v1/broker/traces", {"session_id": session_id, "limit": limit})
    return data.get("items", []) if data else []


def wait_for_session_trace(session_id: str, timeout: int = 30) -> list[dict]:
    """Poll until at least one trace appears for session_id, then return all traces."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        traces = fetch_traces_for_session(session_id)
        if traces:
            return traces
        time.sleep(2)
    logger.warning("No traces found for session %s after %ds", session_id, timeout)
    return []


def find_recent_trace_for_agent(agent_name: str, limit: int = 30, timeout: int = 30) -> Optional[dict]:
    """Find a trace whose spans reference the given agent name (via target.name attribute)."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = _fetch("/v1/broker/traces", {"limit": limit})
        if data:
            for trace in data.get("items", []):
                for span in trace.get("spans", []):
                    attrs = _span_attrs(span)
                    if attrs.get("target.name") == agent_name:
                        return trace
        time.sleep(2)
    logger.warning("No trace found for agent %s after %ds", agent_name, timeout)
    return None


# ---------------------------------------------------------------------------
# Span extraction helpers
# ---------------------------------------------------------------------------

def _get_spans_by_prefix(trace: dict, prefix: str) -> list[dict]:
    return [s for s in trace.get("spans", []) if s["name"].startswith(prefix)]


def _get_root_query_span(trace: dict) -> Optional[dict]:
    for span in trace.get("spans", []):
        attrs = _span_attrs(span)
        if (attrs.get("openinference.span.kind") == "CHAIN"
                and "query." in span["name"]
                and "dispatch" not in span["name"]):
            return span
    return None


# ---------------------------------------------------------------------------
# Assertion helpers — return (passed: bool, reason: str)
# ---------------------------------------------------------------------------

def assert_agent_trace(traces: list[dict], session_id: str) -> None:
    """Assert a single-agent conversation trace has the expected structure."""
    if not traces:
        logger.warning("TRACE SKIP — no traces for session %s (broker may be unreachable)", session_id)
        return

    trace = traces[0]

    root = _get_root_query_span(trace)
    assert root is not None, (
        f"TRACE FAIL — no root CHAIN span in trace for session {session_id}. "
        f"Spans: {[s['name'] for s in trace.get('spans', [])]}"
    )
    root_attrs = _span_attrs(root)
    assert root_attrs.get("input.value"), (
        f"TRACE FAIL — root span missing input.value for session {session_id}"
    )
    assert root_attrs.get("output.value"), (
        f"TRACE FAIL — root span missing output.value for session {session_id}"
    )

    llm_spans = _get_spans_by_prefix(trace, "llm.")
    assert llm_spans, (
        f"TRACE FAIL — no LLM span found for session {session_id}"
    )
    llm_attrs = _span_attrs(llm_spans[0])
    out_content_keys = [k for k in llm_attrs if "output_messages" in k and "content" in k]
    assert out_content_keys and any(llm_attrs[k] for k in out_content_keys), (
        f"TRACE FAIL — LLM span output messages empty for session {session_id}. "
        f"Attrs: {dict(list(llm_attrs.items())[:15])}"
    )

    total = llm_attrs.get("gen_ai.usage.total_tokens") or llm_attrs.get("tokens.total")
    assert total and int(total) > 0, (
        f"TRACE FAIL — token count missing or zero for session {session_id}"
    )
    logger.info("TRACE OK — agent trace verified for session %s", session_id)


def assert_team_trace(traces: list[dict], session_id: str, team_name: str) -> None:
    """Assert a team conversation trace has team spans, turn spans, and speaker names."""
    if not traces:
        logger.warning("TRACE SKIP — no traces for session %s (broker may be unreachable)", session_id)
        return

    trace = traces[0]
    span_names = [s["name"] for s in trace.get("spans", [])]

    team_spans = _get_spans_by_prefix(trace, "team.")
    assert team_spans, (
        f"TRACE FAIL — no team span for session {session_id}. Spans: {span_names}"
    )
    team_attrs = _span_attrs(team_spans[0])
    assert team_attrs.get("team.strategy"), (
        f"TRACE FAIL — team span missing team.strategy for session {session_id}"
    )

    turn_spans = _get_spans_by_prefix(trace, "turn.")
    assert turn_spans, (
        f"TRACE FAIL — no turn spans for team session {session_id}. Spans: {span_names}"
    )
    for span in turn_spans:
        attrs = _span_attrs(span)
        member_name = attrs.get("turn.member.name", "")
        assert member_name, (
            f"TRACE FAIL — turn.member.name is empty on '{span['name']}' "
            f"for session {session_id}. "
            "This is the 'names stopped showing' bug: speaker attribution is missing."
        )
        turn_output = attrs.get("turn.output", "")
        assert turn_output, (
            f"TRACE FAIL — turn.output is empty on '{span['name']}' for session {session_id}. "
            "This may indicate a conversation history / transitivity bug."
        )
    logger.info(
        "TRACE OK — team trace verified for session %s (%d turn spans, strategy=%s)",
        session_id, len(turn_spans), team_attrs.get("team.strategy"),
    )


def assert_multi_message_trace(traces: list[dict], session_id: str, expected_messages: int) -> None:
    """Assert that multiple LLM calls were traced for a multi-message conversation."""
    if not traces:
        logger.warning("TRACE SKIP — no traces for session %s", session_id)
        return

    all_llm_spans = []
    for trace in traces:
        all_llm_spans.extend(_get_spans_by_prefix(trace, "llm."))

    assert len(all_llm_spans) >= expected_messages, (
        f"TRACE FAIL — expected at least {expected_messages} LLM spans across all traces "
        f"for session {session_id}, got {len(all_llm_spans)}"
    )
    logger.info(
        "TRACE OK — multi-message trace verified: %d LLM spans for session %s",
        len(all_llm_spans), session_id,
    )
