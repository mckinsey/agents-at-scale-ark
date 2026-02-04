from datetime import datetime
import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock

from .dummy import DummyRevision, DummyRelease
import pytest

from ark_api.utils.ark_services import (
    SecretType,
    extract_helm_release_data,
    get_chart_annotations,
    get_chart_description,
    get_headers,
    get_helm_releases,
    get_secret,
)

@pytest.mark.asyncio
async def test_extract_helm_release_data_builds_expected_payload():
    release = DummyRelease()
    result = await extract_helm_release_data(release)
    assert result["name"] == "rel"
    assert result["namespace"] == "ns"
    assert result["chart"] == "chart-1.0.0"
    assert result["chart_version"] == "1.0.0"
    assert result["app_version"] == "2.0.0"
    assert result["status"] == "deployed"
    assert result["revision"] == 3
    assert result["updated"].startswith("2024-01-01T12:00:00")
    assert result["chart_metadata"]["annotations"] == {"team": "ark"}
    assert result["chart_metadata"]["description"] == "desc"


@pytest.mark.asyncio
async def test_get_helm_releases_collects_results(monkeypatch):
    release = object()
    client_mock = AsyncMock()
    client_mock.list_releases = AsyncMock(return_value=[release])
    monkeypatch.setattr("ark_api.utils.ark_services.Client", lambda: client_mock)

    extract_mock = AsyncMock(return_value={"name": "rel"})
    monkeypatch.setattr("ark_api.utils.ark_services.extract_helm_release_data", extract_mock)

    result = await get_helm_releases("ns")

    assert result == [{"name": "rel"}]
    client_mock.list_releases.assert_awaited_once_with(namespace="ns")
    extract_mock.assert_awaited_once_with(release)


@pytest.mark.asyncio
async def test_get_helm_releases_handles_error(monkeypatch):
    client_mock = AsyncMock()
    client_mock.list_releases = AsyncMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr("ark_api.utils.ark_services.Client", lambda: client_mock)

    result = await get_helm_releases("ns")

    assert result == []
    client_mock.list_releases.assert_awaited_once_with(namespace="ns")


def test_get_chart_annotations_and_description():
    release_data = {
        "chart_metadata": {
            "annotations": {"team": "ark"},
            "description": "desc",
        }
    }

    assert get_chart_annotations(release_data) == {"team": "ark"}
    assert get_chart_description(release_data) == "desc"


@pytest.mark.asyncio
async def test_get_headers_populates_from_values_and_secrets(monkeypatch):
    resource_spec = {
        "headers": [
            {"name": "X-Plain", "value": {"value": "plain"}},
            {"name": "X-Secret", "value": {"valueFrom": {"secretKeyRef": {"name": "sec", "key": "token"}}}},
        ]
    }
    output = {}

    get_secret_mock = AsyncMock(return_value="secret")
    monkeypatch.setattr("ark_api.utils.ark_services.get_secret", get_secret_mock)

    await get_headers(resource_spec, output, namespace="ns")

    assert output == {"X-Plain": "plain", "X-Secret": "secret"}
    get_secret_mock.assert_awaited_once_with("sec", "token", "ns")


@pytest.mark.asyncio
async def test_get_secret_decodes_opaque_secret(monkeypatch):
    client_mock = AsyncMock()
    encoded = base64.b64encode(b"value").decode()
    client_mock.get_secret_value = AsyncMock(return_value={"type": SecretType.OPAQUE, "value": encoded})
    monkeypatch.setattr("ark_api.utils.ark_services.SecretClient", lambda namespace=None: client_mock)

    result = await get_secret("sec", "key", namespace="ns")

    assert result == b"value"
    client_mock.get_secret_value.assert_awaited_once_with("sec", "key")


@pytest.mark.asyncio
async def test_get_secret_returns_empty_for_non_opaque(monkeypatch):
  client_mock = AsyncMock()
  client_mock.get_secret_value = AsyncMock(return_value={"type": "kubernetes.io/tls", "value": "ignored"})
  monkeypatch.setattr("ark_api.utils.ark_services.SecretClient", lambda namespace=None: client_mock)  
  
  result = await get_secret("sec", "key") 
  
  assert result == ""

