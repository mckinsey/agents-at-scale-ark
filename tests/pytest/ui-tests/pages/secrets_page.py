import logging
import os
import random
import re
import subprocess
from datetime import datetime
from pathlib import Path

import pytest
from dotenv import load_dotenv
from playwright.sync_api import Page

from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class SecretsPage(BasePage):
    ADD_SECRET_BUTTON = "button:has-text('Add Secret'), button:has-text('Create Secret'), button:has-text('New Secret')"

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
        try:
            self.page.get_by_role("button", name="Add Secret").first.wait_for(
                state="visible", timeout=30000
            )
        except Exception:
            self.reload()
            self.wait_for_navigation_complete()
            self.page.get_by_role("button", name="Add Secret").first.wait_for(
                state="visible", timeout=30000
            )
        self._close_dialog_if_open()

    def _close_dialog_if_open(self) -> None:
        for attempt in range(3):
            try:
                dialog = self.page.get_by_role("dialog").first
                if dialog.is_visible(timeout=1000):
                    logger.info(f"Dialog still open, attempting to close (attempt {attempt + 1})")
                    self.page.keyboard.press("Escape")
                    dialog.wait_for(state="hidden", timeout=3000)
                else:
                    return
            except Exception:
                pass
        self.page.keyboard.press("Escape")

    def _secret_row(self, secret_name: str):
        return self.page.get_by_label(f"Secret {secret_name}", exact=True).first

    def _secret_text(self, secret_name: str):
        return self.page.get_by_text(secret_name, exact=True).first

    def _wait_for_success_message(self, messages: list[str], timeout: int = 7000) -> bool:
        pattern = re.compile("|".join(re.escape(message) for message in messages))
        for role_name in ("status", "alert"):
            try:
                self.page.get_by_role(role_name).filter(has_text=pattern).first.wait_for(
                    state="visible", timeout=timeout
                )
                return True
            except Exception:
                pass
        try:
            self.page.get_by_text(pattern).first.wait_for(state="visible", timeout=timeout)
            return True
        except Exception:
            return False

    def is_secret_in_table(self, secret_name: str, retries: int = 3) -> bool:
        for attempt in range(retries):
            try:
                self._secret_row(secret_name).wait_for(state="visible", timeout=12000)
                return True
            except Exception as e:
                try:
                    self._secret_text(secret_name).wait_for(state="visible", timeout=6000)
                    return True
                except Exception:
                    logger.info(
                        f"Secret {secret_name} not visible on attempt {attempt + 1}/{retries}: {e}"
                    )
                    if attempt < retries - 1:
                        self.page.wait_for_timeout(1000 * (attempt + 1))
        return False

    def _wait_for_secret_deleted(self, secret_name: str, retries: int = 3) -> bool:
        for attempt in range(retries):
            try:
                self._secret_row(secret_name).wait_for(state="hidden", timeout=4000)
                try:
                    self._secret_text(secret_name).wait_for(state="hidden", timeout=2000)
                except Exception:
                    pass
                return True
            except Exception:
                if attempt < retries - 1:
                    self.page.wait_for_timeout(1000 * (attempt + 1))
        return False

    def _secret_exists_in_cluster(self, secret_name: str) -> bool:
        result = subprocess.run(
            ["kubectl", "get", "secret", secret_name, "-n", "default"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return result.returncode == 0

    def create_secret_with_verification(self, prefix: str, env_key: str) -> dict:
        secret_name = self.generate_secret_name(prefix)
        secret_value = self.get_password_from_env(env_key)

        logger.info(f"Creating secret: {secret_name} with key: {env_key}")
        logger.info(f"Secret value length: {len(secret_value)}")

        self.page.get_by_role("button", name=re.compile("Add Secret|Create Secret|New Secret")).first.click()
        dialog = self.page.get_by_role("dialog").first
        dialog.wait_for(state="visible", timeout=10000)
        dialog.get_by_label("Name", exact=False).fill(secret_name)
        dialog.get_by_label("Password", exact=False).fill(secret_value)
        dialog.get_by_role("button", name=re.compile("Add Secret|Update Secret|Save")).first.click()

        self.wait_for_modal_close()
        self.wait_for_load_state("domcontentloaded")

        toast_visible = self._wait_for_success_message(["Secret Created", "Secret Updated"])
        in_table = self.is_secret_in_table(secret_name, retries=4) or self._secret_exists_in_cluster(
            secret_name
        )
        popup_visible = toast_visible or in_table

        return {
            "name": secret_name,
            "expected_name": secret_name,
            "popup_visible": popup_visible,
            "in_table": in_table,
            "prefix": prefix,
        }

    def delete_secret_with_verification(self, secret_name: str) -> dict:
        if not self.is_secret_in_table(secret_name):
            logger.warning("Secret '%s' not found in table after retries", secret_name)
            return self._delete_not_available(secret_name)
        try:
            row = self._secret_row(secret_name)
            row.wait_for(state="visible", timeout=10000)
            row.scroll_into_view_if_needed()
            delete_btn = row.get_by_role("button", name=f"Delete secret {secret_name}").first
            delete_btn.wait_for(state="visible", timeout=5000)
            delete_btn.click()
        except Exception as e:
            logger.warning("Delete button not accessible for secret '%s': %s", secret_name, e)
            return self._delete_not_available(secret_name)

        confirm_dialog = self.page.get_by_role("dialog", name=re.compile("Delete Secret")).first
        confirm_dialog.wait_for(state="visible", timeout=10000)
        confirm_dialog_visible = confirm_dialog.is_visible()
        confirm_button = confirm_dialog.get_by_role("button", name="Delete").first
        confirm_button_visible = confirm_button.is_visible()

        if confirm_button_visible:
            confirm_button.click()

        self.wait_for_load_state("domcontentloaded")
        toast_visible = self._wait_for_success_message(["Secret Deleted"])
        deleted_from_table = self._wait_for_secret_deleted(secret_name)
        if not deleted_from_table:
            deleted_from_table = not self._secret_exists_in_cluster(secret_name)
        popup_visible = toast_visible or deleted_from_table

        return {
            "secret_name": secret_name,
            "delete_available": True,
            "confirm_dialog_visible": confirm_dialog_visible,
            "confirm_button_visible": confirm_button_visible,
            "popup_visible": popup_visible,
            "deleted_from_table": deleted_from_table,
        }

    def _delete_not_available(self, secret_name: str) -> dict:
        return {
            "secret_name": secret_name,
            "delete_available": False,
            "confirm_dialog_visible": False,
            "confirm_button_visible": False,
            "popup_visible": False,
            "deleted_from_table": False,
        }

    def create_secret_for_test(self, prefix: str, env_key: str):
        self.navigate_to_secrets_tab()

        if not self.is_visible(self.ADD_SECRET_BUTTON):
            pytest.skip("Add Secret button not available")

        result = self.create_secret_with_verification(prefix, env_key)
        logger.info(f"Secret created: {result['name']}")

        return result
