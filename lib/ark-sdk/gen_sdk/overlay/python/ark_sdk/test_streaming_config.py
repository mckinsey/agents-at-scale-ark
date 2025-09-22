"""Tests for streaming configuration."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from ark_sdk.streaming_config import ArkStreamingConfig, ServiceRef, get_streaming_config, get_streaming_url, STREAMING_CONFIG_NAME


def test_from_dict_valid():
    """Test creating config from valid dict."""
    data = {
        "enabled": "true",
        "serviceRef": 'name: ark-cluster-memory\nport: "80"'
    }
    config = ArkStreamingConfig.from_dict(data)

    assert config.enabled is True
    assert config.serviceRef.name == "ark-cluster-memory"
    assert config.serviceRef.port == "80"


def test_from_dict_with_namespace():
    """Test serviceRef with namespace."""
    data = {
        "enabled": "false",
        "serviceRef": 'name: my-service\nport: "8080"\nnamespace: ark-system'
    }
    config = ArkStreamingConfig.from_dict(data)

    assert config.enabled is False
    assert config.serviceRef.namespace == "ark-system"


@pytest.mark.asyncio
async def test_get_config_not_found():
    """Test returns None when ConfigMap doesn't exist."""
    mock_client = AsyncMock()
    mock_error = Exception()
    mock_error.status = 404
    mock_client.read_namespaced_config_map.side_effect = mock_error

    result = await get_streaming_config(mock_client, "default")
    assert result is None


@pytest.mark.asyncio
async def test_get_config_valid():
    """Test returns config when ConfigMap exists."""
    mock_client = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.data = {
        "enabled": "true",
        "serviceRef": 'name: ark-cluster-memory\nport: "80"'
    }
    mock_client.read_namespaced_config_map.return_value = mock_cm

    result = await get_streaming_config(mock_client, "default")

    assert result.enabled is True
    assert result.serviceRef.name == "ark-cluster-memory"
    assert result.serviceRef.port == "80"


@pytest.mark.asyncio
async def test_get_config_other_error():
    """Test that non-404 errors are raised."""
    mock_client = AsyncMock()
    mock_client.read_namespaced_config_map.side_effect = Exception("Connection error")

    with pytest.raises(Exception):
        await get_streaming_config(mock_client, "default")


def test_get_streaming_url_valid():
    """Test constructing streaming URL with valid config."""
    config = ArkStreamingConfig(
        enabled=True,
        serviceRef=ServiceRef(name="my-service", port="8080", namespace=None)
    )

    url = get_streaming_url("test-query", config, "default")

    assert url == "http://my-service.default.svc.cluster.local:8080/stream/test-query?from-beginning=true&wait-for-query=30s"


def test_get_streaming_url_with_namespace():
    """Test streaming URL with service in different namespace."""
    config = ArkStreamingConfig(
        enabled=True,
        serviceRef=ServiceRef(name="my-service", port="9090", namespace="other-ns")
    )

    url = get_streaming_url("test-query", config, "default")

    assert url == "http://my-service.other-ns.svc.cluster.local:9090/stream/test-query?from-beginning=true&wait-for-query=30s"


def test_get_streaming_url_no_config():
    """Test that missing config raises ValueError."""
    with pytest.raises(ValueError, match="No streaming configuration provided"):
        get_streaming_url("test-query", None, "default")


def test_get_streaming_url_invalid_config():
    """Test that invalid config raises ValueError."""
    config = ArkStreamingConfig(
        enabled=True,
        serviceRef=ServiceRef(name="", port="8080", namespace=None)
    )

    with pytest.raises(ValueError, match="missing service name or port"):
        get_streaming_url("test-query", config, "default")