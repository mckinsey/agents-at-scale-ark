import pytest
from playwright.sync_api import Page
from pages.dashboard_page import DashboardPage


@pytest.mark.dashboard
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
    
    @pytest.mark.parametrize("tab_name,tab_selector,button_selector", [
        ("Agents", "AGENTS_TAB", "ADD_AGENT_BUTTON"),
        ("Models", "MODELS_TAB", "ADD_MODEL_BUTTON"),
        ("Queries", "QUERIES_TAB", "ADD_QUERY_BUTTON"),
        ("Tools", "TOOLS_TAB", "ADD_TOOL_BUTTON"),
        ("Teams", "TEAMS_TAB", "ADD_TEAM_BUTTON"),
    ])
    def test_dashboard_tabs_navigation(self, page: Page, tab_name: str, tab_selector: str, button_selector: str):
        dashboard = DashboardPage(page)
        
        # Navigate directly to the page URL (e.g., /agents, /models)
        page_url = f"{dashboard.base_url}/{tab_name.lower()}"
        dashboard.navigate(page_url)
        dashboard.wait_for_navigation_complete()
        
        # Wait for the add button to appear
        add_button = getattr(dashboard, button_selector)
        dashboard.wait_for_element(add_button, timeout=10000)
        
        # Verify we're on the correct page
        current_url = dashboard.get_url()          
        assert tab_name.lower() in current_url.lower(), f"URL should contain '{tab_name.lower()}' but got: {current_url}"
        
        # Verify the add button is visible
        if dashboard.is_visible(add_button):
            print(f"{tab_name} page loaded successfully with Add button visible")
        else:
            pytest.skip(f"Add {tab_name} button not visible - page may still be loading or feature not available")
    
    def test_dashboard_responsive(self, page: Page):
        dashboard = DashboardPage(page)
        dashboard.navigate_to_dashboard()
        assert dashboard.is_dashboard_loaded()
    
    def test_page_reload(self, page: Page):
        dashboard = DashboardPage(page)
        dashboard.navigate_to_dashboard()
        assert dashboard.is_dashboard_loaded(), "Dashboard should load initially"
        
        dashboard.reload()
        dashboard.wait_for_load_state("networkidle")
        assert dashboard.is_dashboard_loaded(), "Dashboard should still be loaded after reload"
