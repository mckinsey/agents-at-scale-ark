import pytest
from playwright.sync_api import Page
from pages.dashboard_page import DashboardPage
from pages.secrets_page import SecretsPage


@pytest.mark.secrets
class TestArkSecrets:
    created_secrets = {}
    
    @pytest.mark.parametrize("prefix,env_key", [
        ("openai", "CICD_OPENAI_API_KEY"),
    ])
    @pytest.mark.dependency(name="create_secret_openai")
    def test_create_secret(self, page: Page, prefix: str, env_key: str):
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        
        if not secrets.is_visible(secrets.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")
        
        result = secrets.create_secret_with_verification(prefix, env_key)
        
        assert result["popup_visible"], f"Success popup should be visible"
        assert result["in_table"], f"Secret should be visible in table"
        
        TestArkSecrets.created_secrets[prefix] = result['name']
        print(f"{prefix} secret created: {result['name']}")
    
    @pytest.mark.parametrize("prefix", [
        "openai",
    ])
    @pytest.mark.dependency(depends=["create_secret_openai"])
    def test_delete_secret(self, page: Page, prefix: str):
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        
        secret_name = TestArkSecrets.created_secrets.get(prefix)
        result = secrets.delete_secret_with_verification(secret_name)
        
        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")
        
        assert result["confirm_dialog_visible"], "Confirm delete dialog should be visible"
        assert result["confirm_button_visible"], "Confirm delete button should be visible"
        assert result["popup_visible"], "Success popup should be visible"
        
        print(f"{prefix} secret deleted: {secret_name}")

