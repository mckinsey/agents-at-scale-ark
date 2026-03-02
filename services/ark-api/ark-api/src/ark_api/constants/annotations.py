"""Annotation constants for ARK resources."""

# ARK annotation prefix
ARK_PREFIX = "ark.mckinsey.com/"

# Dashboard annotations
DASHBOARD_ICON_ANNOTATION = ARK_PREFIX + "dashboard-icon"

# A2A annotations
A2A_SERVER_NAME_ANNOTATION = ARK_PREFIX + "a2a-server-name"
A2A_SERVER_ADDRESS_ANNOTATION = ARK_PREFIX + "a2a-server-address"
A2A_SERVER_SKILLS_ANNOTATION = ARK_PREFIX + "a2a-server-skills"
A2A_CONTEXT_ID_ANNOTATION = ARK_PREFIX + "a2a-context-id"
A2A_STREAMING_SUPPORTED_ANNOTATION = ARK_PREFIX + "a2a-streaming-supported"
EXECUTION_MODE_ANNOTATION = ARK_PREFIX + "execution-mode"
A2A_HISTORY_ENABLED_ANNOTATION = ARK_PREFIX + "a2a-history-enabled"
A2A_HISTORY_LIMIT_ANNOTATION = ARK_PREFIX + "a2a-history-limit"
A2A_EXTENSIONS_ANNOTATION = ARK_PREFIX + "a2a-extensions"
A2A_PERMISSIONS_ANNOTATION = ARK_PREFIX + "a2a-permissions"
A2A_SUPPORTED_EXTENSIONS_ANNOTATION = ARK_PREFIX + "a2a-supported-extensions"


def parse_bool_annotation(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return default

# MCP annotations
MCP_SERVER_NAME_ANNOTATION = ARK_PREFIX + "mcp-server-name"
MCP_SERVER_SETTINGS_ANNOTATION = ARK_PREFIX + "mcp-server-settings"

# ARK service annotations
SERVICE_ANNOTATION = ARK_PREFIX + "service"
RESOURCES_ANNOTATION = ARK_PREFIX + "resources"

# General annotations
LOCALHOST_GATEWAY_PORT_ANNOTATION = ARK_PREFIX + "localhost-gateway-port"

# Streaming annotations
STREAMING_ENABLED_ANNOTATION = ARK_PREFIX + "streaming-enabled"
MEMORY_EVENT_STREAM_ENABLED_ANNOTATION = ARK_PREFIX + "memory-event-stream-enabled"