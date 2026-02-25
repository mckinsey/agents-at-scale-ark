import pytest
from playwright.sync_api import Page
from pages.dashboard_page import DashboardPage
from pages.secrets_page import SecretsPage


@pytest.fixture(scope="class")
def secret_test_resources():
    return {"secrets": {}}


@pytest.mark.secrets
@pytest.mark.xdist_group("ark_secrets")
class TestArkSecrets:
    
    @pytest.mark.parametrize("prefix,env_key", [
        ("openai", "CICD_OPENAI_API_KEY"),
    ])
    def test_create_secret(self, page: Page, prefix: str, env_key: str, secret_test_resources: dict):
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        
        if not secrets.is_visible(secrets.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")
        
        result = secrets.create_secret_with_verification(prefix, env_key)
        
        assert result["popup_visible"], f"Success popup should be visible"
        assert result["in_table"], f"Secret should be visible in table"
        
        secret_test_resources["secrets"][prefix] = result['name']
        print(f"{prefix} secret created: {result['name']}")
    
    @pytest.mark.parametrize("prefix", [
        "openai",
    ])
    def test_delete_secret(self, page: Page, prefix: str, secret_test_resources: dict):
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()
        
        secret_name = secret_test_resources["secrets"].get(prefix)
        if not secret_name:
            pytest.skip("Secret was not created, skipping delete")
        result = secrets.delete_secret_with_verification(secret_name)
        
        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")
        
        assert result["confirm_dialog_visible"], "Confirm delete dialog should be visible"
        assert result["confirm_button_visible"], "Confirm delete button should be visible"
        assert result["popup_visible"], "Success popup should be visible"
        
        print(f"{prefix} secret deleted: {secret_name}")


