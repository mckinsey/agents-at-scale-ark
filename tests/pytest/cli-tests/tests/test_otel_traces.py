import time

import pytest
import requests

from helpers import k8s
from helpers.broker_helper import (
    find_trace_for_query,
    get_agent_spans,
    get_llm_spans,
    get_root_query_span,
    get_team_spans,
    get_traces,
    get_turn_spans,
    _span_attrs,
)
from helpers.queries_helper import QueriesHelper


AGENT_NAME = "test-otel-agent"
SEQUENTIAL_TEAM_NAME = "test-otel-seq-team"
MODEL_NAME = "test-model-mock"

PREFIX = "test-otel"


def _broker_available() -> bool:
    try:
        get_traces(limit=1)
        return True
    except requests.RequestException:
        return False


@pytest.fixture(scope="module", autouse=True)
def broker_available(ark_api_url):
    if not _broker_available():
        pytest.skip(f"Broker traces endpoint not reachable at {ark_api_url} — skip OTEL trace tests")


class TestAgentQueryTrace:
    """
    Assert the trace emitted for a simple single-agent query contains
    the required spans and their input/output attributes.
    """

    helper = QueriesHelper()

    @classmethod
    def setup_class(cls):
        k8s.delete_resource("agent", AGENT_NAME)
        ok, msg = k8s.apply_yaml(f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {AGENT_NAME}
  namespace: default
spec:
  modelRef:
    name: {MODEL_NAME}
  prompt: "You are a concise test agent."
""")
        assert ok, f"kubectl apply failed: {msg}"

    @classmethod
    def teardown_class(cls):
        cls.helper.cleanup_queries(f"{PREFIX}-agent-")
        k8s.delete_resource("agent", AGENT_NAME)

    def _run_query(self, suffix: str, text: str) -> str:
        name = f"{PREFIX}-agent-{suffix}"
        ok, msg = self.helper.create_query(
            name=name,
            agent_name=AGENT_NAME,
            input_text=text,
            timeout=60,
        )
        assert ok, f"Query failed: {msg}"
        return name

    def test_root_span_has_input_output(self):
        query_name = self._run_query("root-io", "Reply with: ROOT IO")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        root = get_root_query_span(trace, query_name)
        assert root is not None, "Root query span missing"

        attrs = _span_attrs(root)
        assert attrs.get("input.value"), "root span missing input.value"
        assert attrs.get("output.value"), "root span missing output.value"

    def test_root_span_input_matches_prompt(self):
        prompt = "Reply with: MATCH PROMPT"
        query_name = self._run_query("match-prompt", prompt)
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        root = get_root_query_span(trace, query_name)
        assert root is not None
        attrs = _span_attrs(root)
        assert prompt in attrs.get("input.value", ""), (
            f"input.value does not contain prompt. Got: {attrs.get('input.value')}"
        )

    def test_llm_span_exists(self):
        query_name = self._run_query("llm-exists", "Reply with: LLM EXISTS")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        llm_spans = get_llm_spans(trace)
        assert len(llm_spans) > 0, "No LLM span found in trace"

    def test_llm_span_has_input_messages(self):
        query_name = self._run_query("llm-input-msgs", "Reply with: INPUT MSGS")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        for span in get_llm_spans(trace):
            attrs = _span_attrs(span)
            user_msg_keys = [k for k in attrs if "input_messages" in k and "content" in k and "role" not in k]
            assert len(user_msg_keys) > 0, "LLM span has no input_messages content keys"

            prompt_msg_key = [k for k in user_msg_keys
                              if attrs.get(k.replace(".content", ".role"), "") == "user"]
            assert len(prompt_msg_key) > 0, (
                "No user-role input message found. "
                f"Input message keys: {user_msg_keys}, attrs: {dict(list(attrs.items())[:20])}"
            )
            user_content = attrs[prompt_msg_key[0]]
            assert user_content, "User input message content is empty"

    def test_llm_span_has_output_messages(self):
        query_name = self._run_query("llm-output-msgs", "Reply with: OUTPUT MSGS")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        for span in get_llm_spans(trace):
            attrs = _span_attrs(span)
            out_content_keys = [k for k in attrs if "output_messages" in k and "content" in k]
            assert len(out_content_keys) > 0, "LLM span has no output_messages content keys"

            any_non_empty = any(attrs[k] for k in out_content_keys)
            assert any_non_empty, f"All output message contents are empty. Keys: {out_content_keys}"

    def test_llm_span_has_token_counts(self):
        query_name = self._run_query("token-counts", "Reply with: TOKEN COUNTS")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        for span in get_llm_spans(trace):
            attrs = _span_attrs(span)
            total = attrs.get("gen_ai.usage.total_tokens")
            if total is None:
                total = attrs.get("tokens.total")
            assert total is not None, "LLM span missing token count attribute (gen_ai.usage.total_tokens / tokens.total)"
            assert int(total) >= 0, f"Token total must be >= 0, got {total}"

    def test_agent_span_exists_with_name(self):
        query_name = self._run_query("agent-span", "Reply with: AGENT SPAN")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        agent_spans = get_agent_spans(trace)
        assert len(agent_spans) > 0, "No agent span found in trace"

        attrs = _span_attrs(agent_spans[0])
        assert attrs.get("agent.name") == AGENT_NAME, (
            f"agent.name mismatch: expected {AGENT_NAME}, got {attrs.get('agent.name')}"
        )

    def test_span_kinds_cover_chain_llm_agent(self):
        query_name = self._run_query("span-kinds", "Reply with: SPAN KINDS")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        all_kinds = {
            _span_attrs(s).get("openinference.span.kind", "").upper()
            for s in trace.get("spans", [])
        }
        assert "CHAIN" in all_kinds, f"No CHAIN span. Kinds found: {all_kinds}"
        assert "LLM" in all_kinds, f"No LLM span. Kinds found: {all_kinds}"
        assert "AGENT" in all_kinds, f"No AGENT span. Kinds found: {all_kinds}"


class TestSystemPromptInTrace:
    """
    Regression: system prompt content must not be empty in LLM span input messages.
    Bug: llm.input_messages.0.message.content was '' even when agent had a prompt set.
    """

    helper = QueriesHelper()
    agent_name = f"{PREFIX}-sys-prompt-agent"

    @classmethod
    def setup_class(cls):
        k8s.delete_resource("agent", cls.agent_name)
        ok, msg = k8s.apply_yaml(f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {cls.agent_name}
  namespace: default
spec:
  modelRef:
    name: {MODEL_NAME}
  prompt: "You are a specialized regression test agent. Always identify yourself."
""")
        assert ok, f"kubectl apply failed: {msg}"

    @classmethod
    def teardown_class(cls):
        cls.helper.cleanup_queries(f"{PREFIX}-sysprompt-")
        k8s.delete_resource("agent", cls.agent_name)

    def test_system_prompt_content_not_empty(self):
        query_name = f"{PREFIX}-sysprompt-content"
        ok, msg = self.helper.create_query(
            name=query_name,
            agent_name=self.agent_name,
            input_text="Who are you?",
            timeout=60,
        )
        assert ok, f"Query failed: {msg}"

        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        for span in get_llm_spans(trace):
            attrs = _span_attrs(span)
            system_content_keys = [
                k for k in attrs
                if "input_messages" in k and "content" in k
                and attrs.get(k.replace(".content", ".role"), "") == "system"
            ]
            if not system_content_keys:
                continue

            for key in system_content_keys:
                content = attrs[key]
                assert content, (
                    f"System prompt content is empty in LLM span (attr: {key}). "
                    "This is the reported OTEL bug: agent message inputs not recorded."
                )


class TestSequentialTeamTrace:
    """
    Assert traces for sequential team queries include team, turn, and per-member spans.
    Covers: turn.member.name populated, turn.output non-empty (transitivity check).
    """

    helper = QueriesHelper()
    agent_a = f"{PREFIX}-seq-agent-a"
    agent_b = f"{PREFIX}-seq-agent-b"
    team_name = SEQUENTIAL_TEAM_NAME

    @classmethod
    def setup_class(cls):
        for name in [cls.agent_a, cls.agent_b]:
            k8s.delete_resource("agent", name)
        k8s.delete_resource("team", cls.team_name)

        ok, msg = k8s.apply_yaml(f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {cls.agent_a}
  namespace: default
spec:
  modelRef:
    name: {MODEL_NAME}
  prompt: "You are Agent A. When asked to generate a token, respond with exactly: TOKEN-ALPHA"
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {cls.agent_b}
  namespace: default
spec:
  modelRef:
    name: {MODEL_NAME}
  prompt: "You are Agent B. Repeat the last message you received, prefixed with 'B-ECHO:'"
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Team
metadata:
  name: {cls.team_name}
  namespace: default
spec:
  strategy: sequential
  members:
    - name: {cls.agent_a}
      type: agent
    - name: {cls.agent_b}
      type: agent
""")
        assert ok, f"kubectl apply failed: {msg}"

    @classmethod
    def teardown_class(cls):
        cls.helper.cleanup_queries(f"{PREFIX}-seq-")
        k8s.delete_resource("team", cls.team_name)
        k8s.delete_resource("agent", cls.agent_a)
        k8s.delete_resource("agent", cls.agent_b)

    def _run_team_query(self, suffix: str, text: str) -> str:
        name = f"{PREFIX}-seq-{suffix}"
        ok, msg = k8s.apply_yaml(f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: {name}
  namespace: default
spec:
  input: "{text}"
  target:
    name: {self.team_name}
    type: team
  type: user
  timeout: 5m
  ttl: 1h
""")
        assert ok, f"Team query apply failed: {msg}"

        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            _, query = self.helper.get_query(name)
            if query and query.get("status", {}).get("phase") == "done":
                break
            time.sleep(1)

        return name

    def test_team_span_exists(self):
        query_name = self._run_team_query("team-span", "Generate your token")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None, f"No trace for {query_name}"

        team_spans = get_team_spans(trace)
        assert len(team_spans) > 0, "No team span found in trace"

    def test_team_span_has_strategy(self):
        query_name = self._run_team_query("team-strategy", "Generate your token")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        for span in get_team_spans(trace):
            attrs = _span_attrs(span)
            assert attrs.get("team.strategy") == "sequential", (
                f"team.strategy missing or wrong: {attrs.get('team.strategy')}"
            )

    def test_turn_spans_have_member_names(self):
        query_name = self._run_team_query("turn-names", "Generate your token")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        turn_spans = get_turn_spans(trace)
        assert len(turn_spans) > 0, "No turn spans found"

        for span in turn_spans:
            attrs = _span_attrs(span)
            member_name = attrs.get("turn.member.name", "")
            assert member_name, (
                f"turn.member.name is empty on span '{span['name']}'. "
                "This indicates the team chat is not recording which member spoke."
            )

    @pytest.mark.skip(reason="Known bug: turn.output always empty due to []Message type assertion failure")
    def test_turn_spans_have_output(self):
        query_name = self._run_team_query("turn-output", "Generate your token")
        trace = find_trace_for_query(query_name, timeout=30)
        assert trace is not None

        turn_spans = get_turn_spans(trace)
        assert len(turn_spans) > 0, "No turn spans found"

        for span in turn_spans:
            attrs = _span_attrs(span)
            output = attrs.get("turn.output", "")
            assert output, (
                f"turn.output is empty on span '{span['name']}'. "
                "This indicates the turn produced no output, which may reflect a conversation history bug."
            )
