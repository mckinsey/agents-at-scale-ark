"""Conversation history utilities for execution engines."""

from typing import List

from .base import Message


def format_history_as_prompt(history: List[Message], user_input: str) -> str:
    """Format conversation history into a single prompt string.
    
    Used by execution engines that accept a single prompt string rather than
    a message array (e.g., Claude Agent SDK).
    
    Args:
        history: Previous conversation messages
        user_input: Current user message content
        
    Returns:
        Formatted prompt string with history context
    """
    if not history:
        return user_input
    
    parts = []
    for msg in history:
        role = msg.role.capitalize()
        name = f" ({msg.name})" if msg.name else ""
        parts.append(f"{role}{name}: {msg.content}")
    
    parts.append(f"User: {user_input}")
    return "\n\n".join(parts)
