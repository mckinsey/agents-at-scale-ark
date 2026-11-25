import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    namespaces: list[str]
    ark_api_url: str
    ark_api_public_key: str
    ark_api_secret_key: str
    poll_interval_seconds: float
    lookback_seconds: float
    log_lines: int
    otel_secret_name: str
    default_traces_endpoint: str
    default_headers: str


def load_config() -> Config:
    return Config(
        namespaces=[ns.strip() for ns in os.environ["WATCH_NAMESPACES"].split(",") if ns.strip()],
        ark_api_url=os.environ["ARK_API_URL"].rstrip("/"),
        ark_api_public_key=os.getenv("ARK_API_PUBLIC_KEY", ""),
        ark_api_secret_key=os.getenv("ARK_API_SECRET_KEY", ""),
        poll_interval_seconds=float(os.getenv("POLL_INTERVAL_SECONDS", "15")),
        lookback_seconds=float(os.getenv("LOOKBACK_SECONDS", "3600")),
        log_lines=int(os.getenv("LOG_LINES", "50")),
        otel_secret_name=os.getenv("OTEL_SECRET_NAME", "otel-environment-variables"),
        default_traces_endpoint=os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", ""),
        default_headers=os.getenv("OTEL_EXPORTER_OTLP_TRACES_HEADERS", ""),
    )
