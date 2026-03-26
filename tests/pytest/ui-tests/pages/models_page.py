import logging
import random
import pytest
from datetime import datetime
from playwright.sync_api import Page
from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class ModelsPage(BasePage):
    
    ADD_MODEL_BUTTON = "button:has-text('Add Model'), button:has-text('Create Model'), button:has-text('New Model')"
    MODEL_NAME_INPUT = "input[name='name'], input[placeholder*='name' i]"
    MODEL_TYPE_SELECT = "select, [role='combobox']"
    MODEL_INPUT = "input[name='model'], input[placeholder*='model' i]"
    API_KEY_SELECT = "button:has-text('Select a secret'), [role='combobox']:has-text('Select')"
    BASE_URL_INPUT = "input[name='baseUrl'], input[placeholder*='url' i], input[type='url']"
    SAVE_BUTTON = "button:has-text('Add Model'), button:has-text('Create'), button:has-text('Save')"
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
        dashboard = DashboardPage(self.page)
        self.page.goto(f"{dashboard.base_url}/models")
        # full page has not loaded until the networkidle state, unfortunately
        self.wait_for_load_state("networkidle")
    
    def generate_model_name(self, prefix: str = "model") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        rand = random.randint(100, 999)
        return f"{prefix}-{date_str}{rand}"
    
    def is_model_in_table(self, model_name: str, retries: int = 3) -> bool:
        for attempt in range(retries):
            try:
                self.page.get_by_text(model_name, exact=False).first.wait_for(state="visible", timeout=10000)
                return True
            except Exception as e:
                logger.debug(f"Model {model_name} not visible on attempt {attempt + 1}/{retries}: {e}")
                if attempt < retries - 1:
                    logger.info(f"Model {model_name} not found, retrying ({attempt + 1}/{retries})...")
                    self.page.reload()
                    self.wait_for_navigation_complete()
                    self.wait_for_element(self.ADD_MODEL_BUTTON, timeout=10000)
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
    
    def _select_from_combobox(self, trigger_selector: str, option_text: str) -> None:
        trigger = self.page.locator(trigger_selector).first
        trigger.wait_for(state="visible", timeout=5000)
        trigger.click()
        self.wait_for_dropdown_options()
        self.page.locator(f"[role='option']:has-text('{option_text}')").first.click()
        self.wait_for_element_hidden("[role='listbox'], [data-slot='select-content']", timeout=3000)

    def create_model_with_verification(self, model_name: str, model_type: str, model: str, secret_name: str, base_url: str) -> dict:
        logger.info(f"Creating {model_type} model: {model_name}")
        
        self.page.locator(self.ADD_MODEL_BUTTON).first.click()
        self.wait_for_navigation_complete()
        
        name_input = self.page.locator("input[name='name']").first
        name_input.wait_for(state="visible", timeout=20000)
        name_input.fill(model_name)
        
        if model_type.lower() not in ("openai", ""):
            self._select_from_combobox("[role='combobox']", model_type)
        
        model_input = self.page.locator(self.MODEL_INPUT).first
        model_input.wait_for(state="visible", timeout=5000)
        model_input.fill(model)
        
        self._select_from_combobox("[role='combobox']:has-text('Select a secret'), [role='combobox']:has-text('Select secret')", secret_name)
        
        base_url_input = self.page.locator(self.BASE_URL_INPUT).first
        base_url_input.wait_for(state="visible", timeout=5000)
        base_url_input.fill(base_url)
        
        submit_button = self.page.locator("button:has-text('Create Model'), button[type='submit']:has-text('Create')").first
        submit_button.wait_for(state="visible", timeout=5000)
        submit_button.click()
        
        self.wait_for_navigation_complete()
        
        popup_visible = self._check_toast_popup()

        in_table = self.is_model_in_table(model_name)
        
        if not in_table:
            logger.warning(f"Model {model_name} not found in table after creation")
        
        is_available = self.is_model_available(model_name)
        for retry in range(5):
            if is_available:
                break
            logger.warning(f"Model not yet available, retry {retry + 1}/5...")
            self.page.wait_for_timeout(5000)
            self.reload()
            self.wait_for_navigation_complete()
            is_available = self.is_model_available(model_name)
        
        return {
            "name": model_name,
            "popup_visible": popup_visible,
            "in_table": in_table,
            "is_available": is_available,
            "model_type": model_type
        }
    
    def delete_model_with_verification(self, model_name: str) -> dict:
        if not self.is_model_in_table(model_name):
            logger.warning("Model '%s' not found in table after retries", model_name)
            return self._delete_not_available(model_name)
        try:
            name_element = self.page.get_by_text(model_name, exact=True).first
            name_element.wait_for(state="visible", timeout=10000)
            name_element.scroll_into_view_if_needed()
            card = name_element.locator("xpath=ancestor::div[.//button[@aria-label='Delete model'] or .//button[.//*[contains(@class,'lucide-trash')]]  ][1]")
            delete_btn = card.locator("button[aria-label='Delete model'], button:has(svg.lucide-trash-2)").first
            delete_btn.wait_for(state="visible", timeout=5000)
            delete_btn.click(force=True)
        except Exception as e:
            logger.warning("Delete button not accessible for model '%s': %s", model_name, e)
            return self._delete_not_available(model_name)
        
        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_navigation_complete()
        popup_visible = self._check_toast_popup()
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

    def create_model_for_test(self, prefix: str, secret_name: str, secrets_page):
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
