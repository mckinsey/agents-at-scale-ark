"""Model resolution utilities for Ark execution engines."""

import logging
from typing import Any, Dict, Optional, Tuple

from .base import Model

logger = logging.getLogger(__name__)


def resolve_api_key(model: Model) -> str:
    config = model.config
    if model.type == "azure":
        return config.get("azure", {}).get("apiKey", "")
    elif model.type == "openai":
        return config.get("openai", {}).get("apiKey", "")
    elif model.type == "bedrock":
        return config.get("bedrock", {}).get("accessKeyId", "")
    return ""


def resolve_base_url(model: Model) -> str:
    config = model.config
    if model.type == "azure":
        return config.get("azure", {}).get("baseUrl", "")
    elif model.type == "openai":
        return config.get("openai", {}).get("baseUrl", "")
    return ""


def resolve_model_properties(model: Model) -> Dict[str, Any]:
    config = model.config
    if model.type == "azure":
        return config.get("azure", {}).get("properties", {})
    elif model.type == "openai":
        return config.get("openai", {}).get("properties", {})
    elif model.type == "bedrock":
        return config.get("bedrock", {}).get("properties", {})
    return {}


def resolve_azure_api_version(model: Model) -> str:
    if model.type != "azure":
        return ""
    return model.config.get("azure", {}).get("apiVersion", "")
