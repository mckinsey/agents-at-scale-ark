"""LangChain agents for weather forecasting."""

import os

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain.prompts import ChatPromptTemplate
from langchain.tools import tool
from langchain_openai import AzureChatOpenAI
from pydantic import SecretStr

from langchain_weather_agent.weather_tools import get_weather


@tool
def get_weather_tool(city: str) -> str:
    """Get weather forecast for a city using OpenMeteo APIs."""
    return get_weather(city)


def create_weather_agent() -> AgentExecutor:
    """Create a LangChain weather agent with forecasting tools."""

    api_key = os.getenv("AZURE_OPENAI_API_KEY") or ""
    
    llm = AzureChatOpenAI(
        api_key=SecretStr(api_key),
        api_version=os.getenv("AZURE_API_VERSION", "2024-12-01-preview"),
        azure_endpoint=os.getenv("AZURE_API_BASE"),
        azure_deployment=os.getenv("LLM_MODEL_NAME", "gpt-4o"),
        temperature=0.1,
        default_headers={"api-key": api_key},
    )

    tools = [get_weather_tool]

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are a helpful weather assistant. You provide
                weather forecasts and current conditions for any location.

You have access to this tool:
- get_weather_tool: Get weather forecast for a city using OpenMeteo APIs

To get weather for a location, simply use get_weather_tool with the city name.

You should be concise, direct, and to the point.
IMPORTANT: You should NOT answer with unnecessary preamble or postamble.
IMPORTANT: You should not ask any questions or make suggestions.
""",
            ),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ]
    )

    agent = create_tool_calling_agent(llm, tools, prompt)

    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=False,
        handle_parsing_errors=True,
        max_iterations=10,
    )

    return agent_executor


def get_weather_forecast(query: str) -> str:
    """
    Get weather forecast using LangChain agent.

    Args:
        query: User's weather query

    Returns:
        Weather forecast response
    """
    try:
        agent = create_weather_agent()
        result = agent.invoke({"input": query})
        return str(result["output"])
    except Exception as e:
        return f"Error getting weather forecast: {str(e)}"

