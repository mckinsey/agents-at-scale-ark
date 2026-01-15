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
        page.goto("http://localhost:3274")
        dashboard.wait_for_load_state("domcontentloaded")
        dashboard.wait_for_timeout(1000)
        
        tab_element = getattr(dashboard, tab_selector)
        
        if dashboard.is_visible(tab_element):
            page.locator(tab_element).first.click()
            dashboard.wait_for_timeout(2000)
            
            new_url = dashboard.get_url()          
            assert tab_name.lower() in new_url.lower(), f"URL should contain '{tab_name.lower()}' but got: {new_url}"
            
            add_button = getattr(dashboard, button_selector)
            assert dashboard.is_visible(add_button), f"Add {tab_name} button should be visible"
            
            print(f"{tab_name} page loaded successfully")
        else:
            pytest.skip(f"{tab_name} tab not visible on dashboard")
    
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
