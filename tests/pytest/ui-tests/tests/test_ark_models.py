import logging
import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage, MOCK_LLM_BASE_URL

logger = logging.getLogger(__name__)


@pytest.fixture(scope="class")
def model_test_resources():
    return {
        "secrets": {},
        "models": {}
    }


@pytest.mark.models
@pytest.mark.xdist_group("ark_models")
class TestArkModels:

    def test_create_model_with_secret(self, page: Page, model_test_resources: dict):
        secrets = SecretsPage(page)
        models = ModelsPage(page)

        secrets.navigate_to_secrets_tab()
        if not secrets.is_visible(secrets.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")

        secret_result = secrets.create_secret_with_verification("model-secret")
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        model_test_resources["secrets"]["model"] = secret_result['name']

        models.navigate_to_models_tab()
        if not models.is_visible(models.ADD_MODEL_BUTTON):
            pytest.skip("Add Model button not available")

        model_display_name = models.generate_model_name("model")
        model_result = models.create_model_with_verification(
            model_name=model_display_name,
            model_type="openai",
            model="gpt-4o-mini",
            secret_name=secret_result['name'],
            base_url=MOCK_LLM_BASE_URL,
        )
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["in_table"], "Model should be visible in table"
        model_test_resources["models"]["model"] = model_result['name']

    def test_delete_model(self, page: Page, model_test_resources: dict):
        models = ModelsPage(page)
        models.navigate_to_models_tab()

        model_name = model_test_resources["models"].get("model")
        if not model_name:
            pytest.skip("Model was not created, skipping delete")
        result = models.delete_model_with_verification(model_name)

        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")

        assert result["confirm_dialog_visible"], "Confirm delete dialog should be visible"
        assert result["confirm_button_visible"], "Confirm delete button should be visible"
        assert result["popup_visible"], "Success popup should be visible"
        logger.info(f"Model deleted: {model_name}")

        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        secret_name = model_test_resources["secrets"].get("model")
        secrets.delete_secret_with_verification(secret_name)
        logger.info(f"Secret deleted: {secret_name}")
