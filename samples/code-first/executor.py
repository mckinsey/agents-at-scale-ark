from ark_executor_common import (
    BaseExecutor,
    ExecutionEngineRequest,
    ExecutorApp,
    Message,
    resolve_api_key,
    resolve_base_url,
)


class MyExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest, trace_context=None) -> list[Message]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=resolve_api_key(request.agent.model),
            base_url=resolve_base_url(request.agent.model) or None,
        )

        messages = []
        if request.agent.prompt:
            messages.append({"role": "system", "content": request.agent.prompt})
        for msg in request.history:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": request.userInput.role, "content": request.userInput.content})

        response = await client.chat.completions.create(
            model=request.agent.model.name,
            messages=messages,
        )

        return [
            Message(
                role="assistant",
                content=response.choices[0].message.content,
                name=request.agent.name,
            )
        ]


app = ExecutorApp(MyExecutor("code-first-example"), "Code-First Example").create_app()
