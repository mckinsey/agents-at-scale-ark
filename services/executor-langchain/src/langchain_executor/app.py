from fastapi import FastAPI
from ark_sdk.executor_app import ExecutorApp
from ark_sdk.executor import ExecutionEngineRequest, ExecutionEngineResponse
from .executor import LangChainExecutor
from .a2a_executor import A2ALangChainExecutor

executor = LangChainExecutor()
app_instance = ExecutorApp(executor, "LangChain")
a2a_executor = A2ALangChainExecutor()

if hasattr(app_instance, "setup_a2a_route"):
    app_instance.setup_a2a_route(a2a_executor)
else:
    @app_instance.app.post("/execute-a2a", response_model=ExecutionEngineResponse)
    async def execute_a2a(request: ExecutionEngineRequest):
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
        return ExecutionEngineResponse(messages=[], a2aMessages=a2a_messages, error="")


def create_app() -> FastAPI:
    return app_instance.create_app()