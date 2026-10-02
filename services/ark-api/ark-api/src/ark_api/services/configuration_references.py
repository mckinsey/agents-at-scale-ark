"""Find the Ark resources that read a configuration."""
from typing import Any, Dict, List

CONFIG_MAP_KEY_REF = "configMapKeyRef"
VALUE_FROM_SUFFIX = ".valueFrom"

REFERRING_RESOURCES = (
    ("Model", "models", "v1alpha1"),
    ("Agent", "agents", "v1alpha1"),
    ("Tool", "tools", "v1alpha1"),
    ("Memory", "memories", "v1alpha1"),
    ("MCPServer", "mcpservers", "v1alpha1"),
    ("Query", "queries", "v1alpha1"),
    ("A2AServer", "a2aservers", "v1prealpha1"),
    ("ExecutionEngine", "executionengines", "v1prealpha1"),
)


def _walk(node: Any, path: str, config_map_name: str, found: List[str]) -> None:
    if isinstance(node, dict):
        ref = node.get(CONFIG_MAP_KEY_REF)
        if isinstance(ref, dict) and ref.get("name") == config_map_name:
            found.append(path[:-len(VALUE_FROM_SUFFIX)] if path.endswith(VALUE_FROM_SUFFIX) else path)
        for key, value in node.items():
            _walk(value, f"{path}.{key}", config_map_name, found)
    elif isinstance(node, list):
        for index, item in enumerate(node):
            _walk(item, f"{path}[{index}]", config_map_name, found)


def find_config_map_references(spec: Dict[str, Any], config_map_name: str) -> List[str]:
    """Return the field paths in a spec that read the named ConfigMap."""
    found: List[str] = []
    _walk(spec, "spec", config_map_name, found)
    return found
