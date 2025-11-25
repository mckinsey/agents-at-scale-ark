from playwright.sync_api import Page


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
    
    def wait_for_timeout(self, milliseconds: int) -> None:
        self.page.wait_for_timeout(milliseconds)
