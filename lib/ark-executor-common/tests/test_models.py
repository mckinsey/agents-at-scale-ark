from ark_executor_common.base import Model
from ark_executor_common.models import (
    _detect_provider,
    resolve_api_key,
    resolve_base_url,
    resolve_model_properties,
    resolve_azure_api_version,
)


class TestDetectProvider:

    def test_explicit_openai_type(self):
        model = Model(name="gpt-4o", type="openai", config={})
        assert _detect_provider(model) == "openai"

    def test_explicit_azure_type(self):
        model = Model(name="gpt-4o", type="azure", config={})
        assert _detect_provider(model) == "azure"

    def test_explicit_bedrock_type(self):
        model = Model(name="claude", type="bedrock", config={})
        assert _detect_provider(model) == "bedrock"

    def test_completions_type_with_openai_config(self):
        model = Model(
            name="gpt-4o",
            type="completions",
            config={"openai": {"apiKey": "sk-test"}},
        )
        assert _detect_provider(model) == "openai"

    def test_completions_type_with_azure_config(self):
        model = Model(
            name="gpt-4o",
            type="completions",
            config={"azure": {"apiKey": "az-test"}},
        )
        assert _detect_provider(model) == "azure"

    def test_completions_type_with_bedrock_config(self):
        model = Model(
            name="claude",
            type="completions",
            config={"bedrock": {"accessKeyId": "ak-test"}},
        )
        assert _detect_provider(model) == "bedrock"

    def test_completions_type_no_config_returns_type(self):
        model = Model(name="test", type="completions", config={})
        assert _detect_provider(model) == "completions"

    def test_unknown_type_no_config(self):
        model = Model(name="test", type="custom", config={})
        assert _detect_provider(model) == "custom"

    def test_config_detection_priority_openai_first(self):
        model = Model(
            name="test",
            type="completions",
            config={
                "openai": {"apiKey": "sk-test"},
                "azure": {"apiKey": "az-test"},
            },
        )
        assert _detect_provider(model) == "openai"


class TestResolveApiKey:

    def test_openai_api_key(self):
        model = Model(
            name="gpt-4o",
            type="openai",
            config={"openai": {"apiKey": "sk-test-key"}},
        )
        assert resolve_api_key(model) == "sk-test-key"

    def test_azure_api_key(self):
        model = Model(
            name="gpt-4o",
            type="azure",
            config={"azure": {"apiKey": "az-test-key"}},
        )
        assert resolve_api_key(model) == "az-test-key"

    def test_bedrock_access_key(self):
        model = Model(
            name="claude",
            type="bedrock",
            config={"bedrock": {"accessKeyId": "AKIA-test"}},
        )
        assert resolve_api_key(model) == "AKIA-test"

    def test_completions_type_resolves_via_config(self):
        model = Model(
            name="gpt-4o",
            type="completions",
            config={"openai": {"apiKey": "sk-from-completions"}},
        )
        assert resolve_api_key(model) == "sk-from-completions"

    def test_missing_config_returns_empty(self):
        model = Model(name="gpt-4o", type="openai", config={})
        assert resolve_api_key(model) == ""

    def test_missing_api_key_returns_empty(self):
        model = Model(
            name="gpt-4o",
            type="openai",
            config={"openai": {"baseUrl": "https://example.com"}},
        )
        assert resolve_api_key(model) == ""

    def test_unknown_provider_returns_empty(self):
        model = Model(name="test", type="custom", config={})
        assert resolve_api_key(model) == ""


class TestResolveBaseUrl:

    def test_openai_base_url(self):
        model = Model(
            name="gpt-4o",
            type="openai",
            config={"openai": {"baseUrl": "https://api.example.com/v1"}},
        )
        assert resolve_base_url(model) == "https://api.example.com/v1"

    def test_azure_base_url(self):
        model = Model(
            name="gpt-4o",
            type="azure",
            config={"azure": {"baseUrl": "https://my-resource.openai.azure.com"}},
        )
        assert resolve_base_url(model) == "https://my-resource.openai.azure.com"

    def test_bedrock_returns_empty(self):
        model = Model(
            name="claude",
            type="bedrock",
            config={"bedrock": {"region": "us-east-1"}},
        )
        assert resolve_base_url(model) == ""

    def test_missing_config_returns_empty(self):
        model = Model(name="gpt-4o", type="openai", config={})
        assert resolve_base_url(model) == ""

    def test_unknown_provider_returns_empty(self):
        model = Model(name="test", type="custom", config={})
        assert resolve_base_url(model) == ""


class TestResolveModelProperties:

    def test_openai_properties(self):
        model = Model(
            name="gpt-4o",
            type="openai",
            config={"openai": {"properties": {"temperature": 0.7, "max_tokens": 1024}}},
        )
        props = resolve_model_properties(model)
        assert props == {"temperature": 0.7, "max_tokens": 1024}

    def test_azure_properties(self):
        model = Model(
            name="gpt-4o",
            type="azure",
            config={"azure": {"properties": {"temperature": 0.5}}},
        )
        assert resolve_model_properties(model) == {"temperature": 0.5}

    def test_bedrock_properties(self):
        model = Model(
            name="claude",
            type="bedrock",
            config={"bedrock": {"properties": {"max_tokens": 2048}}},
        )
        assert resolve_model_properties(model) == {"max_tokens": 2048}

    def test_missing_properties_returns_empty(self):
        model = Model(
            name="gpt-4o",
            type="openai",
            config={"openai": {"apiKey": "test"}},
        )
        assert resolve_model_properties(model) == {}

    def test_unknown_provider_returns_empty(self):
        model = Model(name="test", type="custom", config={})
        assert resolve_model_properties(model) == {}


class TestResolveAzureApiVersion:

    def test_azure_api_version(self):
        model = Model(
            name="gpt-4o",
            type="azure",
            config={"azure": {"apiVersion": "2024-02-15-preview"}},
        )
        assert resolve_azure_api_version(model) == "2024-02-15-preview"

    def test_non_azure_returns_empty(self):
        model = Model(name="gpt-4o", type="openai", config={})
        assert resolve_azure_api_version(model) == ""

    def test_azure_missing_version_returns_empty(self):
        model = Model(
            name="gpt-4o",
            type="azure",
            config={"azure": {"apiKey": "test"}},
        )
        assert resolve_azure_api_version(model) == ""
