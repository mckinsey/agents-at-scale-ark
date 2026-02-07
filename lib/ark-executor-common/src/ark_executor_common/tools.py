"""Tool translation utilities for Ark execution engines."""

import logging
from typing import Any, Callable, Dict, List

from .base import ToolDefinition

logger = logging.getLogger(__name__)


def tool_definition_to_openai_function(tool: ToolDefinition) -> Dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters or {"type": "object", "properties": {}},
        },
    }


def tool_definitions_to_openai_functions(tools: List[ToolDefinition]) -> List[Dict[str, Any]]:
    return [tool_definition_to_openai_function(t) for t in tools]


def tool_definition_to_json_schema(tool: ToolDefinition) -> Dict[str, Any]:
    return {
        "name": tool.name,
        "description": tool.description,
        "input_schema": tool.parameters or {"type": "object", "properties": {}},
    }
