from ark_sdk.executor import BaseExecutor, ExecutionEngineRequest, Message, TokenUsage


class ExampleExecutor(BaseExecutor):
    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        user_message = request.userInput.content

        response_text = f"I received: {user_message}"

        self.report_token_usage(TokenUsage(
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150
        ))

        return [Message(role="assistant", content=response_text)]
