from playwright.sync_api import Page
import logging

logger = logging.getLogger(__name__)


class BasePage:
    
    def __init__(self, page: Page):
        self.page = page
    
    def navigate(self, url: str) -> None:
        self.page.goto(url)
    
    def is_visible(self, selector: str, timeout: int = 5000) -> bool:
        return self.page.is_visible(selector)
    
    def wait_for_load_state(self, state: str = "load") -> None:
        self.page.wait_for_load_state(state)
    
    def reload(self) -> None:
        self.page.reload()
    
    def wait_for_element(self, selector: str, state: str = "visible", timeout: int = 10000) -> bool:
        """Wait for element to reach specified state (visible, hidden, attached, detached)"""
        try:
            self.page.locator(selector).first.wait_for(state=state, timeout=timeout)
            return True
        except Exception:
            return False
    
    def wait_for_element_hidden(self, selector: str, timeout: int = 10000) -> bool:
        """Wait for element to disappear"""
        try:
            self.page.locator(selector).first.wait_for(state="hidden", timeout=timeout)
            return True
        except Exception:
            return False
    
    def wait_for_navigation_complete(self, timeout: int = 10000) -> None:
        """Wait for page navigation to complete"""
        self.page.wait_for_load_state("networkidle", timeout=timeout)
    
    def wait_for_table_content(self, timeout: int = 10000) -> bool:
        """Wait for table content to load"""
        try:
            # Wait for common table elements
            table_selectors = ["table", "[role='table']", "[role='grid']", "tbody", ".table"]
            for selector in table_selectors:
                if self.page.locator(selector).count() > 0:
                    self.page.locator(selector).first.wait_for(state="visible", timeout=timeout)
                    return True
            # Fallback: wait for any row-like content
            self.page.locator("tr, [role='row']").first.wait_for(state="visible", timeout=timeout)
            return True
        except Exception:
            return False
    
    def wait_for_modal_open(self, timeout: int = 10000) -> bool:
        """Wait for modal/dialog to open"""
        try:
            modal_selectors = ["[role='dialog']", "[role='alertdialog']", ".modal", "[data-state='open']"]
            for selector in modal_selectors:
                if self.page.locator(selector).count() > 0:
                    self.page.locator(selector).first.wait_for(state="visible", timeout=timeout)
                    return True
            return False
        except Exception:
            return False
    
    def wait_for_modal_close(self, timeout: int = 10000) -> bool:
        """Wait for modal/dialog to close"""
        try:
            modal_selectors = ["[role='dialog']", "[role='alertdialog']", ".modal", "[data-state='open']"]
            for selector in modal_selectors:
                locator = self.page.locator(selector)
                if locator.count() > 0:
                    locator.first.wait_for(state="hidden", timeout=timeout)
            return True
        except Exception:
            return False
    
    def wait_for_form_ready(self, timeout: int = 10000) -> bool:
        """Wait for form inputs to be ready"""
        try:
            # Wait for any input or form element to be visible
            self.page.locator("input, textarea, select, [role='combobox']").first.wait_for(state="visible", timeout=timeout)
            return True
        except Exception:
            return False
    
    def wait_for_dropdown_options(self, timeout: int = 10000) -> bool:
        """Wait for dropdown options to appear"""
        try:
            self.page.locator("[role='option'], [role='listbox'] > *, .dropdown-item, option").first.wait_for(state="visible", timeout=timeout)
            return True
        except Exception:
            return False
    
    def wait_for_button_enabled(self, selector: str, timeout: int = 10000) -> bool:
        """Wait for button to be enabled"""
        try:
            button = self.page.locator(selector).first
            button.wait_for(state="visible", timeout=timeout)
            # Wait until not disabled
            self.page.wait_for_function(
                f"document.querySelector('{selector}')?.disabled === false",
                timeout=timeout
            )
            return True
        except Exception:
            return False
    
    def click(self, selector: str) -> None:
        self.page.locator(selector).first.click()
    
    def get_url(self) -> str:
        return self.page.url
    
    def get_page_title(self) -> str:
        return self.page.title()