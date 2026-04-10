import logging
import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage

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
    
    @pytest.mark.parametrize("prefix,env_key,model_type,model_name,base_url_key", [
        ("openai", "CICD_OPENAI_API_KEY", "openai", "gpt-4o-mini", "CICD_OPENAI_BASE_URL"),
        ("anthropic", "CICD_ANTHROPIC_API_KEY", "anthropic", "claude-3-haiku-20240307", "CICD_ANTHROPIC_BASE_URL"),
        ("azure", "CICD_AZURE_API_KEY", "azure", "gpt-35-turbo", "CICD_AZURE_BASE_URL"),
    ])
    def test_create_model_with_secret(self, page: Page, prefix: str, env_key: str, model_type: str, model_name: str, base_url_key: str, model_test_resources: dict):
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        
        secrets.navigate_to_secrets_tab()
        
        if not secrets.is_visible(secrets.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")
        
        api_key = secrets.get_password_from_env(env_key)
        if not api_key:
            pytest.skip(f"{env_key} not set or empty")
        
        base_url = secrets.get_password_from_env(base_url_key) if base_url_key else None
        if base_url_key and not base_url:
            pytest.skip(f"{base_url_key} not set or empty")
        
        secret_result = secrets.create_secret_with_verification(prefix, env_key)
        
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        
        secret_name = secret_result['name']
        model_test_resources["secrets"][prefix] = secret_name
        logger.info(f"{prefix} secret created: {secret_name}")
        
        models.navigate_to_models_tab()
        
        if not models.is_visible(models.ADD_MODEL_BUTTON):
            pytest.skip("Add Model button not available")
        
        model_display_name = models.generate_model_name(prefix)
        
        model_result = models.create_model_with_verification(
            model_name=model_display_name,
            model_type=model_type,
            model=model_name,
            secret_name=secret_name,
            base_url=base_url
        )
        
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["is_available"], "Model should show Available status"
        
        model_test_resources["models"][prefix] = model_result['name']
    
    @pytest.mark.parametrize("prefix", [
        "openai",
        "anthropic",
        "azure",
    ])
    def test_delete_model(self, page: Page, prefix: str, model_test_resources: dict):
        models = ModelsPage(page)
        models.navigate_to_models_tab()
        
        model_name = model_test_resources["models"].get(prefix)
        if not model_name:
            pytest.skip("Model was not created, skipping delete")
        result = models.delete_model_with_verification(model_name)
        
        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")
        
        assert result["confirm_dialog_visible"], "Confirm delete dialog should be visible"
        assert result["confirm_button_visible"], "Confirm delete button should be visible"
        assert result["popup_visible"], "Success popup should be visible"
        
        logger.info(f"{prefix} model deleted: {model_name}")
