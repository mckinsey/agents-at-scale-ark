"""LangChain compat executor delegates to A2A root."""

from ark_sdk.executor import BaseExecutor

from .a2a_executor import A2ALangChainExecutor


class LangChainExecutor(BaseExecutor):
    def __init__(self):
        super().__init__("LangChain")
        self._native_executor = A2ALangChainExecutor()

    async def execute_agent(self, request):
        return await self._native_executor.execute_agent(request)

