from playwright.sync_api import Page
from .base_page import BasePage


class DashboardPage(BasePage):
    
    NAV_MENU = "nav[role='navigation'], nav.navbar, header nav"
    DASHBOARD_TITLE = "h1, h2, [data-testid='dashboard-title']"
    AGENTS_TAB = "text='Agents'"
    MODELS_TAB = "text='Models'"
    QUERIES_TAB = "text='Queries'"
    TOOLS_TAB = "text='Tools'"
    TEAMS_TAB = "text='Teams'"
    SECRETS_TAB = "text='Secrets'"
    MAIN_CONTENT = "main, [role='main'], body"
    SIDEBAR = "[data-testid='sidebar'], aside, nav"
    
    ADD_AGENT_BUTTON = "button:has-text('Add Agent'), button:has-text('Create Agent'), a:has-text('Add Agent')"
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
        self.wait_for_timeout(1000)
    
    def is_dashboard_loaded(self) -> bool:
        try:
            return self.page.locator(self.MAIN_CONTENT).first.is_visible(timeout=5000)
        except:
            return False
    
    def get_dashboard_title(self) -> str:
        try:
            return self.page.locator(self.DASHBOARD_TITLE).first.inner_text()
        except:
            return ""

