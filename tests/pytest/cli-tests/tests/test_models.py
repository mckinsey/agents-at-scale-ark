import os
import pytest
from helpers.models_helper import DEFAULT_AZURE_API_VERSION, ModelsHelper

PREFIX = "cli-model-test"

PROVIDERS = [
    pytest.param(
        "openai",
        {"api_key_env": "CICD_OPENAI_API_KEY", "base_url_env": "CICD_OPENAI_BASE_URL", "model": "gpt-4o-mini"},
        id="openai",
    ),
    pytest.param(
        "anthropic",
        {"api_key_env": "CICD_ANTHROPIC_API_KEY", "base_url_env": "CICD_ANTHROPIC_BASE_URL", "model": "claude-3-haiku-20240307"},
        id="anthropic",
    ),
    pytest.param(
        "azure",
        {"api_key_env": "CICD_AZURE_API_KEY", "base_url_env": "CICD_AZURE_BASE_URL", "model": "gpt-35-turbo", "api_version": DEFAULT_AZURE_API_VERSION},
        id="azure",
    ),
]


def _secret_name(provider: str) -> str:
    return f"{PREFIX}-{provider}-secret"


def _model_name(provider: str) -> str:
    return f"{PREFIX}-{provider}"


def _skip_if_missing(config: dict) -> None:
    if not os.environ.get(config["api_key_env"]):
        pytest.skip(f"{config['api_key_env']} not set")
    if config.get("base_url_env") and not os.environ.get(config["base_url_env"]):
        pytest.skip(f"{config['base_url_env']} not set")


@pytest.fixture(scope="module")
def helper():
    return ModelsHelper()


@pytest.fixture(scope="module", autouse=True)
def cleanup(helper):
    yield
    for p in PROVIDERS:
        helper.cleanup(_model_name(p.id), _secret_name(p.id))


@pytest.mark.models
@pytest.mark.parametrize("provider,config", PROVIDERS)
class TestProviderModels:

    def test_create_secret(self, helper, provider, config):
        _skip_if_missing(config)
        api_key = os.environ[config["api_key_env"]]
        success, msg = helper.create_secret(_secret_name(provider), api_key)
        assert success, f"Failed to create {provider} secret: {msg}"

    def test_secret_exists(self, helper, provider, config):
        _skip_if_missing(config)
        success, _, stderr = helper._run_cmd(
            ["kubectl", "get", "secret", _secret_name(provider), "-n", helper.NAMESPACE],
            check=False,
        )
        assert success, f"{provider} secret not found: {stderr}"

    def test_create_model(self, helper, provider, config):
        _skip_if_missing(config)
        base_url = os.environ.get(config["base_url_env"], "") if config["base_url_env"] else ""
        if provider == "openai":
            success, msg = helper.create_openai_model(_model_name(provider), _secret_name(provider), config["model"], base_url)
        elif provider == "anthropic":
            success, msg = helper.create_anthropic_model(_model_name(provider), _secret_name(provider), config["model"], base_url)
        else:
            api_version = config.get("api_version", DEFAULT_AZURE_API_VERSION)
            success, msg = helper.create_azure_model(_model_name(provider), _secret_name(provider), config["model"], base_url, api_version)
        assert success, f"Failed to create {provider} model: {msg}"

    def test_model_exists(self, helper, provider, config):
        _skip_if_missing(config)
        assert helper.model_exists(_model_name(provider)), f"{provider} model not found in cluster"

    def test_model_provider_spec(self, helper, provider, config):
        _skip_if_missing(config)
        actual = helper.get_model_provider(_model_name(provider))
        assert actual == provider, f"Expected provider '{provider}', got '{actual}'"

    def test_model_name_spec(self, helper, provider, config):
        _skip_if_missing(config)
        actual = helper.get_model_name_value(_model_name(provider))
        assert actual == config["model"], f"Expected model '{config['model']}', got '{actual}'"

    def test_model_available(self, helper, provider, config):
        _skip_if_missing(config)
        available, message = helper.wait_for_availability(_model_name(provider))
        if not available and "unknown error" in message:
            pytest.skip(f"{provider} model unreachable from cluster (network): {message}")
        assert available, f"{provider} model not available after timeout: {message}"

    def test_delete_model(self, helper, provider, config):
        _skip_if_missing(config)
        success, msg = helper.delete_model(_model_name(provider))
        assert success, f"Failed to delete {provider} model: {msg}"
        assert not helper.model_exists(_model_name(provider)), f"{provider} model still exists after deletion"
