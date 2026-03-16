from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError
from .base_page import BasePage
import logging

logger = logging.getLogger(__name__)


class DashboardPage(BasePage):
    
    NAV_MENU = "nav[role='navigation'], nav.navbar, header nav"
    DASHBOARD_TITLE = "h1, h2, [data-testid='dashboard-title']"
    AGENTS_TAB = "a[href='/agents']"
    MODELS_TAB = "a[href='/models']"
    QUERIES_TAB = "a[href='/queries']"
    TOOLS_TAB = "a[href='/tools']"
    TEAMS_TAB = "a[href='/teams']"
    SECRETS_TAB = "a[href='/secrets']"
    MAIN_CONTENT = "main[data-slot='sidebar-inset']"
    SIDEBAR = "[data-testid='sidebar'], aside, nav"
    AGENT_BUILDER_TOGGLE = "button:has-text('Agent Builder')"
    
    ADD_AGENT_BUTTON = "a[href='/agents/new']:has-text('Create Agent')"
    ADD_MODEL_BUTTON = "button:has-text('Add Model'), button:has-text('Create Model'), a:has-text('Add Model')"
    ADD_QUERY_BUTTON = "button:has-text('Add Query'), button:has-text('Create Query'), a:has-text('Add Query')"
    ADD_TOOL_BUTTON = "button:has-text('Add Tool'), button:has-text('Create Tool'), a:has-text('Add Tool')"
    ADD_TEAM_BUTTON = "button:has-text('Add Team'), button:has-text('Create Team'), a:has-text('Add Team')"
    ADD_SECRET_BUTTON = "button:has-text('Add Secret'), button:has-text('Create Secret'), a:has-text('Add Secret')"
    
    def __init__(self, page: Page):
        super().__init__(page)
        self.base_url = "http://localhost:3274"
    
    def navigate_to_dashboard(self) -> None:
        if self.base_url not in self.page.url:
            self.page.goto(self.base_url)
        self.wait_for_load_state("domcontentloaded")
        self.wait_for_element(self.MAIN_CONTENT)
    
    def navigate_to_section(self, section: str) -> None:
        self.page.goto(f"{self.base_url}/{section}")
        self.wait_for_load_state("domcontentloaded")
    
    def expand_agent_builder(self) -> None:
        try:
            toggle = self.page.locator(self.AGENT_BUILDER_TOGGLE).first
            toggle.wait_for(state="visible", timeout=5000)
            agents_link = self.page.locator("a[href='/agents']").first
            if not agents_link.is_visible(timeout=1000):
                toggle.click()
                agents_link.wait_for(state="visible", timeout=5000)
        except Exception:
            pass
    
    def is_dashboard_loaded(self) -> bool:
        try:
            self.page.locator(self.MAIN_CONTENT).first.wait_for(state="visible", timeout=15000)
            return True
        except Exception:
            return False
    
    def get_dashboard_title(self) -> str:
        try:
            return self.page.locator(self.DASHBOARD_TITLE).first.inner_text()
        except Exception as e:
            logger.debug("Could not get dashboard title: %s", e)
            return ""
