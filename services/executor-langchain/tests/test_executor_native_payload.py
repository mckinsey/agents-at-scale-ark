import asyncio
import sys
import types
from types import SimpleNamespace

from langchain.schema import AIMessage, HumanMessage

langchain_openai_module = types.ModuleType("langchain_openai")
langchain_openai_module.ChatOpenAI = object
langchain_openai_module.OpenAIEmbeddings = object
sys.modules.setdefault("langchain_openai", langchain_openai_module)

from langchain_executor import executor as executor_module
from langchain_executor.executor import LangChainExecutor


def test_extract_native_text():
    message = {
        "role": "user",
        "parts": [
            {"kind": "text", "text": "alpha"},
            {"kind": "data", "data": "beta"},
            {"kind": "file", "uri": "file:///tmp/test.txt"},
        ],
    }
    assert executor_module._extract_native_text(message) == "alpha\nbeta\nfile:///tmp/test.txt"


def test_build_native_langchain_messages_roles():
    history = [
        {"role": "user", "parts": [{"kind": "text", "text": "u1"}]},
        {"role": "agent", "parts": [{"kind": "text", "text": "a1"}]},
    ]
    messages = executor_module._build_native_langchain_messages(history)
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

    monkeypatch.setattr(executor_module, "create_chat_client", lambda _model: DummyChatClient())
    monkeypatch.setattr(executor_module, "should_use_rag", lambda _agent: False)

    executor = LangChainExecutor()
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
