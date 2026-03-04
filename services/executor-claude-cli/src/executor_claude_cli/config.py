import os
from dataclasses import dataclass, field


@dataclass
class EngineConfig:
    workspace_dir: str = "/workspace"
    allowed_tools: list[str] = field(
        default_factory=lambda: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
    )
    permission_mode: str = "acceptEdits"
    max_turns: int = 25
    max_budget_usd: float | None = None
    supported_models: list[str] = field(
        default_factory=lambda: ["anthropic", "bedrock", "vertex"]
    )
    port: int = 8000
    host: str = "0.0.0.0"
    mock_mode: bool = False
    mock_response: str = "This is a mock response from the Claude CLI execution engine."

    @classmethod
    def from_env(cls) -> "EngineConfig":
        config = cls()
        if v := os.getenv("WORKSPACE_DIR"):
            config.workspace_dir = v
        if v := os.getenv("ALLOWED_TOOLS"):
            config.allowed_tools = [t.strip() for t in v.split(",")]
        if v := os.getenv("PERMISSION_MODE"):
            config.permission_mode = v
        if v := os.getenv("MAX_TURNS"):
            config.max_turns = int(v)
        if v := os.getenv("MAX_BUDGET_USD"):
            config.max_budget_usd = float(v)
        if v := os.getenv("PORT"):
            config.port = int(v)
        if v := os.getenv("HOST"):
            config.host = v
        if os.getenv("MOCK_MODE", "").lower() in ("true", "1", "yes"):
            config.mock_mode = True
        if v := os.getenv("MOCK_RESPONSE"):
            config.mock_response = v
        return config
