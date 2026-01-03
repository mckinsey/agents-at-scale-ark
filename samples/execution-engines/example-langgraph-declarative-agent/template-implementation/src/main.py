import logging
import os
import sys
from dotenv import load_dotenv
load_dotenv()

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Literal, TypedDict, Optional
from fastapi import FastAPI
import uuid

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("agent")

from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage


# =============================================================================
# Configuration
# =============================================================================
#
# Ark injects two types of environment variables:
#
# 1. Agent config (from agent.spec.config):
#    Each key becomes an env var with uppercase and underscores.
#    Example: config.target-language → TARGET_LANGUAGE
#
# 2. Model config (from agent.spec.modelRef → Model CRD):
#    ARK_MODEL_NAME     - Model identifier (e.g., "gpt-4o-mini")
#    ARK_MODEL_API_KEY  - API key (resolved from secret)
#    ARK_MODEL_BASE_URL - API endpoint URL
#
# For local development, set these in .env file.
# =============================================================================

class Config(BaseSettings):
    answer_agent_system_message: str = Field(
        default="You are a useful assistant.",
        description="Message that defines the agent's behavior",
    )
    target_language: Literal["English", "Spanish", "Chinese"] = Field(
        default="English",
        description="Language that the agent team responds in",
    )


class ModelConfig(BaseSettings):
    ark_model_name: str = Field(default="gpt-4o-mini")
    ark_model_api_key: str = Field(description="OpenAI API key, injected by Ark from modelRef")
    ark_model_base_url: Optional[str] = Field(default=None)


config = Config()
model_config = ModelConfig()
api = FastAPI()

llm = ChatOpenAI(
    model=model_config.ark_model_name,
    api_key=model_config.ark_model_api_key,
    base_url=model_config.ark_model_base_url,
    temperature=0,
)


class State(TypedDict, total=False):
    user_task: str
    target_language: str
    answer_en: str
    answer_translated: str
    final: str


def intake_agent(state: State) -> State:
    log.info("=" * 50)
    log.info("[INTAKE] Starting")
    log.info(f"[INTAKE] Input: user_task={state.get('user_task')!r}")

    result = {
        "user_task": (state.get("user_task") or "").strip(),
        "target_language": config.target_language.strip(),
    }

    log.info(f"[INTAKE] Output: target_language={result['target_language']!r}")
    return result


def answer_agent(state: State) -> State:
    log.info("-" * 50)
    log.info("[ANSWER] Starting")
    task = state["user_task"]
    log.info(f"[ANSWER] Input: user_task={task!r}")

    msgs = [
        SystemMessage(
            content=(
                config.answer_agent_system_message.strip()
                + "\nAnswer clearly and correctly in English."
            )
        ),
        HumanMessage(content=task),
    ]
    log.info("[ANSWER] Calling LLM...")
    resp = llm.invoke(msgs)
    answer = resp.content.strip()

    log.info(f"[ANSWER] Output: answer_en={answer!r}")
    return {"answer_en": answer}


def translator_agent(state: State) -> State:
    log.info("-" * 50)
    log.info("[TRANSLATOR] Starting")
    target = (state.get("target_language") or "English").strip()
    en = state["answer_en"]
    log.info(f"[TRANSLATOR] Input: target_language={target!r}, answer_en={en!r}")

    if target.lower() in {"english", "en", "eng"}:
        log.info("[TRANSLATOR] Skipping translation (target is English)")
        return {"answer_translated": ""}

    msgs = [
        SystemMessage(
            content=(
                "You are a translation engine. Translate faithfully.\n"
                "Do not add commentary. Keep formatting intact."
            )
        ),
        HumanMessage(content=f"Target language: {target}\n\nText:\n{en}"),
    ]
    log.info("[TRANSLATOR] Calling LLM...")
    resp = llm.invoke(msgs)
    translated = resp.content.strip()

    log.info(f"[TRANSLATOR] Output: answer_translated={translated!r}")
    return {"answer_translated": translated}


def format_result(state: State) -> State:
    log.info("-" * 50)
    log.info("[FORMAT] Starting")
    target = (state.get("target_language") or "English").strip()
    en = (state.get("answer_en") or "").strip()
    tr = (state.get("answer_translated") or "").strip()
    log.info(f"[FORMAT] Input: en={en!r}, translated={tr!r}")

    if not tr:
        final = f"English:\n{en}"
    else:
        final = f"English:\n{en}\n\n{target}:\n{tr}"

    log.info(f"[FORMAT] Output: final={final!r}")
    log.info("=" * 50)
    return {"final": final}


# Compile graph ONCE
graph = StateGraph(State)
graph.add_node("intake", intake_agent)
graph.add_node("answer", answer_agent)
graph.add_node("translate", translator_agent)
graph.add_node("format", format_result)

graph.set_entry_point("intake")
graph.add_edge("intake", "answer")
graph.add_edge("answer", "translate")
graph.add_edge("translate", "format")
graph.add_edge("format", END)

graph_app = graph.compile()


@api.get("/health")
def health():
    return {"status": "healthy"}


@api.post("/v1/chat/completions")
def chat_completions(request: dict):
    messages = request.get("messages", [])

    last_user = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            last_user = msg.get("content", "")
            break

    log.info("")
    log.info("NEW REQUEST")
    log.info(f"User message: {last_user!r}")

    result = graph_app.invoke({"user_task": last_user})
    content = result["final"]

    log.info("REQUEST COMPLETE")
    log.info("")

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(api, host="0.0.0.0", port=8080)
