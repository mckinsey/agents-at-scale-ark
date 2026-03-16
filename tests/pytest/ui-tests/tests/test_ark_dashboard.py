import pytest
from playwright.sync_api import Page
from pages.dashboard_page import DashboardPage


@pytest.mark.dashboard
@pytest.mark.xdist_group("ark_dashboard")
class TestArkDashboard:
    
    def test_ark_dashboard_loads(self, page: Page):
        dashboard = DashboardPage(page)
        dashboard.navigate_to_dashboard()
        
        assert dashboard.is_dashboard_loaded(), "Dashboard did not load properly"
        
        assert any([
           dashboard.is_visible(dashboard.NAV_MENU), 
           dashboard.is_visible(dashboard.MAIN_CONTENT)
        ]), "Neither navigation nor main content is visible"
    
    def test_dashboard_title_present(self, page: Page):
        dashboard = DashboardPage(page)
        dashboard.navigate_to_dashboard()
        
        title = dashboard.get_page_title()
        assert title is not None and len(title) > 0, "Dashboard should have a title"
    
    @pytest.mark.parametrize("tab_name,button_selector", [
        ("agents", "ADD_AGENT_BUTTON"),
        ("models", "ADD_MODEL_BUTTON"),
        ("queries", "ADD_QUERY_BUTTON"),
        ("tools", "ADD_TOOL_BUTTON"),
        ("teams", "ADD_TEAM_BUTTON"),
    ])
    def test_dashboard_tabs_navigation(self, page: Page, tab_name: str, button_selector: str):
        dashboard = DashboardPage(page)
        dashboard.navigate_to_section(tab_name)
        
        new_url = dashboard.get_url()
        assert tab_name in new_url.lower(), f"URL should contain '{tab_name}' but got: {new_url}"
        
        add_button = getattr(dashboard, button_selector)
        assert dashboard.is_visible(add_button, timeout=10000), f"Add {tab_name} button should be visible"
        
        print(f"{tab_name} page loaded successfully")
    
    def test_dashboard_responsive(self, page: Page):
        dashboard = DashboardPage(page)
        dashboard.navigate_to_dashboard()
        assert dashboard.is_dashboard_loaded()
    
    def test_page_reload(self, page: Page):
        dashboard = DashboardPage(page)
        dashboard.navigate_to_dashboard()
        assert dashboard.is_dashboard_loaded(), "Dashboard should load initially"
        
        dashboard.reload()
        dashboard.wait_for_load_state("domcontentloaded")
        assert dashboard.is_dashboard_loaded(), "Dashboard should still be loaded after reload"
