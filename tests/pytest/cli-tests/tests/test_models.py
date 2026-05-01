import pytest
from helpers.models_helper import ModelsHelper

SECRET_MODEL_NAME = "cli-model-test-secret"
SECRET_NAME = "cli-model-test-secret-token"


@pytest.fixture(scope="module")
def helper():
    return ModelsHelper()


@pytest.mark.models
class TestSecretModel:
    """Tests secret creation and a model that uses secretKeyRef.
    The model will not become available (no real LLM behind the URL),
    but we verify the CRUD operations and spec are correct."""

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self, helper):
        yield
        helper.delete_model(SECRET_MODEL_NAME)
        helper.delete_secret(SECRET_NAME)

    def test_create_secret(self, helper):
        success, msg = helper.create_secret(SECRET_NAME, "dummy-token")
        assert success, f"Failed to create secret: {msg}"

    def test_secret_exists(self, helper):
        success, _, stderr = helper._run_cmd(
            ["kubectl", "get", "secret", SECRET_NAME, "-n", helper.NAMESPACE],
            check=False,
        )
        assert success, f"Secret not found: {stderr}"

    def test_create_model(self, helper):
        success, msg = helper.create_openai_model(
            SECRET_MODEL_NAME, SECRET_NAME, "gpt-4o-mini",
            "http://mock-llm.default.svc.cluster.local:6556/v1"
        )
        assert success, f"Failed to create model: {msg}"

    def test_model_exists(self, helper):
        assert helper.model_exists(SECRET_MODEL_NAME), "Model not found in cluster"

    def test_model_provider_spec(self, helper):
        actual = helper.get_model_provider(SECRET_MODEL_NAME)
        assert actual == "openai", f"Expected provider 'openai', got '{actual}'"

    def test_model_name_spec(self, helper):
        actual = helper.get_model_name_value(SECRET_MODEL_NAME)
        assert actual == "gpt-4o-mini", f"Expected model 'gpt-4o-mini', got '{actual}'"

    def test_delete_model(self, helper):
        success, msg = helper.delete_model(SECRET_MODEL_NAME)
        assert success, f"Failed to delete model: {msg}"
        assert not helper.model_exists(SECRET_MODEL_NAME), "Model still exists after deletion"

    def test_delete_secret(self, helper):
        success, msg = helper.delete_secret(SECRET_NAME)
        assert success, f"Failed to delete secret: {msg}"


@pytest.mark.models
class TestMockModel:
    MODEL_NAME = "cli-model-test-mock"

    @pytest.fixture(scope="class", autouse=True)
    def cleanup(self, helper):
        yield
        helper.delete_model(self.MODEL_NAME)

    def test_create_model(self, helper):
        success, msg = helper.create_mock_model(self.MODEL_NAME)
        assert success, f"Failed to create mock model: {msg}"

    def test_model_exists(self, helper):
        assert helper.model_exists(self.MODEL_NAME), "Mock model not found in cluster"

    def test_model_provider_spec(self, helper):
        actual = helper.get_model_provider(self.MODEL_NAME)
        assert actual == "openai", f"Expected provider 'openai', got '{actual}'"

    def test_model_name_spec(self, helper):
        actual = helper.get_model_name_value(self.MODEL_NAME)
        assert actual == "gpt-4.1-mini", f"Expected model 'gpt-4.1-mini', got '{actual}'"

    def test_model_available(self, helper):
        available, message = helper.wait_for_availability(self.MODEL_NAME)
        assert available, f"Mock model not available after timeout: {message}"

    def test_delete_model(self, helper):
        success, msg = helper.delete_model(self.MODEL_NAME)
        assert success, f"Failed to delete mock model: {msg}"
        assert not helper.model_exists(self.MODEL_NAME), "Mock model still exists after deletion"
