import base64
import json
import os
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import pytest
import requests

REASONING_KEY = "executor-openai-responses.ark.mckinsey.com/reasoning"
TOOLS_KEY     = "executor-openai-responses.ark.mckinsey.com/tools"
SCHEMA_KEY    = "executor-openai-responses.ark.mckinsey.com/output-schema"

MODEL_NON_GPT5 = "gpt-4o"
MODEL_GPT5     = "gpt-5.2-2025-12-11"
MODEL_O1       = "o1"
MODEL_O3       = "o3"
MODEL_O4_MINI  = "o4-mini"

WEB_SEARCH_TOOL = [
    {
        "type": "web_search_preview",
        "user_location": {"type": "approximate", "country": "GB", "city": "London", "region": "London"},
    }
]

COMPANY_LOOKUP_SCHEMA = {
    "type": "object",
    "properties": {
        "company_name":           {"type": "string"},
        "website_url":            {"type": "string"},
        "companies_house_number": {"type": "string"},
        "registered_address":     {"type": "string"},
        "company_status":         {"type": "string"},
    },
    "required": [
        "company_name", "website_url", "companies_house_number",
        "registered_address", "company_status",
    ],
    "additionalProperties": False,
}

SQL_CFG_TOOL = [
    {
        "type": "custom",
        "name": "generate_sql",
        "description": "Generate a valid read-only PostgreSQL SELECT query constrained by grammar",
        "format": {
            "type": "grammar",
            "syntax": "lark",
            "definition": (
                'SP: " "\nCOMMA: ","\nGT: ">"\nLT: "<"\nEQ: "="\nSEMI: ";"\n\n'
                'start: "SELECT" SP select_list SP "FROM" SP table '
                'where_clause? order_clause? limit_clause SEMI\n\n'
                'select_list: "*" | column (COMMA SP column)*\ncolumn: IDENTIFIER\n\n'
                'table: IDENTIFIER\n\n'
                'where_clause: SP "WHERE" SP condition (SP "AND" SP condition)*\n'
                'condition: IDENTIFIER SP op SP value\n'
                'op: GT | LT | EQ | ">=" | "<=" | "!="\n'
                'value: NUMBER | QUOTED_STRING\n\n'
                'order_clause: SP "ORDER" SP "BY" SP IDENTIFIER SP ("ASC" | "DESC")\n'
                'limit_clause: SP "LIMIT" SP NUMBER\n\n'
                'IDENTIFIER: /[A-Za-z_][A-Za-z0-9_]*/\nNUMBER: /[0-9]+/\n'
                "QUOTED_STRING: /\\'[^']*\\'/\n"
            ),
        },
    }
]


@pytest.mark.executor
class TestOpenAIResponsesExecutor:
    """
    Live E2E tests for executor-openai-responses (T01, T13–T25).

    Tests patterns from agents-at-scale-marketplace PR #211:
      feat(openai-responses): improve example agents and docs
      https://github.com/mckinsey/agents-at-scale-marketplace/pull/211

    Covers: SDK fix (T01), reasoning cascades (T13), web search (T14–T15),
    SQL CFG tools (T16), annotation overrides (T17–T18), GPT-5/o-series
    models (T19a–T24), multi-turn memory (T25).

    Required env vars:
      CICD_OPENAI_API_KEY    API key / JWT for the OpenAI or gateway endpoint
      CICD_OPENAI_BASE_URL   Base URL (defaults to https://api.openai.com/v1)

    Optional env vars:
      EXECUTOR_URL           Full URL of the /execute endpoint.
                             If unset, the test auto-discovers and port-forwards
                             svc/executor-openai-responses on a free local port.
    """

    executor_url: str = ""
    api_key: str = ""
    base_url: str = ""
    _pf_proc: subprocess.Popen = None
    _pf_port: int = 18080

    @classmethod
    def setup_class(cls):
        cls.api_key = os.environ.get("CICD_OPENAI_API_KEY", "")
        if not cls.api_key:
            pytest.skip("CICD_OPENAI_API_KEY not set")

        cls.base_url = os.environ.get("CICD_OPENAI_BASE_URL", "")
        if not cls.base_url:
            pytest.skip("CICD_OPENAI_BASE_URL not set")

        executor_url_override = os.environ.get("EXECUTOR_URL", "")
        if executor_url_override:
            import re
            m = re.search(r":(\d+)/", executor_url_override)
            if m:
                cls._pf_port = int(m.group(1))
            cls.executor_url = executor_url_override
            cls._pf_proc = None
        else:
            cls.executor_url, cls._pf_proc = cls._start_port_forward()

        cls._wait_for_executor()
        cls._clear_sessions()

    @classmethod
    def teardown_class(cls):
        if cls._pf_proc is not None:
            cls._pf_proc.terminate()
            cls._pf_proc = None

    @classmethod
    def _kill_port_forward(cls):
        if cls._pf_proc is not None:
            try:
                cls._pf_proc.terminate()
                cls._pf_proc.wait(timeout=5)
            except Exception:
                pass
            cls._pf_proc = None
        subprocess.run(
            ["pkill", "-f", f"kubectl.*port-forward.*{cls._pf_port}"],
            capture_output=True,
        )
        time.sleep(1)

    @classmethod
    def _start_port_forward(cls) -> tuple:
        result = subprocess.run(
            ["kubectl", "get", "svc", "executor-openai-responses", "-n", "default"],
            capture_output=True,
        )
        if result.returncode != 0:
            pytest.skip(
                "executor-openai-responses service not found and EXECUTOR_URL not set. "
                "Deploy the executor or set EXECUTOR_URL."
            )

        cls._kill_port_forward()

        proc = subprocess.Popen(
            ["kubectl", "port-forward", "-n", "default",
             "svc/executor-openai-responses", f"{cls._pf_port}:8000"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(3)
        cls._pf_proc = proc
        return f"http://localhost:{cls._pf_port}/execute", proc

    @classmethod
    def _reconnect(cls, skip_on_failure: bool = False):
        subprocess.run(
            ["kubectl", "wait", "--for=condition=ready", "pod",
             "-l", "app=executor-openai-responses", "-n", "default", "--timeout=90s"],
            capture_output=True,
        )
        cls.executor_url, cls._pf_proc = cls._start_port_forward()
        cls._wait_for_executor(skip_on_failure=skip_on_failure)

    @classmethod
    def _wait_for_executor(cls, retries: int = 10, delay: float = 2.0,
                           skip_on_failure: bool = True):
        health_url = cls.executor_url.replace("/execute", "/health")
        for _ in range(retries):
            try:
                resp = requests.get(health_url, timeout=20)
                if resp.status_code == 200:
                    return
            except (requests.exceptions.ConnectionError, requests.exceptions.ReadTimeout):
                pass
            time.sleep(delay)
        msg = f"Executor not reachable at {cls.executor_url} after {retries} retries"
        if skip_on_failure:
            pytest.skip(msg)
        else:
            raise RuntimeError(msg)

    @classmethod
    def _clear_sessions(cls):
        pod = subprocess.run(
            ["kubectl", "get", "pod", "-n", "default",
             "-l", "app=executor-openai-responses",
             "-o", "jsonpath={.items[0].metadata.name}"],
            capture_output=True, text=True,
        )
        if pod.returncode == 0 and pod.stdout.strip():
            subprocess.run(
                ["kubectl", "exec", "-n", "default", pod.stdout.strip(),
                 "--", "rm", "-rf", "/data/sessions/"],
                capture_output=True,
            )

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
                content = messages[0]["content"] if messages else ""
                return resp.status_code, content, data
            except requests.exceptions.ConnectionError:
                if attempt < 2:
                    self.__class__._reconnect(skip_on_failure=False)
                    continue
                raise

    # ------------------------------------------------------------------
    # T01 — Basic happy path: /execute returns a valid response
    # Verifies executor handles execution_engine_annotations, query_annotations,
    # and AgentConfig.annotations without crashing (requires ark-sdk >= 0.1.59).
    # ------------------------------------------------------------------

    @pytest.mark.executor
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
        assert data.get("error", "") == "", f"Executor returned error: {data['error']}"
        assert content, "No content in response"
        assert "general data protection regulation" in content.lower(), (
            f"Expected full GDPR expansion in response, got: {content[:200]}"
        )

    @pytest.mark.executor
    def test_t13_reasoning_cascade(self):
        status, content, data = self._post(
            self._make_request(
                "How many permanent members does the UN Security Council have?",
                model=MODEL_NON_GPT5,
                agent_annotations={REASONING_KEY: '{"effort": "medium"}'},
                ee_annotations={REASONING_KEY: '{"effort": "high"}'},
                query_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t13-cascade-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert "5" in content or "five" in content.lower(), (
            f"Expected '5' or 'five' (permanent members) with query-level reasoning, got: {content[:200]}"
        )

    @pytest.mark.executor
    def test_t14_web_search_only(self):
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
                conversation_id="t14-websearch-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert any(w in content.lower() for w in ["http", "www", ".com"]), (
            f"Expected a URL in response, got: {content[:200]}"
        )


    @pytest.mark.executor
    def test_t15_web_search_structured_output(self):
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
                conversation_id="t15-struct-websearch-test",
            ),
            timeout=90,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            pytest.fail(f"Response is not valid JSON: {content[:300]}")

        required = {
            "company_name", "website_url", "companies_house_number",
            "registered_address", "company_status",
        }
        missing = required - set(parsed.keys())
        assert not missing, f"JSON missing fields {missing}: {content[:300]}"


    @pytest.mark.executor
    def test_t16_sql_cfg_custom_tool(self):
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
                conversation_id="t16-sql-cfg-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert "SELECT" in content.upper() and "FROM" in content.upper(), (
            f"Expected a SQL SELECT statement, got: {content[:200]}"
        )


    @pytest.mark.executor
    def test_t17_query_level_reasoning_only(self):
        status, content, data = self._post(
            self._make_request(
                "What are the key differences between retrieval-augmented generation and fine-tuning for enterprise knowledge management?",
                model=MODEL_GPT5,
                query_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t17-query-reasoning-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert len(content) > 50, f"Unexpectedly short response: {repr(content)}"
        assert any(w in content.lower() for w in ["retrieval", "fine-tun", "knowledge"]), (
            f"Response does not address the question: {content[:200]}"
        )


    @pytest.mark.executor
    def test_t18_debug_logging_tools_forwarded(self):
        status, content, data = self._post(
            self._make_request(
                "What is the current base interest rate set by the Bank of England?",
                model=MODEL_NON_GPT5,
                agent_annotations={TOOLS_KEY: json.dumps([{"type": "web_search_preview"}])},
                conversation_id="t18-debug-logging-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert len(content) > 10, f"Unexpectedly short response: {repr(content)}"
        assert "%" in content or "percent" in content.lower() or "rate" in content.lower(), (
            f"Expected interest rate information in response, got: {content[:200]}"
        )



    @pytest.mark.executor
    def test_t19a_gpt52_enables_reasoning(self):
        status, content, data = self._post(
            self._make_request(
                (
                    "A portfolio of 5 UK commercial properties generates monthly rents of "
                    "£2,200, £1,750, £3,100, £1,900, and £2,650. "
                    "What is the total annual rental income?"
                ),
                model="gpt-5.2-2025-12-11",
                agent_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t19a-gpt52-reasoning-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert "139,200" in content or "139200" in content, (
            f"Expected annual rental income of £139,200, got: {content[:200]}"
        )

    @pytest.mark.executor
    def test_t19b_o3_reasoning_effort(self):
        status, content, data = self._post(
            self._make_request(
                (
                    "A fund of £50,000 is invested at a compound annual growth rate of 7% "
                    "for 3 years. What is the final value to the nearest pound?"
                ),
                model="o3",
                agent_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t19b-o3-reasoning-test",
            )
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert "61,252" in content or "61252" in content, (
            f"Expected compound growth result of £61,252, got: {content[:200]}"
        )


    @pytest.mark.executor
    def test_t20_tool_cascade_query_overrides_agent(self):
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
                conversation_id="t20-tool-cascade-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert len(content) > 10, f"Unexpectedly short response: {repr(content)}"
        assert any(w in content.lower() for w in ["new york", "york", "nyc", "manhattan"]), (
            f"Expected New York result (query annotation should override agent's London location). "
            f"Got: {content[:300]}"
        )

    @pytest.mark.executor
    def test_t21_o4_mini_basic_completion(self):
        status, content, data = self._post(
            self._make_request(
                "What is the legal definition of a data processor under GDPR, and how does it differ from a data controller?",
                model=MODEL_O4_MINI,
                prompt="You are a legal and compliance assistant. Answer questions about data protection law accurately and concisely.",
                conversation_id="t21-o4mini-basic-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert len(content) > 50, f"Unexpectedly short response: {repr(content)}"
        assert any(w in content.lower() for w in ["processor", "controller", "gdpr", "personal data"]), (
            f"Response does not address GDPR data roles: {content[:200]}"
        )

    @pytest.mark.executor
    def test_t22_o4_mini_reasoning_effort(self):
        status, content, data = self._post(
            self._make_request(
                (
                    "A SaaS company has £180,000 in annual recurring revenue across 60 customers. "
                    "Three enterprise customers churn, each paying £2,400 per year. "
                    "What is the new ARR after churn?"
                ),
                model=MODEL_O4_MINI,
                prompt="You are a SaaS financial analyst. Provide precise numerical answers.",
                agent_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t22-o4mini-reasoning-test",
            ),
            timeout=60,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert "172,800" in content or "172800" in content, (
            f"Expected new ARR of £172,800 after churn, got: {content[:200]}"
        )


    @pytest.mark.executor
    def test_t23_o3_high_reasoning_complex_problem(self):
        status, content, data = self._post(
            self._make_request(
                (
                    "A law firm charges the following rates: Associate £250/hour, "
                    "Senior Associate £400/hour, Partner £650/hour. "
                    "A client engagement requires 40 hours of Associate work, "
                    "15 hours of Senior Associate work, and 8 hours of Partner work. "
                    "A 10% discount applies because the client has a 3-year retainer. "
                    "What is the total invoice amount after the discount?"
                ),
                model=MODEL_O3,
                prompt="You are a legal billing analyst. Provide the exact final invoice amount in pounds.",
                agent_annotations={REASONING_KEY: '{"effort": "high"}'},
                conversation_id="t23-o3-complex-reasoning-test",
            ),
            timeout=120,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert "19,080" in content or "19080" in content, (
            f"Expected discounted invoice of £19,080, got: {content[:200]}"
        )

    @pytest.mark.executor
    def test_t24_o1_medium_reasoning_document_analysis(self):
        status, content, data = self._post(
            self._make_request(
                (
                    "```\n"
                    "Contract clause: The licensee may not sublicense, sell, resell, "
                    "transfer, assign, or otherwise commercially exploit or make available "
                    "to any third party the Service or the Content.\n"
                    "```\n"
                    "Does this clause prohibit SaaS reselling? Answer yes or no with one reason."
                ),
                model=MODEL_O1,
                prompt="You are a legal analysis assistant. Analyze contract clauses accurately.",
                agent_annotations={REASONING_KEY: '{"effort": "medium"}'},
                conversation_id="t24-o1-doc-analysis-test",
            ),
            timeout=120,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content, "Empty response"
        assert "yes" in content.lower(), (
            f"Expected 'yes' (clause prohibits reselling), got: {content[:200]}"
        )

    @pytest.mark.executor
    def test_t25_multi_turn_memory(self):
        conv_id = "t25-multi-turn-memory"

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
        assert status2 == 200, f"Turn 2 failed with HTTP {status2}: {data2}"
        assert content2, "Turn 2: empty response"
        assert "alex" in content2.lower(), (
            f"Expected name 'Alex' recalled in turn 2, got: {content2[:200]}"
        )
        assert any(w in content2.lower() for w in ["financial", "risk", "management"]), (
            f"Expected field recalled in turn 2, got: {content2[:200]}"
        )


# ---------------------------------------------------------------------------
# ARK stack tests — Query CRDs → executor-openai-responses → OpenAI
#
# Unlike TestOpenAIResponsesExecutor (which hits the executor /execute endpoint
# directly), these tests exercise the full Ark control plane:
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

_ARK_CONCURRENT = int(os.environ.get("ARK_CONCURRENT_QUERIES", "3"))
_ARK_TIMEOUT    = int(os.environ.get("ARK_QUERY_TIMEOUT", "300"))
_POLL_INTERVAL  = 5


@pytest.mark.executor
class TestARKQueriesWithOpenAIResponses:
    """
    Full Ark control-plane tests for the OpenAI Responses executor.

    Creates real Ark CRDs (Model, Agent, Query) via kubectl, polls
    Query.status.phase until done, and asserts on response content.
    Queries are submitted concurrently using ThreadPoolExecutor.
    """

    namespace:        str  = "default"
    api_key:          str  = ""
    base_url:         str  = ""
    secret_name:      str  = "test-responses-creds"
    model_name:       str  = "test-responses-model"
    agent_name:       str  = "test-responses-agent"
    created_queries:  list = []
    _webhook_patched: bool = False


    @classmethod
    def setup_class(cls):
        cls.api_key = os.environ.get("CICD_OPENAI_API_KEY", "")
        if not cls.api_key:
            pytest.skip("CICD_OPENAI_API_KEY not set")

        cls.base_url = os.environ.get("CICD_OPENAI_BASE_URL", "")
        if not cls.base_url:
            pytest.skip("CICD_OPENAI_BASE_URL not set")

        cls.namespace = os.environ.get("ARK_NAMESPACE", "default")
        cls.created_queries = []

        cls._check_executor_ready()
        cls._wait_for_webhook_ready()
        cls._webhook_patched = cls._patch_ark_webhooks_failure_policy("Ignore")
        cls._apply(cls._secret_yaml())
        cls._apply(cls._model_yaml())
        cls._apply(cls._agent_yaml())
        time.sleep(3)

    @classmethod
    def teardown_class(cls):
        if cls._webhook_patched:
            cls._patch_ark_webhooks_failure_policy("Fail")
        for name in cls.created_queries:
            subprocess.run(
                ["kubectl", "delete", "query", name, "-n", cls.namespace,
                 "--ignore-not-found=true"],
                capture_output=True,
            )
        for resource, name in [
            ("agent",  cls.agent_name),
            ("model",  cls.model_name),
            ("secret", cls.secret_name),
        ]:
            subprocess.run(
                ["kubectl", "delete", resource, name, "-n", cls.namespace,
                 "--ignore-not-found=true"],
                capture_output=True,
            )


    @classmethod
    def _kubectl(cls, cmd: list, stdin: str = None, timeout: int = 30) -> tuple:
        try:
            r = subprocess.run(
                cmd, input=stdin, capture_output=True, text=True, timeout=timeout,
            )
            return r.returncode == 0, r.stdout, r.stderr
        except Exception as e:
            return False, "", str(e)

    @classmethod
    def _patch_ark_webhooks_failure_policy(cls, policy: str) -> bool:
        patched = False
        for kind, resource in [
            ("mutatingwebhookconfiguration",  "ark-mutating-webhook-configuration"),
            ("validatingwebhookconfiguration", "ark-validating-webhook-configuration"),
        ]:
            ok, stdout, _ = cls._kubectl([
                "kubectl", "get", kind, resource, "-o", "json",
            ])
            if not ok:
                continue
            try:
                config = json.loads(stdout)
                webhooks = config.get("webhooks", [])
            except json.JSONDecodeError:
                continue
            ops = [
                {"op": "replace", "path": f"/webhooks/{i}/failurePolicy", "value": policy}
                for i, _ in enumerate(webhooks)
            ]
            if not ops:
                continue
            ok, _, _ = cls._kubectl([
                "kubectl", "patch", kind, resource,
                "--type=json", f"-p={json.dumps(ops)}",
            ])
            if ok:
                patched = True
        return patched

    @classmethod
    def _wait_for_webhook_ready(cls, retries: int = 20, delay: float = 10.0):
        for _ in range(retries):
            ok, stdout, _ = cls._kubectl([
                "kubectl", "get", "endpoints", "ark-webhook-service",
                "-n", "ark-system", "-o", "json",
            ])
            if ok and stdout:
                try:
                    data = json.loads(stdout)
                    for subset in data.get("subsets", []):
                        if subset.get("addresses"):
                            return
                except json.JSONDecodeError:
                    pass
            time.sleep(delay)
        pytest.skip(f"ark-webhook-service not ready after {retries} retries")

    @classmethod
    def _apply(cls, yaml_str: str):
        for attempt in range(3):
            ok, _, err = cls._kubectl(
                ["kubectl", "apply", "-f", "-"], stdin=yaml_str, timeout=120,
            )
            if ok:
                return
            if ("connection refused" in err or "failed calling webhook" in err) and attempt < 2:
                cls._wait_for_webhook_ready()
                continue
            assert False, f"kubectl apply failed:\n{err}\n---\n{yaml_str}"

    @classmethod
    def _check_executor_ready(cls):
        ok, stdout, _ = cls._kubectl([
            "kubectl", "get", "executionengine", "executor-openai-responses",
            "-n", cls.namespace, "-o", "jsonpath={.status.phase}",
        ])
        if not ok:
            pytest.skip("executor-openai-responses ExecutionEngine not found in cluster")

    @classmethod
    def _secret_yaml(cls) -> str:
        ak = base64.b64encode(cls.api_key.encode()).decode()
        bu = base64.b64encode(cls.base_url.encode()).decode()
        return f"""apiVersion: v1
kind: Secret
metadata:
  name: {cls.secret_name}
  namespace: {cls.namespace}
type: Opaque
data:
  api-key: {ak}
  base-url: {bu}
"""

    @classmethod
    def _model_yaml(cls) -> str:
        return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: {cls.model_name}
  namespace: {cls.namespace}
spec:
  provider: openai
  type: completions
  model:
    value: gpt-4o
  config:
    openai:
      apiKey:
        valueFrom:
          secretKeyRef:
            name: {cls.secret_name}
            key: api-key
      baseUrl:
        valueFrom:
          secretKeyRef:
            name: {cls.secret_name}
            key: base-url
"""

    @classmethod
    def _agent_yaml(cls) -> str:
        return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {cls.agent_name}
  namespace: {cls.namespace}
spec:
  modelRef:
    name: {cls.model_name}
  executionEngine:
    name: executor-openai-responses
  prompt: |
    You are a concise assistant. Answer questions directly and briefly.
    Do not add unnecessary explanation or caveats.
"""

    def _query_yaml(self, name: str, input_text: str,
                    annotations: Optional[dict] = None) -> str:
        ann_block = ""
        if annotations:
            lines = "\n".join(
                f"    {k}: '{str(v).replace(chr(39), chr(39) + chr(39))}'"
                for k, v in annotations.items()
            )
            ann_block = f"  annotations:\n{lines}\n"
        safe_input = input_text.replace('"', '\\"')
        return f"""apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: {name}
  namespace: {self.namespace}
{ann_block}spec:
  target:
    type: agent
    name: {self.agent_name}
  input: "{safe_input}"
  type: user
  timeout: 5m
  ttl: 1h
"""

    def _submit_query(self, name: str, input_text: str,
                      annotations: Optional[dict] = None) -> bool:
        ok, _, err = self._kubectl(
            ["kubectl", "apply", "-f", "-"],
            stdin=self._query_yaml(name, input_text, annotations),
            timeout=120,
        )
        if ok:
            self.__class__.created_queries.append(name)
        return ok

    def _poll_query(self, name: str,
                    timeout: int = _ARK_TIMEOUT) -> tuple[bool, Optional[str], str]:
        """
        Poll Query.status.phase until done/error or timeout.
        Returns (success, response_content, final_phase).
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            ok, stdout, _ = self._kubectl([
                "kubectl", "get", "query", name, "-n", self.namespace, "-o", "json",
            ])
            if ok and stdout:
                try:
                    data   = json.loads(stdout)
                    status = data.get("status", {})
                    phase  = status.get("phase", "")

                    if phase == "done":
                        content = status.get("response", {}).get("content", "")
                        if not content:
                            return False, None, "empty_response"
                        return True, content, phase

                    if phase in ("error", "submit_failed"):
                        return False, None, phase

                except json.JSONDecodeError:
                    pass
            time.sleep(_POLL_INTERVAL)

        return False, None, "timeout"

    def _run_query(self, name: str, input_text: str,
                   annotations: Optional[dict] = None) -> tuple[bool, Optional[str], str]:
        """Submit a Query CRD and poll until complete. Returns (success, content, phase)."""
        if not self._submit_query(name, input_text, annotations):
            return False, None, "submit_failed"
        return self._poll_query(name)

    def _unique(self, prefix: str) -> str:
        return f"{prefix}-{uuid.uuid4().hex[:6]}"

    # ------------------------------------------------------------------
    # T30 — Single query through the full Ark stack
    # Validates: Secret → Model → Agent → Query CRD → executor → response
    # ------------------------------------------------------------------

    @pytest.mark.executor
    def test_t30_single_ark_query(self):
        name = self._unique("t30-single")
        success, content, phase = self._run_query(
            name,
            "What does GDPR stand for? Reply with the full expanded name only.",
        )
        assert success, f"Query {name} did not reach phase=done (phase={phase})"
        assert content,  f"Query {name} returned empty content"
        assert "general data protection regulation" in content.lower(), (
            f"Expected GDPR expansion, got: {content[:200]}"
        )

    # ------------------------------------------------------------------
    # T31 — N concurrent ARK queries (ARK_CONCURRENT_QUERIES, default 3)
    #
    # All queries are submitted simultaneously; each is polled on its own
    # thread until done or timeout. The test fails if any query fails or
    # returns content that does not contain the expected keyword.
    # ------------------------------------------------------------------

    @pytest.mark.executor
    def test_t31_concurrent_ark_queries(self):
        candidates = [
            ("What does HTTP stand for? Reply with the full name only.",
             ["hypertext transfer protocol"]),
            ("What does CPU stand for? Reply with the full name only.",
             ["central processing unit"]),
            ("What does RAM stand for? Reply with the full name only.",
             ["random access memory"]),
            ("What does SQL stand for? Reply with the full name only.",
             ["structured query language"]),
            ("What does API stand for? Reply with the full name only.",
             ["application programming interface"]),
            ("What does JSON stand for? Reply with the full name only.",
             ["javascript object notation"]),
            ("What does DNS stand for? Reply with the full name only.",
             ["domain name system"]),
            ("What does SSH stand for? Reply with the full name only.",
             ["secure shell"]),
            ("What does TLS stand for? Reply with the full name only.",
             ["transport layer security"]),
            ("What does REST stand for? Reply with the full name only.",
             ["representational state transfer"]),
        ]

        n       = _ARK_CONCURRENT
        batch   = candidates[:n]
        queries = [
            (self._unique(f"t31-concurrent-{i}"), question, keywords)
            for i, (question, keywords) in enumerate(batch)
        ]

        results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=n) as pool:
            futures = {
                pool.submit(self._run_query, name, question): (name, keywords)
                for name, question, keywords in queries
            }
            for future in as_completed(futures):
                name, keywords = futures[future]
                success, content, phase = future.result()
                results[name] = {
                    "success": success, "content": content,
                    "phase": phase,     "keywords": keywords,
                }

        failures = []
        for name, r in results.items():
            if not r["success"]:
                failures.append(f"{name}: did not complete (phase={r['phase']})")
                continue
            if not r["content"]:
                failures.append(f"{name}: empty content")
                continue
            low = r["content"].lower()
            if not any(kw in low for kw in r["keywords"]):
                failures.append(
                    f"{name}: expected one of {r['keywords']!r} in response, "
                    f"got: {r['content'][:150]}"
                )

        assert not failures, (
            f"{len(failures)}/{n} concurrent queries failed:\n" +
            "\n".join(failures)
        )

    # ------------------------------------------------------------------
    # T32 — Concurrent queries with query-level reasoning annotation
    #
    # Same concurrency pattern as T31 but each query carries a
    # reasoning effort annotation to exercise the annotation cascade.
    # ------------------------------------------------------------------

    @pytest.mark.executor
    def test_t32_concurrent_with_reasoning(self):
        problems = [
            (
                "A shop sells apples for £0.50 each. Alice buys 6. "
                "What is the total cost in pounds? Reply with the number only.",
                ["3", "£3", "3.00"],
            ),
            (
                "A rectangle is 8 cm wide and 5 cm tall. "
                "What is its area in cm²? Reply with the number only.",
                ["40"],
            ),
            (
                "A train travels at 60 mph for 2.5 hours. "
                "How many miles does it cover? Reply with the number only.",
                ["150"],
            ),
            (
                "A team of 4 splits a £200 prize equally. "
                "How much does each person receive? Reply with the number only.",
                ["50", "£50"],
            ),
            (
                "If a store gives a 20% discount on a £80 jacket, "
                "what is the sale price? Reply with the number only.",
                ["64", "£64"],
            ),
        ]

        n       = _ARK_CONCURRENT
        batch   = problems[:n]
        queries = [
            (self._unique(f"t32-reasoning-{i}"), question, keywords)
            for i, (question, keywords) in enumerate(batch)
        ]

        results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=n) as pool:
            futures = {
                pool.submit(
                    self._run_query,
                    name, question,
                    {REASONING_KEY: '{"effort": "low"}'},
                ): (name, keywords)
                for name, question, keywords in queries
            }
            for future in as_completed(futures):
                name, keywords = futures[future]
                success, content, phase = future.result()
                results[name] = {
                    "success": success, "content": content,
                    "phase": phase,     "keywords": keywords,
                }

        failures = []
        for name, r in results.items():
            if not r["success"]:
                failures.append(f"{name}: did not complete (phase={r['phase']})")
                continue
            if not r["content"]:
                failures.append(f"{name}: empty content")
                continue
            if not any(kw in r["content"] for kw in r["keywords"]):
                failures.append(
                    f"{name}: expected one of {r['keywords']!r} in response, "
                    f"got: {r['content'][:150]}"
                )

        assert not failures, (
            f"{len(failures)}/{n} concurrent reasoning queries failed:\n" +
            "\n".join(failures)
        )

    # ------------------------------------------------------------------
    # T33 — Burst: fire-and-forget N queries, then poll all in parallel
    #
    # Submits all queries first (no waiting), then enters a single
    # concurrent polling loop. This maximises executor concurrency and
    # measures real wall-clock throughput.
    # ------------------------------------------------------------------

    @pytest.mark.executor
    def test_t33_burst_then_poll(self):
        inputs = [
            f"Count to {i} and reply with only the number {i}."
            for i in range(1, _ARK_CONCURRENT + 1)
        ]
        queries = [
            (self._unique(f"t33-burst-{i}"), text, str(i))
            for i, text in enumerate(inputs, start=1)
        ]

        for name, text, _ in queries:
            submitted = self._submit_query(name, text)
            assert submitted, f"Failed to submit query {name}"

        results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=len(queries)) as pool:
            futures = {
                pool.submit(self._poll_query, name): (name, expected)
                for name, _, expected in queries
            }
            for future in as_completed(futures):
                name, expected = futures[future]
                success, content, phase = future.result()
                results[name] = {
                    "success": success, "content": content,
                    "phase": phase,     "expected": expected,
                }

        failures = []
        for name, r in results.items():
            if not r["success"]:
                failures.append(f"{name}: did not complete (phase={r['phase']})")
                continue
            if not r["content"]:
                failures.append(f"{name}: empty content")
                continue
            if r["expected"] not in r["content"]:
                failures.append(
                    f"{name}: expected {r['expected']!r} in response, "
                    f"got: {r['content'][:100]}"
                )

        assert not failures, (
            f"{len(failures)}/{len(queries)} burst queries failed:\n" +
            "\n".join(failures)
        )
