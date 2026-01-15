import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage


@pytest.mark.models
class TestArkModels:
    created_secrets = {}
    created_models = {}
    
    @pytest.mark.parametrize("prefix,env_key,model_type,model_name,base_url_key", [
        ("openai", "CICD_OPENAI_API_KEY", "openai", "gpt-4o-mini", "CICD_OPENAI_BASE_URL"),
    ])
    @pytest.mark.dependency(name="create_model_openai")
    def test_create_model_with_secret(self, page: Page, prefix: str, env_key: str, model_type: str, model_name: str, base_url_key: str):
        secrets = SecretsPage(page)
        models = ModelsPage(page)
        
        secrets.navigate_to_secrets_tab()
        
        if not secrets.is_visible(secrets.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")
        
        secret_result = secrets.create_secret_with_verification(prefix, env_key)
        
        assert secret_result["popup_visible"], "Secret creation popup should be visible"
        assert secret_result["in_table"], "Secret should be visible in table"
        
        secret_name = secret_result['name']
        TestArkModels.created_secrets[prefix] = secret_name
        print(f"{prefix} secret created: {secret_name}")
        
        models.navigate_to_models_tab()
        
        if not models.is_visible(models.ADD_MODEL_BUTTON):
            pytest.skip("Add Model button not available")
        
        model_display_name = models.generate_model_name(prefix)
        base_url = secrets.get_password_from_env(base_url_key)
        
        model_result = models.create_model_with_verification(
            model_name=model_display_name,
            model_type=model_type,
            model=model_name,
            secret_name=secret_name,
            base_url=base_url
        )
        
        assert model_result["popup_visible"], "Model creation popup should be visible"
        assert model_result["is_available"], "Model should show Available status"
        
        TestArkModels.created_models[prefix] = model_result['name']
    
    @pytest.mark.parametrize("prefix", [
        "openai",
    ])
    @pytest.mark.dependency(depends=["create_model_openai"])
    def test_delete_model(self, page: Page, prefix: str):
        models = ModelsPage(page)
        models.navigate_to_models_tab()
        
        model_name = TestArkModels.created_models.get(prefix)
        result = models.delete_model_with_verification(model_name)
        
        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")
        
        assert result["confirm_dialog_visible"], "Confirm delete dialog should be visible"
        assert result["confirm_button_visible"], "Confirm delete button should be visible"
        assert result["popup_visible"], "Success popup should be visible"
        
        print(f"{prefix} model deleted: {model_name}")
