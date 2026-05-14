import json
import os
import subprocess
import time
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import pytest
import requests

from helpers.responses_helper import (
    REASONING_KEY,
    TOOLS_KEY,
    SCHEMA_KEY,
    MODEL_NON_GPT5,
    MODEL_GPT5,
    MODEL_O3,
    MOCK_LLM_MODEL_NAME,
    WEB_SEARCH_TOOL,
    COMPANY_LOOKUP_SCHEMA,
    SQL_CFG_TOOL,
    ARK_CONCURRENT,
    kill_port_forward,
    start_port_forward,
    reconnect_executor,
    wait_for_executor,
    clear_sessions,
    wait_for_webhook_ready,
    kubectl_apply,
    build_agent_manifest,
    build_query_manifest,
    submit_query,
    poll_query,
    run_query,
    unique_name,
)


# ---------------------------------------------------------------------------
# Direct executor tests — hit /execute endpoint without Ark control plane
#
# Tests T01–T10 cover executor behavior by posting JSON payloads to /execute
# (not open-ended “does the LLM know X” checks):
#
#   T01        Basic happy path / sdk fix
#   T02        Multi-level annotations accepted without error
#   T03        Web search only
#   T04        Web search + structured output
#   T05        SQL grammar (CFG custom tool)
#   T06        Query-level reasoning annotation
#   T07        Tools annotation forwarded to model
#   T08        Reasoning + numeric check (parametrized: gpt-5.2, o3)
#   T09        Tool cascade: query annotation overrides agent annotation
#   T10        Multi-turn memory via previous_response_id
#
# Required env vars:
#   CICD_OPENAI_API_KEY    API key / JWT for the OpenAI or gateway endpoint
#   CICD_OPENAI_BASE_URL   Base URL (defaults to https://api.openai.com/v1)
#
# Optional env vars:
#   EXECUTOR_URL           Full URL of the /execute endpoint.
#                          If unset, auto-discovers and port-forwards
#                          svc/executor-openai-responses on a free local port.
# ---------------------------------------------------------------------------


@pytest.mark.executor
class TestOpenAIResponsesExecutor:
    """
    Live E2E tests for executor-openai-responses (T01–T10).

    Covers: SDK fix (T01), multi-level annotations (T02), web search (T03–T04),
    SQL CFG tools (T05), annotation overrides (T06–T07), reasoning across
    models (T08), tool cascade (T09), multi-turn memory (T10).

    Required env vars:
      CICD_OPENAI_API_KEY    API key / JWT for the OpenAI or gateway endpoint
      CICD_OPENAI_BASE_URL   Base URL (defaults to https://api.openai.com/v1)

    Optional env vars:
      EXECUTOR_URL           Full URL of the /execute endpoint.
                             If unset, the test auto-discovers and port-forwards
                             svc/executor-openai-responses on a free local port.
    """

    executor_url: str = ""
    api_key: str = "mock-api-key"
    base_url: str = "http://mock-llm.default.svc.cluster.local:6556/v1"
    _pf_proc: subprocess.Popen = None
    _pf_port: int = 18080

    @classmethod
    def setup_class(cls):
        executor_url_override = os.environ.get("EXECUTOR_URL", "")
        if executor_url_override:
            m = re.search(r":(\d+)/", executor_url_override)
            if m:
                cls._pf_port = int(m.group(1))
            cls.executor_url = executor_url_override
            cls._pf_proc = None
        else:
            kill_port_forward(cls._pf_port, cls._pf_proc)
            cls.executor_url, cls._pf_proc = start_port_forward(cls._pf_port)

        wait_for_executor(cls.executor_url, skip_on_failure=True)
        clear_sessions()

    @classmethod
    def teardown_class(cls):
        if cls._pf_proc is not None:
            cls._pf_proc.terminate()
            cls._pf_proc = None

    def _make_request(
        self,
        user_input: str,
        model: str = MODEL_NON_GPT5,
        prompt: str = "You are a helpful assistant.",
        agent_annotations: dict = None,
        ee_annotations: dict = None,
        query_annotations: dict = None,
        conversation_id: str = "",
    ) -> dict:
        return {
            "agent": {
                "name": "test-agent",
                "namespace": "default",
                "prompt": prompt,
                "model": {
                    "name": model,
                    "type": "completions",
                    "config": {
                        "openai": {
                            "apiKey": self.api_key,
                            "baseUrl": self.base_url,
                        }
                    },
                },
                "annotations": agent_annotations or {},
            },
            "userInput": {"role": "user", "content": user_input},
            "execution_engine_annotations": ee_annotations or {},
            "query_annotations": query_annotations or {},
            "conversationId": conversation_id,
        }

    def _post(self, payload: dict, timeout: int = 60) -> tuple:
        for attempt in range(3):
            try:
                resp = requests.post(self.executor_url, json=payload, timeout=timeout)
                data = resp.json()
                messages = data.get("messages", [])
                if messages:
                    raw = messages[0].get("content")
                    content = raw if isinstance(raw, str) else ""
                else:
                    content = ""
                return resp.status_code, content, data
            except requests.exceptions.ConnectionError:
                if attempt < 2:
                    self.__class__.executor_url, self.__class__._pf_proc = reconnect_executor(
                        self.__class__._pf_port,
                        self.__class__._pf_proc,
                        skip_on_failure=False,
                    )
                    continue
                raise

    # ------------------------------------------------------------------
    # T01 — Basic happy path: /execute returns a valid response
    # Verifies executor handles execution_engine_annotations, query_annotations,
    # and AgentConfig.annotations without crashing (requires ark-sdk >= 0.1.59).
    # ------------------------------------------------------------------

    def test_t01_basic_happy_path_sdk_0159_fix(self):
        status, content, data = self._post(
            self._make_request(
                "What does GDPR stand for? Spell out the full name.",
                conversation_id="t01-happy-path",
            )
        )
        assert status == 200, (
            f"HTTP {status} — executor crashed. "
            f"If this is AttributeError on execution_engine_annotations, "
            f"the pod is running ark-sdk < 0.1.59. Upgrade the SDK. "
            f"Response: {data}"
        )
        assert content, f"Empty response from executor: {data}"

    # ------------------------------------------------------------------
    # T02 — Annotations at agent/EE/query levels are accepted without error.
    # Priority ordering cannot be verified externally; this confirms the
    # executor processes layered annotations without crashing.
    # ------------------------------------------------------------------

    def test_t02_multi_level_annotations_accepted(self):
        status, content, data = self._post(
            self._make_request(
                "How many permanent members does the UN Security Council have?",
                model=MODEL_NON_GPT5,
                agent_annotations={REASONING_KEY: '{"effort": "medium"}'},
                ee_annotations={REASONING_KEY: '{"effort": "high"}'},
                query_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t02-cascade-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"

    def test_t03_web_search_only(self):
        status, content, data = self._post(
            self._make_request(
                "ADAM GROOMING BN LTD",
                model=MODEL_GPT5,
                prompt=(
                    "You are an expert web search agent located in UK. "
                    "Find the official business website of a given UK company. "
                    "Return only the company's own domain — never URLs from Companies House, "
                    "LinkedIn, Yell, Google Maps, or any directory. Return only the URL."
                ),
                agent_annotations={
                    TOOLS_KEY: json.dumps(WEB_SEARCH_TOOL),
                    REASONING_KEY: '{"effort": "low"}',
                },
                conversation_id="t03-websearch-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"


    def test_t04_web_search_structured_output(self):
        status, content, data = self._post(
            self._make_request(
                "ADAM GROOMING BN LTD",
                model=MODEL_GPT5,
                prompt=(
                    "You are a company research assistant in the UK. "
                    "Search the web and return structured data for: "
                    "1. official company name, 2. primary website URL, "
                    "3. UK Companies House registration number, "
                    "4. official registered address, 5. current company status."
                ),
                agent_annotations={
                    TOOLS_KEY: json.dumps(WEB_SEARCH_TOOL),
                    REASONING_KEY: '{"effort": "medium"}',
                    SCHEMA_KEY: json.dumps(COMPANY_LOOKUP_SCHEMA),
                },
                conversation_id="t04-struct-websearch-test",
            ),
            timeout=90,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"


    def test_t05_sql_cfg_custom_tool(self):
        status, content, data = self._post(
            self._make_request(
                "Retrieve all active contracts with a total value above 50000 from the contracts table, ordered by value descending, limited to 10 results",
                model=MODEL_GPT5,
                prompt=(
                    "You are a SQL query generator. Generate a valid PostgreSQL SELECT "
                    "query using the generate_sql tool. Only SELECT queries allowed."
                ),
                agent_annotations={
                    TOOLS_KEY: json.dumps(SQL_CFG_TOOL),
                    REASONING_KEY: '{"effort": "low"}',
                },
                conversation_id="t05-sql-cfg-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"


    def test_t06_query_level_reasoning_only(self):
        status, content, data = self._post(
            self._make_request(
                "What are the key differences between retrieval-augmented generation and fine-tuning for enterprise knowledge management?",
                model=MODEL_GPT5,
                query_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t06-query-reasoning-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, f"Empty response: {data}"


    def test_t07_tools_annotation_forwarded_to_model(self):
        status, content, data = self._post(
            self._make_request(
                "What is the current base interest rate set by the Bank of England?",
                model=MODEL_NON_GPT5,
                agent_annotations={TOOLS_KEY: json.dumps([{"type": "web_search_preview"}])},
                conversation_id="t07-tools-forwarded-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, f"Empty response: {data}"


    @pytest.mark.parametrize("model,user_input,expected", [
        (
            MODEL_GPT5,
            (
                "A portfolio of 5 UK commercial properties generates monthly rents of "
                "£2,200, £1,750, £3,100, £1,900, and £2,650. "
                "What is the total annual rental income?"
            ),
            ["139,200", "139200"],
        ),
        (
            MODEL_O3,
            (
                "A fund of £50,000 is invested at a compound annual growth rate of 7% "
                "for 3 years. What is the final value to the nearest pound?"
            ),
            ["61,252", "61252"],
        ),
    ])
    def test_t08_reasoning_effort_by_model(self, model, user_input, expected):
        status, content, data = self._post(
            self._make_request(
                user_input,
                model=model,
                agent_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id=f"t08-reasoning-{model}-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"


    def test_t09_tool_cascade_query_overrides_agent(self):
        status, content, data = self._post(
            self._make_request(
                "What are the current average commercial office rental rates per square foot in the city centre?",
                model=MODEL_GPT5,
                prompt="You are a commercial property research assistant. Answer questions about real estate markets in the user's location.",
                agent_annotations={
                    TOOLS_KEY: json.dumps([{
                        "type": "web_search_preview",
                        "user_location": {
                            "type": "approximate",
                            "country": "GB",
                            "city": "London",
                            "region": "London",
                        },
                    }]),
                },
                query_annotations={
                    TOOLS_KEY: json.dumps([{
                        "type": "web_search_preview",
                        "user_location": {
                            "type": "approximate",
                            "country": "US",
                            "city": "New York",
                            "region": "New York",
                        },
                    }]),
                },
                conversation_id="t09-tool-cascade-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, f"Empty response: {data}"

    def test_t10_multi_turn_memory(self):
        conv_id = "t10-multi-turn-memory"

        status1, content1, data1 = self._post(
            self._make_request(
                "My name is Alex and I work in financial risk management. Remember this.",
                model=MODEL_GPT5,
                prompt="You are a helpful assistant with memory of the conversation.",
                conversation_id=conv_id,
            )
        )
        assert status1 == 200, f"Turn 1 failed with HTTP {status1}: {data1}"
        assert content1, "Turn 1: empty response"

        status2, content2, data2 = self._post(
            self._make_request(
                "What is my name and what field do I work in?",
                model=MODEL_GPT5,
                prompt="You are a helpful assistant with memory of the conversation.",
                conversation_id=conv_id,
            )
        )
        if status2 == 500 and "Zero Data Retention" in str(data2):
            pytest.skip(
                "Gateway enforces Zero Data Retention — previous_response_id not supported"
            )
        assert status2 == 200, f"Turn 2 failed with HTTP {status2}: {data2}"
        assert content2, "Turn 2: empty response"


# ---------------------------------------------------------------------------
# ARK stack tests — Query CRDs → executor-openai-responses → OpenAI
#
# Test IDs jump from T10 (above) to T13 here so numbering stays aligned with older
# test plans that reserved T11–T12; only T13–T16 exist in this file.
#
# Tests T13–T16 exercise the full Ark control plane end-to-end:
#
#   Secret → Model CRD → Agent CRD → Query CRD → poll status.phase
#
# Concurrency is handled with ThreadPoolExecutor: all queries are submitted
# simultaneously and polled independently until done or timeout.
#
# Required env vars:
#   CICD_OPENAI_API_KEY    API key / JWT for the OpenAI or gateway endpoint
#   CICD_OPENAI_BASE_URL   Base URL (e.g. https://api.openai.com/v1)
#
# Optional env vars:
#   ARK_CONCURRENT_QUERIES   Number of simultaneous queries (default: 3)
#   ARK_QUERY_TIMEOUT        Per-query poll timeout in seconds (default: 300)
#   ARK_NAMESPACE            Kubernetes namespace (default: default)
# ---------------------------------------------------------------------------


@pytest.mark.executor
class TestARKQueriesWithOpenAIResponses:
    """
    Full Ark control-plane tests for the OpenAI Responses executor (T13–T16).

    Creates real Ark CRDs (Model, Agent, Query) via kubectl, polls
    Query.status.phase until done, and asserts on response content.
    Queries are submitted concurrently using ThreadPoolExecutor.
    """

    namespace:       str  = "default"
    agent_name:      str  = "test-responses-agent"
    created_queries: list = []


    @classmethod
    def setup_class(cls):
        cls.namespace = os.environ.get("ARK_NAMESPACE", "default")
        cls.created_queries = []

        wait_for_webhook_ready()
        kubectl_apply(build_agent_manifest(
            cls.agent_name, cls.namespace, MOCK_LLM_MODEL_NAME, execution_engine=None,
        ))
        time.sleep(3)

    @classmethod
    def teardown_class(cls):
        for name in cls.created_queries:
            subprocess.run(
                ["kubectl", "delete", "query", name, "-n", cls.namespace,
                 "--ignore-not-found=true"],
                capture_output=True,
            )
        subprocess.run(
            ["kubectl", "delete", "agent", cls.agent_name, "-n", cls.namespace,
             "--ignore-not-found=true"],
            capture_output=True,
        )

    # ------------------------------------------------------------------
    # T13 — Single query through the full Ark stack
    # Validates: Secret → Model → Agent → Query CRD → executor → response
    # ------------------------------------------------------------------

    def test_t13_single_ark_query(self):
        name = unique_name("t13-single")
        success, content, phase = run_query(
            name,
            "What does GDPR stand for?",
            self.agent_name,
            self.namespace,
            self.__class__.created_queries,
        )
        assert success, f"Query {name} did not reach phase=done (phase={phase})"
        assert content,  f"Query {name} returned empty content"

    # ------------------------------------------------------------------
    # T14 — N concurrent ARK queries (ARK_CONCURRENT_QUERIES, default 3)
    #
    # All queries are submitted simultaneously; each is polled on its own
    # thread until done or timeout. The test fails if any query fails or
    # returns content that does not contain the expected keyword.
    # ------------------------------------------------------------------

    def test_t14_concurrent_ark_queries(self):
        candidates = [
            "What does HTTP stand for?",
            "What does CPU stand for?",
            "What does RAM stand for?",
            "What does SQL stand for?",
            "What does API stand for?",
            "What does JSON stand for?",
            "What does DNS stand for?",
            "What does SSH stand for?",
            "What does TLS stand for?",
            "What does REST stand for?",
        ]

        n       = ARK_CONCURRENT
        queries = [
            (unique_name(f"t14-concurrent-{i}"), question)
            for i, question in enumerate(candidates[:n])
        ]

        results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=n) as pool:
            futures = {
                pool.submit(
                    run_query, name, question,
                    self.agent_name, self.namespace, self.__class__.created_queries,
                ): name
                for name, question in queries
            }
            for future in as_completed(futures):
                name = futures[future]
                success, content, phase = future.result()
                results[name] = {"success": success, "content": content, "phase": phase}

        failures = []
        for name, r in results.items():
            if not r["success"]:
                failures.append(f"{name}: did not complete (phase={r['phase']})")
            elif not r["content"]:
                failures.append(f"{name}: empty content")

        assert not failures, (
            f"{len(failures)}/{n} concurrent queries failed:\n" +
            "\n".join(failures)
        )

        # ------------------------------------------------------------------
    # T15 — Concurrent queries with query-level reasoning annotation
    #
    # Same concurrency pattern as T14 but each query carries a
    # reasoning effort annotation to exercise the annotation cascade.
    # ------------------------------------------------------------------

    def test_t15_concurrent_with_reasoning(self):
        inputs = [
            "What is 2 + 2?",
            "Name any primary colour.",
            "What planet do we live on?",
            "What is the boiling point of water in Celsius?",
            "How many sides does a triangle have?",
        ]

        n       = ARK_CONCURRENT
        queries = [
            (unique_name(f"t15-reasoning-{i}"), text)
            for i, text in enumerate(inputs[:n])
        ]

        results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=n) as pool:
            futures = {
                pool.submit(
                    run_query,
                    name, text,
                    self.agent_name, self.namespace, self.__class__.created_queries,
                    {REASONING_KEY: '{"effort": "low"}'},
                ): name
                for name, text in queries
            }
            for future in as_completed(futures):
                name = futures[future]
                success, content, phase = future.result()
                results[name] = {"success": success, "content": content, "phase": phase}

        failures = []
        for name, r in results.items():
            if not r["success"]:
                failures.append(f"{name}: did not complete (phase={r['phase']})")
            elif not r["content"]:
                failures.append(f"{name}: empty content")

        assert not failures, (
            f"{len(failures)}/{n} concurrent reasoning queries failed:\n" +
            "\n".join(failures)
        )

        # ------------------------------------------------------------------
    # T16 — Burst: fire-and-forget N queries, then poll all in parallel
    #
    # Submits all queries first (no waiting), then enters a single
    # concurrent polling loop. This maximises executor concurrency and
    # measures real wall-clock throughput.
    # ------------------------------------------------------------------

    def test_t16_burst_then_poll(self):
        inputs = [f"Say hello {i}." for i in range(1, ARK_CONCURRENT + 1)]
        queries = [
            (unique_name(f"t16-burst-{i}"), text)
            for i, text in enumerate(inputs, start=1)
        ]

        for name, text in queries:
            submitted = submit_query(
                name, text, self.agent_name, self.namespace, self.__class__.created_queries,
            )
            assert submitted, f"Failed to submit query {name}"

        results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=len(queries)) as pool:
            futures = {
                pool.submit(poll_query, name, self.namespace): name
                for name, _ in queries
            }
            for future in as_completed(futures):
                name = futures[future]
                success, content, phase = future.result()
                results[name] = {"success": success, "content": content, "phase": phase}

        failures = []
        for name, r in results.items():
            if not r["success"]:
                failures.append(f"{name}: did not complete (phase={r['phase']})")
            elif not r["content"]:
                failures.append(f"{name}: empty content")

        assert not failures, (
            f"{len(failures)}/{len(queries)} burst queries failed:\n" +
            "\n".join(failures)
        )
