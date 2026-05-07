import logging
import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage


logger = logging.getLogger(__name__)


@pytest.fixture(scope="class")
def secret_test_resources():
    return {"secret_name": None}


@pytest.mark.secrets
@pytest.mark.xdist_group("ark_secrets")
class TestArkSecrets:

    def test_create_secret(self, page: Page, secret_test_resources: dict):
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()

        if not secrets.is_visible(secrets.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")

        result = secrets.create_secret_with_verification("test-secret")

        assert result["popup_visible"], "Success popup should be visible"
        assert result["in_table"], "Secret should be visible in table"

        secret_test_resources["secret_name"] = result["name"]
        logger.info(f"Secret created: {result['name']}")

    def test_delete_secret(self, page: Page, secret_test_resources: dict):
        secrets = SecretsPage(page)
        secrets.navigate_to_secrets_tab()

        secret_name = secret_test_resources["secret_name"]
        if not secret_name:
            pytest.skip("Secret was not created, skipping delete")
        result = secrets.delete_secret_with_verification(secret_name)

        if not result["delete_available"]:
            pytest.skip("Delete functionality not available")

        assert result["confirm_dialog_visible"], "Confirm delete dialog should be visible"
        assert result["confirm_button_visible"], "Confirm delete button should be visible"
        assert result["popup_visible"], "Success popup should be visible"

        logger.info(f"Secret deleted: {secret_name}")
