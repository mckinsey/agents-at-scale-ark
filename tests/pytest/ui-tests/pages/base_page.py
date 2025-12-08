from playwright.sync_api import Page


class BasePage:
    
    def __init__(self, page: Page):
        self.page = page
    
    def navigate(self, url: str) -> None:
        self.page.goto(url)
    
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
        self.wait_for_timeout(1000)
    
    def wait_for_form_ready(self, timeout: int = 10000) -> None:
        try:
            self.page.locator("[role='dialog'] input:visible, [data-slot='dialog-content'] input:visible, form input:visible, input:visible").first.wait_for(state="visible", timeout=timeout)
        except:
            self.wait_for_timeout(2000)    
    def wait_for_element(self, selector: str, state: str = "visible", timeout: int = 10000):
        locator = self.page.locator(selector).first
        locator.wait_for(state=state, timeout=timeout)
        return locator
    
    def wait_for_element_hidden(self, selector: str, timeout: int = 10000) -> None:
        try:
            self.page.locator(selector).first.wait_for(state="hidden", timeout=timeout)
        except:
            pass
    
    def wait_for_table_content(self, timeout: int = 15000) -> None:
        try:
            self.page.locator("table, [role='grid'], .data-table, tbody tr, div[class*='table']").first.wait_for(state="visible", timeout=timeout)
        except:
            self.wait_for_timeout(2000)
    
    def wait_for_dropdown_options(self, timeout: int = 5000) -> None:
        try:
            self.page.locator("[role='option'], [role='listbox'], [data-slot='select-content']").first.wait_for(state="visible", timeout=timeout)
        except:
            self.wait_for_timeout(1000)
    
    def wait_for_modal_open(self, timeout: int = 10000) -> None:
        try:
            self.page.locator("[data-slot='dialog-overlay'], [role='dialog'], [data-slot='dialog-content']").first.wait_for(state="visible", timeout=timeout)
        except:
            self.wait_for_timeout(1000)
    
    def wait_for_modal_close(self, timeout: int = 10000) -> None:
        try:
            self.page.locator("[data-slot='dialog-overlay'], [role='dialog']").first.wait_for(state="hidden", timeout=timeout)
        except:
            self.page.keyboard.press("Escape")
            self.wait_for_timeout(1000)
    
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