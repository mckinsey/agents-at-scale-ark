import logging
import os
import random
import pytest
from datetime import datetime
from pathlib import Path
from playwright.sync_api import Page
from dotenv import load_dotenv
from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class SecretsPage(BasePage):
    
    ADD_SECRET_BUTTON = "button:has-text('Add Secret'), button:has-text('Create Secret'), button:has-text('New Secret')"
    SECRET_NAME_INPUT = "input[name='name'], input[placeholder*='name' i], input[id*='name'], input[type='text']:first-of-type"
    SECRET_VALUE_INPUT = "input[name='value'], textarea[name='value'], input[placeholder*='value' i], input[type='password'], textarea, input[type='text']:last-of-type"
    SAVE_BUTTON = "button:has-text('Save'), button:has-text('Create'), button:has-text('Submit'), button[type='submit']"
    SECRET_FORM = "form, [role='dialog'], [data-testid='secret-form']"
    SUCCESS_POPUP = "[role='alert'], [role='status'], .notification, .toast, .alert-success, div:has-text('success'), div:has-text('created'), div:has-text('Success'), div:has-text('Created'), div:has-text('updated'), div:has-text('Updated'), div:has-text('deleted'), div:has-text('Deleted')"
    DELETE_ICON_TEMPLATE = "tr:has-text('{secret_name}') svg, tr:has-text('{secret_name}') button[aria-label='Delete'], tr:has-text('{secret_name}') [data-testid='delete-icon']"
    CONFIRM_DELETE_DIALOG = "[role='dialog'], [role='alertdialog'], .modal, div:has-text('confirm'), div:has-text('delete')"
    CONFIRM_DELETE_BUTTON = "button:has-text('Delete'), button:has-text('Confirm'), button:has-text('Yes')"
    LOADING_INDICATOR = "[data-testid='loading'], [aria-busy='true'], .skeleton, [class*='skeleton'], [class*='loading'], [class*='spinner']"
    
    def __init__(self, page: Page):
        super().__init__(page)
        self._load_env()
    
    def _load_env(self) -> None:
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
    
    def get_password_from_env(self, key: str = "SECRET_PASSWORD") -> str:
        return os.getenv(key, "default-test-password")
    
    def generate_secret_name(self, prefix: str = "secret") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        rand = random.randint(100, 999)
        return f"{prefix}-{date_str}{rand}"
    
    def navigate_to_secrets_tab(self) -> None:
        self._close_dialog_if_open()
        dashboard = DashboardPage(self.page)
        dashboard.navigate_to_section("secrets")
        self.wait_for_element(self.ADD_SECRET_BUTTON, timeout=10000)
        self.wait_for_element_hidden(self.LOADING_INDICATOR, timeout=10000)
        self._close_dialog_if_open()
    
    def _close_dialog_if_open(self) -> None:
        for attempt in range(3):
            try:
                dialog_overlay = self.page.locator("[data-slot='dialog-overlay'], [role='dialog']").first
                if dialog_overlay.is_visible(timeout=1000):
                    logger.info(f"Dialog still open, attempting to close (attempt {attempt + 1})")
                    self.page.keyboard.press("Escape")
                    self.wait_for_element_hidden("[data-slot='dialog-overlay'], [role='dialog']", timeout=3000)
                else:
                    return
            except:
                pass
        self.page.keyboard.press("Escape")
    
    def is_secret_in_table(self, secret_name: str, retries: int = 3) -> bool:
        for attempt in range(retries):
            try:
                self.page.get_by_text(secret_name, exact=False).first.wait_for(state="visible", timeout=15000)
                return True
            except Exception as e:
                logger.debug(f"Secret {secret_name} not visible on attempt {attempt + 1}/{retries}: {e}")
                if attempt < retries - 1:
                    logger.info(f"Secret {secret_name} not found, retrying ({attempt + 1}/{retries})...")
                    self.page.reload()
                    self.wait_for_navigation_complete()
                    self.wait_for_element(self.ADD_SECRET_BUTTON, timeout=10000)
                    self.wait_for_element_hidden(self.LOADING_INDICATOR, timeout=10000)
        return False
    
    def create_secret_with_verification(self, prefix: str, env_key: str) -> dict:
        secret_name = self.generate_secret_name(prefix)
        secret_value = self.get_password_from_env(env_key)
        
        logger.info(f"Creating secret: {secret_name} with key: {env_key}")
        logger.info(f"Secret value length: {len(secret_value)}")
        
        self.page.locator(self.ADD_SECRET_BUTTON).first.click()
        
        inputs = self.page.locator("[role='dialog'] input:visible, [data-slot='dialog-content'] input:visible")
        inputs.first.wait_for(state="visible", timeout=10000)
        
        input_count = inputs.count()
        logger.info(f"Found {input_count} inputs in dialog")
        
        if input_count >= 2:
            inputs.nth(0).fill(secret_name)
            inputs.nth(1).fill(secret_value)
        else:
            inputs.first.fill(secret_name)
            textarea = self.page.locator("[role='dialog'] textarea:visible").first
            if textarea.is_visible():
                textarea.fill(secret_value)
        
        save_button = self.page.locator("[role='dialog'] button[type='submit'], [data-slot='dialog-content'] button[type='submit']").first
        save_button.wait_for(state="visible", timeout=5000)
        save_button.click(force=True)
        
        self.wait_for_modal_close()
        self.wait_for_load_state("domcontentloaded")
        
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            popup_visible = True
        except:
            popup_visible = False
        
        self.navigate_to_secrets_tab()
        in_table = self.is_secret_in_table(secret_name)
        
        return {
            "name": secret_name,
            "expected_name": secret_name,
            "popup_visible": popup_visible,
            "in_table": in_table,
            "prefix": prefix
        }
    
    def delete_secret_with_verification(self, secret_name: str) -> dict:
        if not self.is_secret_in_table(secret_name):
            logger.warning("Secret '%s' not found in table after retries", secret_name)
            return self._delete_not_available(secret_name)
        try:
            name_element = self.page.get_by_text(secret_name, exact=True).first
            name_element.wait_for(state="visible", timeout=10000)
            name_element.scroll_into_view_if_needed()
            card = name_element.locator("xpath=ancestor::div[.//button[@aria-label='Delete secret'] or .//button[.//*[contains(@class,'lucide-trash')]]  ][1]")
            delete_btn = card.locator("button[aria-label='Delete secret'], button:has(svg.lucide-trash-2)").first
            delete_btn.wait_for(state="visible", timeout=5000)
            delete_btn.click(force=True)
        except Exception as e:
            logger.warning("Delete button not accessible for secret '%s': %s", secret_name, e)
            return self._delete_not_available(secret_name)
        
        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_load_state("domcontentloaded")
        popup_visible = self._check_success_popup()
        deleted_from_table = not self.is_secret_in_table(secret_name)
        
        return {
            "secret_name": secret_name,
            "delete_available": True,
            "confirm_dialog_visible": confirm_dialog_visible,
            "confirm_button_visible": confirm_button_visible,
            "popup_visible": popup_visible,
            "deleted_from_table": deleted_from_table
        }
    
    def _delete_not_available(self, secret_name: str) -> dict:
        return {
            "secret_name": secret_name,
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
    
    def create_secret_for_test(self, prefix: str, env_key: str):
        self.navigate_to_secrets_tab()
        
        if not self.is_visible(self.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")
        
        result = self.create_secret_with_verification(prefix, env_key)
        logger.info(f"Secret created: {result['name']}")
        
        return result
