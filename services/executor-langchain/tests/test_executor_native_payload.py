import asyncio
from types import SimpleNamespace

from langchain.schema import AIMessage, HumanMessage

from langchain_executor import app as app_module
from langchain_executor import a2a_executor as a2a_executor_module
from langchain_executor.a2a_executor import A2ALangChainExecutor


def test_extract_native_text():
    message = {
        "role": "user",
        "parts": [
            {"kind": "text", "text": "alpha"},
            {"kind": "data", "data": "beta"},
            {"kind": "file", "uri": "file:///tmp/test.txt"},
        ],
    }
    assert a2a_executor_module._extract_native_text(message) == "alpha\nbeta\nfile:///tmp/test.txt"


def test_extract_native_content_preserves_image_url():
    message = {
        "role": "user",
        "parts": [
            {"kind": "text", "text": "look"},
            {
                "kind": "file",
                "file": {
                    "mimeType": "image/png",
                    "uri": "https://example.com/image.png",
                },
            },
        ],
    }

    content = a2a_executor_module._extract_native_content(message)
    assert isinstance(content, list)
    assert content == [
        {"type": "text", "text": "look"},
        {"type": "image_url", "image_url": {"url": "https://example.com/image.png"}},
    ]


def test_build_native_langchain_messages_roles():
    history = [
        {"role": "user", "parts": [{"kind": "text", "text": "u1"}]},
        {"role": "agent", "parts": [{"kind": "text", "text": "a1"}]},
    ]
    messages = a2a_executor_module._build_native_langchain_messages(history)
    assert isinstance(messages[0], HumanMessage)
    assert messages[0].content == "u1"
    assert isinstance(messages[1], AIMessage)
    assert messages[1].content == "a1"


def test_execute_agent_uses_native_payload(monkeypatch):
    captured = {}

    class DummyChatClient:
        async def ainvoke(self, messages):
            captured["messages"] = messages
            return SimpleNamespace(content="native-ok")

    monkeypatch.setattr(a2a_executor_module, "create_chat_client", lambda _model: DummyChatClient())
    monkeypatch.setattr(a2a_executor_module, "should_use_rag", lambda _agent: False)

    executor = A2ALangChainExecutor()
    request = SimpleNamespace(
        agent=SimpleNamespace(
            name="native-agent",
            model=SimpleNamespace(),
            labels={},
            prompt="system prompt",
            parameters=[],
        ),
        payloadMode="native",
        a2aHistory=[
            {"role": "agent", "parts": [{"kind": "text", "text": "prior"}]},
        ],
        a2aUserInput={"role": "user", "parts": [{"kind": "text", "text": "native input"}]},
        history=[],
        userInput=SimpleNamespace(content="compat input"),
    )

    response_messages = asyncio.run(executor.execute_agent(request))
    assert response_messages[0].content == "native-ok"
    sent_messages = captured["messages"]
    assert any(isinstance(message, AIMessage) and message.content == "prior" for message in sent_messages)
    assert isinstance(sent_messages[-1], HumanMessage)
    assert sent_messages[-1].content == "native input"


def test_execute_agent_preserves_native_image_payload(monkeypatch):
    captured = {}

    class DummyChatClient:
        async def ainvoke(self, messages):
            captured["messages"] = messages
            return SimpleNamespace(content="native-ok")

    monkeypatch.setattr(a2a_executor_module, "create_chat_client", lambda _model: DummyChatClient())
    monkeypatch.setattr(a2a_executor_module, "should_use_rag", lambda _agent: False)

    executor = A2ALangChainExecutor()
    request = SimpleNamespace(
        agent=SimpleNamespace(
            name="native-agent",
            model=SimpleNamespace(),
            labels={},
            prompt="system prompt",
            parameters=[],
        ),
        payloadMode="native",
        a2aHistory=[],
        a2aUserInput={
            "role": "user",
            "parts": [
                {"kind": "text", "text": "what is in this image"},
                {
                    "kind": "file",
                    "file": {
                        "mimeType": "image/png",
                        "uri": "https://example.com/scene.png",
                    },
                },
            ],
        },
        history=[],
        userInput=SimpleNamespace(content="compat input"),
    )

    response_messages = asyncio.run(executor.execute_agent(request))
    assert response_messages[0].content == "native-ok"
    sent_messages = captured["messages"]
    assert isinstance(sent_messages[-1], HumanMessage)
    assert sent_messages[-1].content == [
        {"type": "text", "text": "what is in this image"},
        {"type": "image_url", "image_url": {"url": "https://example.com/scene.png"}},
    ]


def test_app_registers_execute_a2a_route():
    paths = {route.path for route in app_module.app_instance.app.routes}
    assert "/execute" in paths
    assert "/execute-a2a" in paths


def test_fallback_execute_a2a_returns_structured_error(monkeypatch):
    async def failing_execute(_request):
        raise RuntimeError("boom")

    monkeypatch.setattr(app_module.a2a_executor, "execute_agent", failing_execute)
    request = SimpleNamespace(
        agent=SimpleNamespace(name="native-agent"),
        a2aUserInput={"contextId": "ctx-1", "taskId": "task-1"},
    )

    response = asyncio.run(app_module._execute_a2a_fallback(request))
    payload = response.model_dump()
    assert payload["messages"] == []
    if "a2aMessages" in payload:
        assert payload["a2aMessages"] == []
    assert "LangChain A2A execution failed for agent native-agent: boom" == payload["error"]


def test_fallback_execute_a2a_supports_typed_a2a_user_input(monkeypatch):
    async def successful_execute(_request):
        return [SimpleNamespace(role="assistant", content="ok")]

    monkeypatch.setattr(app_module.a2a_executor, "execute_agent", successful_execute)
    request = SimpleNamespace(
        agent=SimpleNamespace(name="native-agent"),
        a2aUserInput=SimpleNamespace(contextId="ctx-typed", taskId="task-typed"),
    )

    response = asyncio.run(app_module._execute_a2a_fallback(request))
    payload = response.model_dump()
    assert payload["messages"] == []
    assert payload["error"] == ""
    if "a2aMessages" in payload:
        assert payload["a2aMessages"] == [
            {
                "role": "agent",
                "parts": [{"kind": "text", "text": "ok"}],
                "contextId": "ctx-typed",
                "taskId": "task-typed",
            }
        ]
