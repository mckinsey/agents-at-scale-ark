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


def test_app_registers_execute_a2a_route():
    paths = {route.path for route in app_module.app_instance.app.routes}
    assert "/execute" in paths
    assert "/execute-a2a" in paths
