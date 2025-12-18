import logging
from playwright.sync_api import Page
from .base_page import BasePage
from datetime import datetime

logger = logging.getLogger(__name__)


class ModelsPage(BasePage):
    
    ADD_MODEL_BUTTON = "button:has-text('Add Model'), button:has-text('Create Model'), button:has-text('New Model')"
    MODEL_NAME_INPUT = "input[name='name'], input[placeholder*='name' i]"
    MODEL_TYPE_SELECT = "select, [role='combobox']"
    MODEL_INPUT = "input[name='model'], input[placeholder*='model' i]"
    API_KEY_SELECT = "button:has-text('Select a secret'), [role='combobox']:has-text('Select')"
    BASE_URL_INPUT = "input[name='baseUrl'], input[placeholder*='url' i], input[type='url']"
    SAVE_BUTTON = "button:has-text('Add Model'), button:has-text('Create'), button:has-text('Save')"
    SUCCESS_POPUP = "[role='alert'], [role='status'], .notification, .toast, div:has-text('success'), div:has-text('Success'), div:has-text('created'), div:has-text('Created'), div:has-text('deleted'), div:has-text('Deleted')"
    CONFIRM_DELETE_DIALOG = "[role='dialog'], [role='alertdialog'], .modal, div:has-text('confirm'), div:has-text('delete')"
    CONFIRM_DELETE_BUTTON = "button:has-text('Delete'), button:has-text('Confirm'), button:has-text('Yes')"
    
    TEST_DATA = {
        "openai": {
            "model_type": "openai",
            "model_name": "gpt-4o-mini",
            "env_key": "CICD_OPENAI_API_KEY",
            "base_url_key": "CICD_OPENAI_BASE_URL"
        }
    }
    
    def navigate_to_models_tab(self) -> None:
        from .dashboard_page import DashboardPage
        dashboard = DashboardPage(self.page)
        
        # Navigate directly to /models URL instead of clicking tabs
        self.page.goto(f"{dashboard.base_url}/models")
        self.wait_for_navigation_complete()
        
        # Wait for Add Model button to appear
        self.wait_for_element(self.ADD_MODEL_BUTTON, timeout=10000)
    
    def generate_model_name(self, prefix: str = "model") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{date_str}"
    
    def is_model_in_table(self, model_name: str, retries: int = 3) -> bool:
        """Check if model is in table with retry logic"""
        for attempt in range(retries):
            try:
                if self.page.get_by_text(model_name, exact=False).count() > 0:
                    return True
                if attempt < retries - 1:
                    logger.info(f"Model {model_name} not found, retrying... ({attempt + 1}/{retries})")
                    self.page.reload()
                    self.wait_for_navigation_complete()
                    self.wait_for_element(self.ADD_MODEL_BUTTON, timeout=10000)
            except Exception as e:
                logger.warning(f"Error checking model in table: {e}")
        return False
    
    def is_model_available(self, model_name: str) -> bool:
        try:
            name_element = self.page.get_by_text(model_name, exact=True).first
            row_container = name_element.locator("../../..").first
            row_text = row_container.inner_text().lower()
            
            if "true" in row_text or "available" in row_text:
                return True
            logger.warning(f"Model {model_name} is not yet available")
            return False
        except Exception as e:
            return False
    
    def create_model_with_verification(self, model_name: str, model_type: str, model: str, secret_name: str, base_url: str) -> dict:
        logger.info(f"Creating {model_type} model: {model_name}")
        
        self.page.locator(self.ADD_MODEL_BUTTON).first.click()
        self.wait_for_form_ready()
        
        self.page.locator(self.MODEL_NAME_INPUT).first.wait_for(state="visible")
        self.page.locator(self.MODEL_NAME_INPUT).first.fill(model_name)
        self.page.locator("select").first.select_option(value=model_type.lower().replace(" ", ""))
        self.page.locator(self.MODEL_INPUT).first.fill(model)
        self.page.locator("select").nth(1).select_option(value=secret_name)
        self.page.locator(self.BASE_URL_INPUT).first.fill(base_url)
        self.page.locator(self.SAVE_BUTTON).first.wait_for(state="visible")
        self.page.locator(self.SAVE_BUTTON).first.click()
        
        self.wait_for_navigation_complete()
        
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            popup_visible = True
        except:
            popup_visible = False
        
        logger.info(f"Navigating back to models list...")
        self.navigate_to_models_tab()
        self.wait_for_table_content()
        
        in_table = self.is_model_in_table(model_name)
        
        try:
            self.page.get_by_text(model_name, exact=True).first.wait_for(state="visible", timeout=10000)
        except:
            logger.info(f"Model {model_name} not found with exact match, checking if it exists in table...")
            if not self.is_model_in_table(model_name):
                logger.warning(f"Model {model_name} not found in table after creation")
        
        is_available = self.is_model_available(model_name)
        for retry in range(2):
            if is_available:
                break
            logger.warning(f"Model not yet available, retry {retry + 1}/2...")
            self.reload()
            self.wait_for_navigation_complete()
            self.wait_for_table_content()
            is_available = self.is_model_available(model_name)
        
        return {
            "name": model_name,
            "popup_visible": popup_visible,
            "in_table": in_table,
            "is_available": is_available,
            "model_type": model_type
        }
    
    def delete_model_with_verification(self, model_name: str) -> dict:        
        try:
            name_element = self.page.get_by_text(model_name, exact=True).first
            name_element.scroll_into_view_if_needed()
            row_container = name_element.locator("../../..").first
            buttons = row_container.locator("button").all()
            
            if len(buttons) < 2:
                return self._delete_not_available(model_name)
            
            buttons[-1].click()
        except:
            return self._delete_not_available(model_name)
        
        # Wait for confirmation dialog to appear
        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_navigation_complete()
        popup_visible = self._check_success_popup()
        
        # Wait for table to refresh
        self.wait_for_table_content()
        deleted_from_table = not self.is_model_in_table(model_name)
        
        return {
            "model_name": model_name,
            "delete_available": True,
            "confirm_dialog_visible": confirm_dialog_visible,
            "confirm_button_visible": confirm_button_visible,
            "popup_visible": popup_visible,
            "deleted_from_table": deleted_from_table
        }
    
    def _delete_not_available(self, model_name: str) -> dict:
        return {
            "model_name": model_name,
            "delete_available": False,
            "confirm_dialog_visible": False,
            "confirm_button_visible": False,
            "popup_visible": False,
            "deleted_from_table": False
        }
    
    def _check_success_popup(self) -> bool:
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            return True
        except:
            return False
    
    def create_model_for_test(self, prefix: str, secret_name: str, secrets_page):
        import pytest
        
        model_data = self.TEST_DATA["openai"]
        
        self.navigate_to_models_tab()
        
        if not self.is_visible(self.ADD_MODEL_BUTTON):
            pytest.skip("Add Model button not available")
        
        model_display_name = self.generate_model_name(prefix)
        base_url = secrets_page.get_password_from_env(model_data["base_url_key"])
        
        result = self.create_model_with_verification(
            model_name=model_display_name,
            model_type=model_data["model_type"],
            model=model_data["model_name"],
            secret_name=secret_name,
            base_url=base_url
        )
        
        logger.info(f"Model created and available: {result['name']}")
        
        return result
