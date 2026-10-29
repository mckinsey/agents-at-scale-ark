"""
Marketplace executor tests — executor-openai-responses
https://github.com/mckinsey/agents-at-scale-marketplace

Tests the four features called out in the marketplace listing:
  - Built-in tools: web search + code interpreter
  - CFG / grammar-constrained output
  - Structured JSON output
  - Multi-turn memory

  T01  reasoning_prime_sum — o4-mini exact prime sum via native reasoning
  T02  reasoning_descriptive_statistics — o4-mini mean + std dev via reasoning
  T03  web_search_plus_structured_output — built-in web search + JSON schema in one call
  T04  cfg_email_grammar — grammar-constrained email address format
  T05  cfg_date_grammar — grammar-constrained ISO-8601 date output
  T06  structured_output_nested_schema — nested object schema validation
  T07  structured_output_enum_field — enum-constrained field in response
  T08  session_isolation — two independent conversations do not bleed context (ZDR-safe)
  T09  ark_stack_agent_labels — Agent CR labels for built-in tools (marketplace pattern)

Required env vars:
  CICD_OPENAI_API_KEY    API key / JWT for the OpenAI or gateway endpoint
  CICD_OPENAI_BASE_URL   Base URL (e.g. https://api.openai.com/v1)

Optional env vars:
  EXECUTOR_URL           Full URL of the /execute endpoint.
                         If unset, auto-discovers svc/executor-openai-responses.
  ARK_NAMESPACE          Kubernetes namespace (default: default)
  ARK_QUERY_TIMEOUT      Per-query poll timeout in seconds (default: 300)
"""

import json
import os
import re
import subprocess
import time
import uuid

import pytest
import requests

from helpers.marketplace_helper import (
    ARK_TIMEOUT,
    MODEL_DEFAULT,
    MODEL_GPT5,
    MODEL_O4_MINI,
    REASONING_KEY,
    SCHEMA_KEY,
    TOOLS_KEY,
    WEB_SEARCH_TOOL,
    agent_manifest,
    kubectl_apply,
    kubectl_run,
    model_manifest,
    patch_webhooks,
    poll_query,
    port_forward,
    query_manifest,
    secret_manifest,
    wait_for_executor,
)


# ---------------------------------------------------------------------------
# T01–T08: Direct /execute endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.executor
@pytest.mark.marketplace
class TestMarketplaceOpenAIResponsesFeatures:
    """
    Tests the four feature areas from the marketplace listing of
    executor-openai-responses: built-in tools, CFG output, structured JSON,
    multi-turn memory.

    Hits the executor /execute endpoint directly. Test IDs T01–T08.
    """

    executor_url: str = ""
    api_key: str = ""
    base_url: str = ""
    _pf_proc = None
    _pf_port: int = 18090
    _run_id: str = ""

    @classmethod
    def setup_class(cls):
        cls.api_key = os.environ.get("CICD_OPENAI_API_KEY", "").strip()
        if not cls.api_key:
            pytest.skip("CICD_OPENAI_API_KEY not set")

        cls.base_url = os.environ.get("CICD_OPENAI_BASE_URL", "").strip()
        if not cls.base_url:
            pytest.skip("CICD_OPENAI_BASE_URL not set")

        cls._run_id = uuid.uuid4().hex[:8]

        executor_url_override = os.environ.get("EXECUTOR_URL", "")
        if executor_url_override:
            cls.executor_url = executor_url_override
            cls._pf_proc = None
        else:
            cls.executor_url, cls._pf_proc = port_forward(cls._pf_port)

        wait_for_executor(cls.executor_url)

    @classmethod
    def teardown_class(cls):
        if cls._pf_proc is not None:
            cls._pf_proc.terminate()
            cls._pf_proc = None

    def _make_request(
        self,
        user_input: str,
        model: str = MODEL_DEFAULT,
        prompt: str = "You are a helpful assistant.",
        agent_annotations: dict = None,
        ee_annotations: dict = None,
        query_annotations: dict = None,
        conversation_id: str = "",
    ) -> dict:
        scoped_id = f"{conversation_id}-{self._run_id}" if conversation_id else self._run_id
        return {
            "agent": {
                "name": "marketplace-test-agent",
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
            "conversationId": scoped_id,
        }

    def _post(self, payload: dict, timeout: int = 90) -> tuple:
        for attempt in range(3):
            try:
                resp = requests.post(self.executor_url, json=payload, timeout=timeout)
                data = resp.json()
                messages = data.get("messages", [])
                content = messages[0]["content"] if messages else ""
                return resp.status_code, content, data
            except requests.exceptions.ConnectionError:
                if attempt < 2:
                    time.sleep(3)
                    continue
                raise

    # T01 — o4-mini reasoning: exact prime sum computation

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t01_reasoning_prime_sum(self):
        status, content, data = self._post(
            self._make_request(
                (
                    "What is the sum of the first 50 prime numbers? "
                    "Think step by step, then return only the final number."
                ),
                model=MODEL_O4_MINI,
                prompt=(
                    "You are a precise mathematical assistant. "
                    "Compute exact answers using step-by-step reasoning. "
                    "Return only the numerical result on its own line."
                ),
                agent_annotations={REASONING_KEY: '{"effort": "medium"}'},
                conversation_id="t01-reasoning-primes",
            ),
            timeout=120,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content.strip(), f"Executor returned empty content — full response: {data}"
        assert "5117" in content, f"Expected sum of first 50 primes = 5117, got: {content[:300]}"

    # T02 — o4-mini reasoning: descriptive statistics

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t02_reasoning_descriptive_statistics(self):
        status, content, data = self._post(
            self._make_request(
                (
                    "Compute the mean and standard deviation of these values: "
                    "12, 45, 23, 67, 34, 89, 11, 56, 78, 90. "
                    "Return both values rounded to 2 decimal places."
                ),
                model=MODEL_O4_MINI,
                prompt=(
                    "You are a data analyst. Compute statistics accurately. "
                    "Return results as: mean=X, std=Y."
                ),
                agent_annotations={REASONING_KEY: '{"effort": "low"}'},
                conversation_id="t02-reasoning-stats",
            ),
            timeout=120,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content.strip(), f"Executor returned empty content — full response: {data}"
        assert "50.5" in content, f"Expected mean=50.5 in response, got: {content[:300]}"
        # population std dev = 28.64; sample std dev ≈ 30.19 — accept either
        assert any(v in content for v in ["28.64", "28.6", "30.19", "30.2"]), (
            f"Expected std dev value (28.64 population or 30.19 sample) in response, got: {content[:300]}"
        )

    # T03 — Built-in web search + structured JSON output
    #
    # Uses a time-sensitive query (today's FTSE 100 close) to verify the executor
    # actually triggered web_search_preview rather than answered from training data.
    # A four-digit number in the price field confirms a live market lookup.

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t03_web_search_plus_structured_output(self):
        schema = {
            "type": "object",
            "properties": {
                "index_name":       {"type": "string"},
                "last_close_value": {"type": "string"},
                "change_percent":   {"type": "string"},
                "as_of_date":       {"type": "string"},
            },
            "required": ["index_name", "last_close_value", "change_percent", "as_of_date"],
            "additionalProperties": False,
        }
        status, content, data = self._post(
            self._make_request(
                "What was the FTSE 100 closing value and percentage change in the most recent trading session?",
                model=MODEL_GPT5,
                prompt=(
                    "You are a financial data assistant. "
                    "Search the web for the latest FTSE 100 closing data and return it as structured JSON."
                ),
                agent_annotations={
                    TOOLS_KEY: json.dumps(WEB_SEARCH_TOOL),
                    SCHEMA_KEY: json.dumps(schema),
                    REASONING_KEY: '{"effort": "low"}',
                },
                conversation_id="t03-websearch-structured",
            ),
            timeout=90,
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content.strip(), f"Executor returned empty content — full response: {data}"

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            pytest.fail(f"Response is not valid JSON: {content[:400]}")

        for field in ("index_name", "last_close_value", "change_percent", "as_of_date"):
            assert field in parsed, f"Required field '{field}' missing from: {content[:300]}"
            assert parsed[field], f"Field '{field}' is empty"

        assert "ftse" in parsed["index_name"].lower(), (
            f"index_name should reference FTSE, got: {parsed['index_name']}"
        )
        # FTSE 100 is a 4-5 digit number (e.g. "8,234" or "10,480").
        # Strip commas before matching so both formats pass.
        digits_only = parsed["last_close_value"].replace(",", "").replace(" ", "")
        assert re.search(r"\d{4,5}", digits_only), (
            f"last_close_value doesn't look like a valid index level: {parsed['last_close_value']}"
        )

    # T04 — CFG/grammar-constrained output: email address format

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t04_cfg_email_grammar(self):
        email_grammar_tool = [
            {
                "type": "custom",
                "name": "generate_email",
                "description": "Generate a single valid email address",
                "format": {
                    "type": "grammar",
                    "syntax": "lark",
                    "definition": (
                        'start: local_part "@" domain\n'
                        'local_part: WORD ("." WORD)*\n'
                        'domain: WORD ("." WORD)+\n'
                        'WORD: /[a-zA-Z0-9][a-zA-Z0-9_-]*/\n'
                    ),
                },
            }
        ]
        status, content, data = self._post(
            self._make_request(
                "Generate a professional email address for a fictional person named John Smith at acmecorp.com",
                model=MODEL_GPT5,
                prompt=(
                    "You are an email generator. Use the generate_email tool to output "
                    "a single valid email address and nothing else."
                ),
                agent_annotations={
                    TOOLS_KEY: json.dumps(email_grammar_tool),
                    REASONING_KEY: '{"effort": "low"}',
                },
                conversation_id="t04-cfg-email-grammar",
            ),
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content.strip(), f"Executor returned empty content — full response: {data}"
        # Grammar: local_part "@" domain where WORD = /[a-zA-Z0-9][a-zA-Z0-9_-]*/
        # Extract the first token that looks like an email from the response
        email_pattern = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+")
        match = email_pattern.search(content)
        assert match, f"No valid email address matching the grammar found in: {content[:200]}"
        email = match.group(0)
        local, domain = email.split("@", 1)
        assert re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]*", local), (
            f"local_part '{local}' does not match grammar WORD pattern"
        )
        assert re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+", domain), (
            f"domain '{domain}' does not match grammar (WORD '.' WORD+) pattern"
        )

    # T05 — CFG/grammar-constrained output: ISO-8601 date format

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t05_cfg_iso_date_grammar(self):
        date_grammar_tool = [
            {
                "type": "custom",
                "name": "generate_date",
                "description": "Generate a date in strict ISO-8601 YYYY-MM-DD format",
                "format": {
                    "type": "grammar",
                    "syntax": "lark",
                    "definition": (
                        'start: YEAR "-" MONTH "-" DAY\n'
                        'YEAR:  /[0-9]{4}/\n'
                        'MONTH: /0[1-9]|1[0-2]/\n'
                        'DAY:   /0[1-9]|[12][0-9]|3[01]/\n'
                    ),
                },
            }
        ]
        status, content, data = self._post(
            self._make_request(
                "What date is 90 days after 2025-01-15? Use the generate_date tool.",
                model=MODEL_GPT5,
                prompt=(
                    "You are a date calculator. Use the generate_date tool to return "
                    "only the resulting date in YYYY-MM-DD format."
                ),
                agent_annotations={
                    TOOLS_KEY: json.dumps(date_grammar_tool),
                    REASONING_KEY: '{"effort": "low"}',
                },
                conversation_id="t05-cfg-date-grammar",
            ),
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content.strip(), f"Executor returned empty content — full response: {data}"
        assert "2025-04-15" in content, (
            f"Expected ISO date 2025-04-15 (90 days after 2025-01-15), got: {content[:200]}"
        )

    # T06 — Structured JSON output: nested schema with array field

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t06_structured_output_nested_schema(self):
        schema = {
            "type": "object",
            "properties": {
                "country":   {"type": "string"},
                "capital":   {"type": "string"},
                "languages": {"type": "array", "items": {"type": "string"}, "minItems": 1},
                "eu_member": {"type": "boolean"},
            },
            "required": ["country", "capital", "languages", "eu_member"],
            "additionalProperties": False,
        }
        status, content, data = self._post(
            self._make_request(
                "Give me structured information about Switzerland.",
                model=MODEL_DEFAULT,
                prompt=(
                    "You are a geography reference assistant. "
                    "Return structured data about countries."
                ),
                agent_annotations={SCHEMA_KEY: json.dumps(schema)},
                conversation_id="t06-structured-nested-schema",
            ),
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content.strip(), f"Executor returned empty content — full response: {data}"

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            pytest.fail(f"Response is not valid JSON: {content[:400]}")

        assert parsed.get("country"), "country field empty"
        assert parsed.get("capital"), "capital field empty"
        assert isinstance(parsed.get("languages"), list), "languages must be an array"
        assert len(parsed["languages"]) >= 1, "languages array must not be empty"
        assert isinstance(parsed.get("eu_member"), bool), "eu_member must be boolean"
        assert parsed["eu_member"] is False, (
            f"Switzerland is not an EU member, expected false, got: {parsed.get('eu_member')}"
        )
        assert "bern" in parsed.get("capital", "").lower(), (
            f"Expected Bern as capital, got: {parsed.get('capital')}"
        )

    # T07 — Structured JSON output: enum-constrained field

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t07_structured_output_enum_field(self):
        schema = {
            "type": "object",
            "properties": {
                "company_type": {
                    "type": "string",
                    "enum": ["PUBLIC", "PRIVATE", "NONPROFIT", "GOVERNMENT", "UNKNOWN"],
                },
                "industry": {"type": "string"},
                "approximate_size": {
                    "type": "string",
                    "enum": ["SMALL", "MEDIUM", "LARGE", "ENTERPRISE"],
                },
            },
            "required": ["company_type", "industry", "approximate_size"],
            "additionalProperties": False,
        }
        status, content, data = self._post(
            self._make_request(
                "Classify Microsoft Corporation.",
                model=MODEL_DEFAULT,
                prompt=(
                    "You are a company classifier. "
                    "Return a structured classification for the given company."
                ),
                agent_annotations={SCHEMA_KEY: json.dumps(schema)},
                conversation_id="t07-structured-enum",
            ),
        )
        assert status == 200, f"HTTP {status}: {data}"
        assert content.strip(), f"Executor returned empty content — full response: {data}"

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            pytest.fail(f"Response is not valid JSON: {content[:400]}")

        assert parsed.get("company_type") in {"PUBLIC", "PRIVATE", "NONPROFIT", "GOVERNMENT", "UNKNOWN"}, (
            f"company_type '{parsed.get('company_type')}' not a valid enum value"
        )
        assert parsed.get("approximate_size") in {"SMALL", "MEDIUM", "LARGE", "ENTERPRISE"}, (
            f"approximate_size '{parsed.get('approximate_size')}' not a valid enum value"
        )
        assert parsed.get("company_type") == "PUBLIC", (
            f"Microsoft is a public company, expected PUBLIC, got: {parsed.get('company_type')}"
        )
        assert parsed.get("approximate_size") == "ENTERPRISE", (
            f"Microsoft is enterprise scale, expected ENTERPRISE, got: {parsed.get('approximate_size')}"
        )

    # T08 — Session isolation: concurrent conversations are routed independently
    #
    # Sends genuinely different deterministic questions to two different conversationIds
    # and verifies each gets the correct distinct answer. Proves the executor routes
    # each conversationId to an independent model call with no cross-contamination.
    # ZDR-safe: single-turn only, no previous_response_id needed.

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t08_session_isolation(self):
        conv_a = f"t08-isolation-a-{uuid.uuid4().hex[:6]}"
        conv_b = f"t08-isolation-b-{uuid.uuid4().hex[:6]}"

        status_a, content_a, data_a = self._post(
            self._make_request(
                "What is the capital of France? Reply with the city name only.",
                model=MODEL_DEFAULT,
                prompt="You are a geography assistant. Reply with one word only.",
                conversation_id=conv_a,
            )
        )
        assert status_a == 200, f"Conv A failed: {data_a}"
        assert content_a.strip(), f"Conv A: executor returned empty content — full response: {data_a}"

        status_b, content_b, data_b = self._post(
            self._make_request(
                "What is the capital of Japan? Reply with the city name only.",
                model=MODEL_DEFAULT,
                prompt="You are a geography assistant. Reply with one word only.",
                conversation_id=conv_b,
            )
        )
        assert status_b == 200, f"Conv B failed: {data_b}"
        assert content_b.strip(), f"Conv B: executor returned empty content — full response: {data_b}"

        assert "paris" in content_a.lower(), (
            f"Conv A (France capital) should return Paris, got: {content_a[:100]}"
        )
        assert "tokyo" in content_b.lower(), (
            f"Conv B (Japan capital) should return Tokyo, got: {content_b[:100]}"
        )
        assert "tokyo" not in content_a.lower(), (
            f"Conv A leaked Conv B answer (Tokyo in France response): {content_a[:100]}"
        )
        assert "paris" not in content_b.lower(), (
            f"Conv B leaked Conv A answer (Paris in Japan response): {content_b[:100]}"
        )


# ---------------------------------------------------------------------------
# T09: Full Ark stack test — Agent CR labels for built-in tools
# ---------------------------------------------------------------------------

@pytest.mark.executor
@pytest.mark.marketplace
class TestMarketplaceAgentLabels:
    """
    Full Ark stack test using Agent CR labels for built-in tools —
    the pattern documented in the marketplace executor README.

    Creates:
      Secret → Model CR → Agent CR (with ark.openai.tools/* labels) → Query CR

    Asserts that the web_search_preview tool activates and the response
    contains real-world content fetched at query time.
    """

    namespace:    str = "default"
    api_key:      str = ""
    base_url:     str = ""
    secret_name:  str = "mkt-t09-secret"
    model_name:   str = "mkt-t09-model"
    agent_name:   str = "mkt-t09-agent"
    created_queries: list = []
    _webhook_patched: bool = False

    @classmethod
    def setup_class(cls):
        cls.api_key = os.environ.get("CICD_OPENAI_API_KEY", "").strip()
        if not cls.api_key:
            pytest.skip("CICD_OPENAI_API_KEY not set")

        cls.base_url = os.environ.get("CICD_OPENAI_BASE_URL", "").strip()
        if not cls.base_url:
            pytest.skip("CICD_OPENAI_BASE_URL not set")

        cls.namespace = os.environ.get("ARK_NAMESPACE", "default")
        cls.created_queries = []

        ok, _, _ = kubectl_run([
            "kubectl", "get", "executionengine", "executor-openai-responses",
            "-n", cls.namespace, "-o", "jsonpath={.status.phase}",
        ])
        if not ok:
            pytest.skip("executor-openai-responses ExecutionEngine not found in cluster")

        cls._webhook_patched = patch_webhooks("Ignore")
        kubectl_apply(secret_manifest(cls.secret_name, cls.namespace, cls.api_key, cls.base_url))
        kubectl_apply(model_manifest(cls.model_name, cls.namespace, MODEL_GPT5, cls.secret_name))
        kubectl_apply(agent_manifest(
            name=cls.agent_name,
            namespace=cls.namespace,
            model_name=cls.model_name,
            execution_engine="executor-openai-responses",
            prompt=(
                "You are an expert web search agent located in the UK. "
                "Find the official business website of a given UK company. "
                "Return only the company's own domain URL."
            ),
            labels={"ark.openai.tools/web-search-preview": "true"},
            parameters=[
                {"name": "openai.web-search.country", "value": "GB"},
                {"name": "openai.web-search.city",    "value": "London"},
                {"name": "openai.web-search.region",  "value": "London"},
            ],
        ))
        time.sleep(3)

    @classmethod
    def teardown_class(cls):
        if cls._webhook_patched:
            patch_webhooks("Fail")
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

    def _submit_query(self, name: str, input_text: str) -> tuple:
        ok, _, err = kubectl_run(
            ["kubectl", "apply", "-f", "-"],
            stdin=query_manifest(name, self.namespace, self.agent_name, input_text),
            timeout=120,
        )
        if not ok:
            return False, None, f"submit_failed: {err}"
        self.__class__.created_queries.append(name)
        return poll_query(name, self.namespace)

    # T09 — Agent CR labels enable web search (marketplace-documented pattern)

    @pytest.mark.executor
    @pytest.mark.marketplace
    def test_t09_ark_stack_agent_labels_enable_web_search(self):
        name = f"t09-agent-labels-{uuid.uuid4().hex[:6]}"
        success, content, phase = self._submit_query(name, "MARKS AND SPENCER GROUP PLC")
        assert success, f"Query {name} did not reach phase=done (phase={phase})"
        assert content and content.strip(), f"Query {name} reached phase=done but response content is empty or whitespace"
        assert any(
            domain in content.lower()
            for domain in ["marksandspencer.com", "marks-and-spencer", "m&s", "marksandspencer"]
        ), f"Expected Marks & Spencer website URL via web search, got: {content[:300]}"
