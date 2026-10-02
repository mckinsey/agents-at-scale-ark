"""conversationId is an opaque identifier that Ark passes through unchanged.

Engines and memory services generate conversation IDs in formats Ark does not
control, and those IDs land in status.conversationId with no validation. The
dashboard lists them and resends them as spec.conversationId on follow-up
queries, so any rule here that status does not also enforce breaks that
round-trip. Constraining status instead is not an option: it is written from
whatever the engine returns, so a rejected write becomes a reconcile loop.

Executors that map a conversationId onto a filesystem path validate it at the
path join, which is also the only layer that covers the direct A2A path.
"""

import unittest
from pathlib import Path

import yaml

from ark_api.models.queries import (
    QueryCreateRequest,
    QueryDetailResponse,
    QueryResponse,
    QueryUpdateRequest,
)

CRD_PATH = (
    Path(__file__).resolve().parents[4]
    / "ark"
    / "config"
    / "crd"
    / "bases"
    / "ark.mckinsey.com_queries.yaml"
)

NON_CONSTRAINING_KEYWORDS = {"description", "default", "example", "title"}

ENGINE_GENERATED = [
    "550e8400-e29b-41d4-a716-446655440000",
    "hitl-demo-conv-001",
    "abc_123-XYZ",
    "thread.abc123",
    "conv:2026:001",
    "tenant/session",
    "conversation 1",
    "会話-1",
    "a" * 512,
]


class TestEngineGeneratedIdsRoundTrip(unittest.TestCase):
    """Regression test for the round-trip.

    An ID that reaches status.conversationId from an engine or memory service
    must be reusable in spec.conversationId, or follow-up queries against that
    conversation fail before they reach the cluster.
    """

    def test_create_accepts_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                request = QueryCreateRequest(
                    name="q", input="hi", conversationId=value
                )
                self.assertEqual(request.conversationId, value)

    def test_update_accepts_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                self.assertEqual(
                    QueryUpdateRequest(conversationId=value).conversationId, value
                )

    def test_responses_accept_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                response = QueryResponse(
                    name="q", namespace="default", input="hi", conversationId=value
                )
                self.assertEqual(response.conversationId, value)

                detail = QueryDetailResponse(
                    name="q", namespace="default", input="hi", conversationId=value
                )
                self.assertEqual(detail.conversationId, value)

    def test_omitted_is_allowed(self):
        self.assertIsNone(QueryCreateRequest(name="q", input="hi").conversationId)
        self.assertIsNone(QueryUpdateRequest().conversationId)


class TestCrdDoesNotNarrowSpec(unittest.TestCase):
    """spec.conversationId and status.conversationId must validate identically.

    A rule on spec that status does not enforce breaks reuse of engine-generated
    IDs. A rule on status breaks the write from the engine, which turns one
    misbehaving engine into a reconcile loop. So the two must agree, and the
    check compares every schema keyword rather than a named list: a marker such
    as XValidation or Enum narrows spec without touching pattern, maxLength,
    minLength or format, and would walk past a fixed enumeration.
    """

    def _conversation_id_schemas(self):
        if not CRD_PATH.exists():
            self.skipTest(f"CRD not reachable from this checkout: {CRD_PATH}")

        crd = yaml.safe_load(CRD_PATH.read_text())
        schema = crd["spec"]["versions"][0]["schema"]["openAPIV3Schema"]["properties"]
        return (
            schema["spec"]["properties"]["conversationId"],
            schema["status"]["properties"]["conversationId"],
        )

    def test_spec_and_status_validate_identically(self):
        spec, status = self._conversation_id_schemas()

        differing = sorted(
            keyword
            for keyword in set(spec) | set(status)
            if keyword not in NON_CONSTRAINING_KEYWORDS
            and spec.get(keyword) != status.get(keyword)
        )

        self.assertEqual(
            differing,
            [],
            f"spec.conversationId and status.conversationId disagree on "
            f"{differing}: a rule on spec that status does not enforce breaks "
            f"reuse of engine-generated IDs, and a rule on status breaks the "
            f"write from the engine",
        )
