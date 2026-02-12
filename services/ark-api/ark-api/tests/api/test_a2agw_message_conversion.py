import unittest
from types import SimpleNamespace

from ark_api.api.v1.a2agw.message_conversion import (
    a2a_message_to_openai_message,
    build_query_payload,
    extract_text_from_message,
)


class TestA2AGatewayMessageConversion(unittest.TestCase):
    def test_extract_text_from_message(self):
        message = SimpleNamespace(
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="hello world"))]
        )
        self.assertEqual(extract_text_from_message(message), "hello world")

    def test_build_query_payload_uses_user_type_for_simple_text(self):
        message = SimpleNamespace(
            role="user",
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="hello"))],
        )
        context = SimpleNamespace(message=message, history=[])

        payload = build_query_payload(context)

        self.assertEqual(payload.query_type, "user")
        self.assertEqual(payload.input_data, "hello")

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
        self.assertIsInstance(payload.input_data[0]["content"], list)
        self.assertEqual(payload.input_data[0]["content"][1]["type"], "image_url")

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

    def test_build_query_payload_uses_native_messages_when_experimental_enabled(self):
        message = SimpleNamespace(
            role="user",
            parts=[SimpleNamespace(root=SimpleNamespace(kind="text", text="hello"))],
        )
        context = SimpleNamespace(message=message, history=[])
        payload = build_query_payload(context, experimental_enabled=True)
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
