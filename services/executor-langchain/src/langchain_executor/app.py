from fastapi import FastAPI
from ark_sdk.executor_app import ExecutorApp
from ark_sdk.executor import ExecutionEngineRequest, ExecutionEngineResponse
from pydantic import ValidationError
from .executor import LangChainExecutor
from .a2a_executor import A2ALangChainExecutor

executor = LangChainExecutor()
app_instance = ExecutorApp(executor, "LangChain")
a2a_executor = A2ALangChainExecutor()


def _make_execution_engine_response(messages, a2a_messages, error):
    payload = {"messages": messages, "error": error}
    model_fields = getattr(ExecutionEngineResponse, "model_fields", {})
    if "a2aMessages" in model_fields:
        payload["a2aMessages"] = a2a_messages
    return ExecutionEngineResponse(**payload)


async def _execute_a2a_fallback(request: ExecutionEngineRequest) -> ExecutionEngineResponse:
    try:
        response_messages = await a2a_executor.execute_agent(request)
        context_id = ""
        task_id = ""
        if request.a2aUserInput is not None:
            context_id = str(request.a2aUserInput.get("contextId", ""))
            task_id = str(request.a2aUserInput.get("taskId", ""))
        a2a_messages = []
        for message in response_messages:
            payload = {
                "role": "agent" if message.role == "assistant" else message.role,
                "parts": [{"kind": "text", "text": message.content}],
            }
            if context_id:
                payload["contextId"] = context_id
            if task_id:
                payload["taskId"] = task_id
            a2a_messages.append(payload)
        return _make_execution_engine_response(messages=[], a2a_messages=a2a_messages, error="")
    except ValidationError as e:
        error_msg = f"Request validation failed for agent {request.agent.name}: {str(e)}"
        return _make_execution_engine_response(messages=[], a2a_messages=[], error=error_msg)
    except Exception as e:
        error_msg = f"LangChain A2A execution failed for agent {request.agent.name}: {str(e)}"
        return _make_execution_engine_response(messages=[], a2a_messages=[], error=error_msg)


if hasattr(app_instance, "setup_a2a_route"):
    app_instance.setup_a2a_route(a2a_executor)
else:
    @app_instance.app.post("/execute-a2a", response_model=ExecutionEngineResponse)
    async def execute_a2a(request: ExecutionEngineRequest):
        return await _execute_a2a_fallback(request)


def create_app() -> FastAPI:
    return app_instance.create_app()