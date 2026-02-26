import unittest
from types import SimpleNamespace

from ark_api.api.v1.a2agw.message_conversion import (
    a2a_message_to_native_message,
    a2a_message_to_openai_message,
    build_query_payload,
    extract_text_from_message,
    normalize_a2a_wire_version,
)


class TestA2AGatewayMessageConversion(unittest.TestCase):
    def test_extract_text_from_message(self):
        message = SimpleNamespace(
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="hello world"))]
        )
        self.assertEqual(extract_text_from_message(message), "hello world")

    def test_build_query_payload_uses_native_messages_for_simple_text(self):
        message = SimpleNamespace(
            role="user",
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="hello"))],
        )
        context = SimpleNamespace(message=message, history=[])

        payload = build_query_payload(context)

        self.assertEqual(payload.query_type, "messages")
        self.assertEqual(payload.input_data[0]["role"], "user")
        self.assertEqual(payload.input_data[0]["parts"][0]["kind"], "text")
        self.assertEqual(payload.input_data[0]["parts"][0]["text"], "hello")

    def test_build_query_payload_uses_messages_for_multimodal(self):
        message = SimpleNamespace(
            role="user",
            parts=[
                {"root": {"kind": "text", "text": "describe this"}},
                {"root": {"kind": "file", "file": {"uri": "https://example.com/image.png"}, "mediaType": "image/png"}},
            ],
        )
        context = SimpleNamespace(message=message, history=[])

        payload = build_query_payload(context)

        self.assertEqual(payload.query_type, "messages")
        self.assertIsInstance(payload.input_data, list)
        self.assertEqual(payload.input_data[0]["role"], "user")
        self.assertEqual(payload.input_data[0]["parts"][0]["kind"], "text")
        self.assertEqual(payload.input_data[0]["parts"][1]["kind"], "file")

    def test_build_query_payload_includes_history(self):
        history_message = SimpleNamespace(
            role="assistant",
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="previous answer"))],
        )
        current_message = SimpleNamespace(
            role="user",
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="new question"))],
        )
        context = SimpleNamespace(message=current_message, history=[history_message])

        payload = build_query_payload(context)

        self.assertEqual(payload.query_type, "messages")
        self.assertEqual(len(payload.input_data), 2)
        self.assertEqual(payload.input_data[0]["role"], "assistant")
        self.assertEqual(payload.input_data[1]["role"], "user")

    def test_build_query_payload_uses_native_messages(self):
        message = SimpleNamespace(
            role="user",
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="hello"))],
        )
        context = SimpleNamespace(message=message, history=[])
        payload = build_query_payload(context)
        self.assertEqual(payload.query_type, "messages")
        self.assertIsInstance(payload.input_data, list)
        self.assertEqual(payload.input_data[0]["role"], "user")
        self.assertEqual(payload.input_data[0]["parts"][0]["kind"], "text")
        self.assertEqual(payload.input_data[0]["parts"][0]["text"], "hello")

    def test_a2a_message_to_openai_message_maps_agent_role(self):
        message = SimpleNamespace(
            role="agent",
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="hello"))],
        )
        converted = a2a_message_to_openai_message(message)
        self.assertEqual(converted["role"], "assistant")
        self.assertEqual(converted["content"], "hello")

    def test_a2a_message_to_openai_message_accepts_v1_file_shape(self):
        message = SimpleNamespace(
            role="user",
            parts=[
                {"root": {"text": "describe this"}},
                {"root": {"url": "https://example.com/image.png", "mediaType": "image/png"}},
            ],
        )
        converted = a2a_message_to_openai_message(message)
        self.assertEqual(converted["role"], "user")
        self.assertIsInstance(converted["content"], list)
        self.assertEqual(converted["content"][0]["type"], "text")
        self.assertEqual(converted["content"][1]["type"], "image_url")

    def test_a2a_message_to_native_message_defaults_to_v03_shape(self):
        message = SimpleNamespace(
            role="user",
            parts=[{"root": {"text": "hello v1 input"}}],
        )
        converted = a2a_message_to_native_message(message)
        self.assertEqual(converted["parts"][0]["kind"], "text")
        self.assertEqual(converted["parts"][0]["text"], "hello v1 input")

    def test_a2a_message_to_native_message_emits_v1_shape_when_requested(self):
        message = SimpleNamespace(
            role="user",
            parts=[
                {"root": {"kind": "file", "file": {"uri": "https://example.com/doc.pdf"}, "mimeType": "application/pdf"}}
            ],
        )
        converted = a2a_message_to_native_message(message, wire_version="v1.0-rc")
        self.assertIn("url", converted["parts"][0])
        self.assertNotIn("kind", converted["parts"][0])
        self.assertEqual(converted["parts"][0]["mediaType"], "application/pdf")

    def test_a2a_message_to_native_message_maps_session_alias_to_context(self):
        message = {
            "role": "user",
            "sessionId": "ctx-from-session",
            "parts": [{"text": "hello"}],
        }
        converted = a2a_message_to_native_message(message)
        self.assertEqual(converted["contextId"], "ctx-from-session")

    def test_build_query_payload_accepts_explicit_wire_version(self):
        message = SimpleNamespace(
            role="user",
            parts=[{"root": {"kind": "text", "text": "hello"}}],
        )
        context = SimpleNamespace(message=message, history=[])
        payload = build_query_payload(context, native_wire_version="v1")
        self.assertEqual(payload.query_type, "messages")
        self.assertIn("text", payload.input_data[0]["parts"][0])
        self.assertNotIn("kind", payload.input_data[0]["parts"][0])

    def test_normalize_a2a_wire_version_defaults_to_v03(self):
        self.assertEqual(normalize_a2a_wire_version(None), "v0.3")
        self.assertEqual(normalize_a2a_wire_version("unknown"), "v0.3")
        self.assertEqual(normalize_a2a_wire_version("v1.0-rc"), "v1rc")
