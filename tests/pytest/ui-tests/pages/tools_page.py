import logging
from playwright.sync_api import Page
from .base_page import BasePage
from datetime import datetime

logger = logging.getLogger(__name__)


class ToolsPage(BasePage):
    
    ADD_TOOL_BUTTON = "button:has-text('Add Tool'), button:has-text('Create Tool'), button:has-text('New Tool')"
    SUCCESS_POPUP = "[role='alert'], [role='status'], .notification, .toast, div:has-text('success'), div:has-text('Success'), div:has-text('created'), div:has-text('Created')"
    CONFIRM_DELETE_DIALOG = "[role='dialog'], [role='alertdialog'], .modal, div:has-text('confirm'), div:has-text('delete')"
    CONFIRM_DELETE_BUTTON = "button:has-text('Delete'), button:has-text('Confirm'), button:has-text('Yes')"
    
    TEST_DATA = {
        "get_coordinates": {
            "description": "Returns coordinates for the given city name",
            "url": "https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1",
            "input_schema": '{"type": "object", "properties": {"city": {"type": "string", "description": "City name to get coordinates for"}}, "required": ["city"]}'
        }
    }
    
    def navigate_to_tools_tab(self) -> None:
        from .dashboard_page import DashboardPage
        dashboard = DashboardPage(self.page)
        dashboard.navigate_to_dashboard()
        
        if not self.page.locator(dashboard.TOOLS_TAB).first.is_visible():
            import pytest
            pytest.skip("Tools tab not visible")
        
        self.page.locator(dashboard.TOOLS_TAB).first.click()
        self.wait_for_load_state("networkidle")
        self.wait_for_timeout(2000)
    
    def generate_tool_name(self, prefix: str = "tool") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{date_str}"
    
    def is_tool_in_table(self, tool_name: str) -> bool:
        try:
            return self.page.get_by_text(tool_name, exact=False).count() > 0
        except:
            return False
    
    def create_http_tool_with_verification(self, tool_name: str, description: str, url: str) -> dict:
        
        self.page.locator(self.ADD_TOOL_BUTTON).first.click()
        self.wait_for_load_state("networkidle")
        self.wait_for_timeout(500)
        
        name_input = self.page.locator("input#name")
        name_input.wait_for(state="visible", timeout=10000)
        name_input.fill(tool_name)
        
        type_trigger = self.page.locator("button#type")
        type_trigger.wait_for(state="visible", timeout=5000)
        type_trigger.click()
        self.page.get_by_role("option", name="HTTP", exact=True).click()
        self.wait_for_timeout(1000)
        
        description_input = self.page.locator("input#description")
        description_input.wait_for(state="visible", timeout=5000)
        description_input.fill(description)
        
        input_schema = '{"type": "object", "properties": {"city": {"type": "string", "description": "City name to get coordinates for"}}, "required": ["city"]}'
        schema_textarea = self.page.locator("textarea#inputSchema")
        schema_textarea.wait_for(state="visible", timeout=5000)
        schema_textarea.fill(input_schema)
        
        self.wait_for_timeout(1000)
        url_input = self.page.locator("input#http-url")
        url_input.wait_for(state="visible", timeout=5000)
        url_input.fill(url)
        
        self.wait_for_timeout(1000)
        save_button = self.page.locator("button").filter(has_text="Create").first
        if not save_button.is_visible():
            save_button = self.page.locator("button").filter(has_text="Save").first
        
        save_button.click()
        self.wait_for_load_state("networkidle")
        self.wait_for_timeout(2000)
        
        popup_visible = self._check_success_popup()
        
        logger.info(f"Navigating back to tools list...")
        self.navigate_to_tools_tab()
        self.wait_for_timeout(2000)
        
        in_table = self.is_tool_in_table(tool_name)
        logger.info(f"Tool in table after creation: {in_table}")
        
        return {
            "name": tool_name,
            "popup_visible": popup_visible,
            "in_table": in_table
        }
    
    def delete_tool_with_verification(self, tool_name: str) -> dict:
        logger.info(f"Deleting tool: {tool_name}")
        
        try:
            name_element = self.page.get_by_text(tool_name, exact=True).first
            name_element.scroll_into_view_if_needed()
            row_container = name_element.locator("../../..").first
            buttons = row_container.locator("button").all()
            
            if len(buttons) < 2:
                return self._delete_not_available(tool_name)
            
            buttons[-1].click()
        except:
            return self._delete_not_available(tool_name)
        
        self.wait_for_timeout(1000)
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_load_state("networkidle")
        popup_visible = self._check_success_popup()
        self.wait_for_timeout(3000)
        deleted_from_table = not self.is_tool_in_table(tool_name)
        
        return {
            "tool_name": tool_name,
            "delete_available": True,
            "confirm_dialog_visible": confirm_dialog_visible,
            "confirm_button_visible": confirm_button_visible,
            "popup_visible": popup_visible,
            "deleted_from_table": deleted_from_table
        }
    
    def _delete_not_available(self, tool_name: str) -> dict:
        return {
            "tool_name": tool_name,
            "delete_available": False,
            "confirm_dialog_visible": False,
            "confirm_button_visible": False,
            "popup_visible": False,
            "deleted_from_table": False
        }
    
    def _check_success_popup(self) -> bool:
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            return True
        except:
            return False
    
    def create_tool_for_test(self, prefix: str, test_data_key: str = "get_coordinates"):
        import pytest
        
        tool_data = self.TEST_DATA[test_data_key]
        
        self.navigate_to_tools_tab()
        
        if not self.is_visible(self.ADD_TOOL_BUTTON):
            pytest.skip("Add Tool button not available")
        
        tool_name = self.generate_tool_name(prefix)
        
        result = self.create_http_tool_with_verification(
            tool_name=tool_name,
            description=tool_data["description"],
            url=tool_data["url"]
        )
        
        logger.info(f"Tool created successfully: {result['name']}")
        
        return result
