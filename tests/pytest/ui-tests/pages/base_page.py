import logging

from playwright.sync_api import Page, TimeoutError


logger = logging.getLogger(__name__)


class BasePage:

    POPUP = "[data-sonner-toast]"

    def __init__(self, page: Page):
        self.page = page
    
    def navigate(self, url: str) -> None:
        self.page.goto(url)

    def _check_toast_popup(self, timeout: int = 5000) -> bool:
        # Note: This does not confirm whether the toast shows success, only waits to see it
        # and logs what it contains.
        try:
            popup_locator = self.page.locator(self.POPUP).first
            popup_locator.wait_for(state="visible", timeout=timeout)
            logger.info(popup_locator.inner_text())
            return True
        except TimeoutError:
            # we don't necessarily want to break if we don't see the popup, but we should at least log it
            logger.exception("Did not see expected toast")
            return False

    def is_visible(self, selector: str, timeout: int = 5000) -> bool:
        try:
            self.page.locator(selector).first.wait_for(state="visible", timeout=timeout)
            return True
        except:
            return False
    
    def wait_for_load_state(self, state: str = "load") -> None:
        self.page.wait_for_load_state(state)
    
    def wait_for_navigation_complete(self, timeout: int = 30000) -> None:
        self.page.wait_for_load_state("domcontentloaded", timeout=timeout)
    
    def wait_for_form_ready(self, timeout: int = 10000) -> None:
        self.page.locator("[role='dialog'] input:visible, [data-slot='dialog-content'] input:visible, form input:visible, input:visible").first.wait_for(state="visible", timeout=timeout)
    
    def wait_for_element(self, selector: str, state: str = "visible", timeout: int = 10000):
        locator = self.page.locator(selector).first
        locator.wait_for(state=state, timeout=timeout)
        return locator
    
    def wait_for_element_hidden(self, selector: str, timeout: int = 10000) -> None:
        try:
            self.page.locator(selector).first.wait_for(state="hidden", timeout=timeout)
        except Exception as e:
            logger.info(f"Selector {selector} not hidden: {e}")
    
    def wait_for_dropdown_options(self, timeout: int = 5000) -> None:
        self.page.locator("[role='option'], [role='listbox'], [data-slot='select-content']").first.wait_for(state="visible", timeout=timeout)
    
    def wait_for_modal_open(self, timeout: int = 10000) -> None:
        self.page.locator("[data-slot='dialog-overlay'], [role='dialog'], [data-slot='dialog-content']").first.wait_for(state="visible", timeout=timeout)
    
    def wait_for_modal_close(self, timeout: int = 10000) -> None:
        try:
            self.page.locator("[data-slot='dialog-overlay'], [role='dialog']").first.wait_for(state="hidden", timeout=timeout)
        except:
            logger.info("Modal did not close")
            self.page.keyboard.press("Escape")
            self.wait_for_element_hidden("[data-slot='dialog-overlay'], [role='dialog']")
    
    def reload(self) -> None:
        self.page.reload()
    
    def wait_for_timeout(self, milliseconds: int) -> None:
        self.page.wait_for_timeout(milliseconds)
    
    def get_url(self) -> str:
        return self.page.url
    
    def get_page_title(self) -> str:
        return self.page.title()
    
    def click(self, selector: str) -> None:
        self.page.locator(selector).first.click()
