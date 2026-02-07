"""Model resolution utilities for Ark execution engines."""

import logging
from typing import Any, Dict, Optional, Tuple

from .base import Model

logger = logging.getLogger(__name__)


def _detect_provider(model: Model) -> str:
    if model.type in ("azure", "openai", "bedrock"):
        return model.type
    config = model.config
    for provider in ("openai", "azure", "bedrock"):
        if provider in config:
            return provider
    return model.type


def resolve_api_key(model: Model) -> str:
    config = model.config
    provider = _detect_provider(model)
    if provider == "azure":
        return config.get("azure", {}).get("apiKey", "")
    elif provider == "openai":
        return config.get("openai", {}).get("apiKey", "")
    elif provider == "bedrock":
        return config.get("bedrock", {}).get("accessKeyId", "")
    return ""


def resolve_base_url(model: Model) -> str:
    config = model.config
    provider = _detect_provider(model)
    if provider == "azure":
        return config.get("azure", {}).get("baseUrl", "")
    elif provider == "openai":
        return config.get("openai", {}).get("baseUrl", "")
    return ""


def resolve_model_properties(model: Model) -> Dict[str, Any]:
    config = model.config
    provider = _detect_provider(model)
    if provider == "azure":
        return config.get("azure", {}).get("properties", {})
    elif provider == "openai":
        return config.get("openai", {}).get("properties", {})
    elif provider == "bedrock":
        return config.get("bedrock", {}).get("properties", {})
    return {}


def resolve_azure_api_version(model: Model) -> str:
    if model.type != "azure":
        return ""
    return model.config.get("azure", {}).get("apiVersion", "")
