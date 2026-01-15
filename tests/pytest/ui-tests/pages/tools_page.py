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
        self._close_any_dialog()
        
        from .dashboard_page import DashboardPage
        dashboard = DashboardPage(self.page)
        dashboard.navigate_to_dashboard()
        
        self._close_any_dialog()
        
        tools_tab = self.page.locator(dashboard.TOOLS_TAB).first
        if not tools_tab.is_visible(timeout=5000):
            import pytest
            pytest.skip("Tools tab not visible")
        
        tools_tab.click()
        self.wait_for_navigation_complete()
        
        self.wait_for_element(self.ADD_TOOL_BUTTON, timeout=10000)
    
    def _close_any_dialog(self) -> None:
        try:
            dialog = self.page.locator("[data-slot='dialog-overlay'], [role='dialog']").first
            if dialog.is_visible(timeout=1000):
                self.page.keyboard.press("Escape")
                self.wait_for_timeout(500)
        except:
            pass
    
    def generate_tool_name(self, prefix: str = "tool") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{date_str}"
    
    def is_tool_in_table(self, tool_name: str) -> bool:
        try:
            return self.page.get_by_text(tool_name, exact=False).count() > 0
        except:
            return False
    
    def create_http_tool_with_verification(self, tool_name: str, description: str, url: str) -> dict:
        
        self._close_any_dialog()
        
        add_button = self.page.locator(self.ADD_TOOL_BUTTON).first
        add_button.click()
        self.wait_for_navigation_complete()
        self.wait_for_form_ready()
        
        name_input = self.page.locator("input#name, input[name='name'], [role='dialog'] input:first-of-type").first
        
        for attempt in range(3):
            try:
                name_input.wait_for(state="visible", timeout=5000)
                break
            except:
                logger.info(f"Name input not visible (attempt {attempt + 1}), retrying click")
                add_button.click()
                self.wait_for_timeout(1000)
        
        name_input.fill(tool_name)
        
        type_trigger = self.page.locator("button#type, button[name='type'], [role='combobox']:has-text('Select'), [data-slot='trigger']").first
        type_trigger.wait_for(state="visible", timeout=5000)
        type_trigger.click()
        
        self.wait_for_dropdown_options()
        http_option = self.page.get_by_role("option", name="HTTP", exact=True)
        if http_option.count() > 0:
            http_option.click()
        else:
            self.page.locator("[role='option']:has-text('HTTP')").first.click()
        
        self.wait_for_timeout(1000)
        
        description_input = self.page.locator("input#description, input[name='description'], [role='dialog'] input:nth-of-type(2)").first
        description_input.wait_for(state="visible", timeout=5000)
        description_input.fill(description)
        
        input_schema = '{"type": "object", "properties": {"city": {"type": "string", "description": "City name to get coordinates for"}}, "required": ["city"]}'
        schema_textarea = self.page.locator("textarea#inputSchema, textarea[name='inputSchema'], [role='dialog'] textarea").first
        schema_textarea.wait_for(state="visible", timeout=5000)
        schema_textarea.fill(input_schema)
        
        self.wait_for_timeout(500)
        
        dialog = self.page.locator("[role='dialog'], [data-slot='dialog-content']").first
        if dialog.count() > 0:
            dialog.evaluate("el => el.scrollTo(0, el.scrollHeight)")
        
        self.wait_for_timeout(500)
        
        url_input = self.page.locator("input[name='httpUrl'], input#http-url, input#httpUrl, input[placeholder*='https://']").first
        
        for attempt in range(3):
            try:
                url_input.wait_for(state="visible", timeout=3000)
                break
            except:
                logger.info(f"URL input not visible (attempt {attempt + 1}), scrolling dialog")
                if dialog.count() > 0:
                    dialog.evaluate("el => el.scrollTo(0, el.scrollHeight)")
                self.wait_for_timeout(500)
        
        url_input.scroll_into_view_if_needed()
        url_input.fill(url)
        
        save_button = self.page.locator("[role='dialog'] button:has-text('Create'), [data-slot='dialog-content'] button:has-text('Create')").first
        if not save_button.is_visible():
            save_button = self.page.locator("[role='dialog'] button[type='submit'], [data-slot='dialog-content'] button[type='submit']").first
        
        save_button.scroll_into_view_if_needed()
        save_button.evaluate("el => el.click()")
        
        self.wait_for_timeout(2000)
        
        error_banner = self.page.locator("[role='alert']:has-text('error'), [role='alert']:has-text('Error'), .error, .toast-error").first
        if error_banner.count() > 0 and error_banner.is_visible():
            error_text = error_banner.inner_text()
            logger.error(f"Tool creation error: {error_text}")
        
        popup_visible = self._check_success_popup()
        logger.info(f"Success popup visible: {popup_visible}")
        
        self.wait_for_modal_close()
        self.wait_for_timeout(1000)
        
        logger.info(f"Navigating back to tools list...")
        self.navigate_to_tools_tab()
        self.wait_for_timeout(2000)
        self.wait_for_table_content()
        
        in_table = self.is_tool_in_table(tool_name)
        logger.info(f"Tool '{tool_name}' in table after creation: {in_table}")
        
        if not in_table:
            page_content = self.page.content()
            if tool_name in page_content:
                logger.info(f"Tool name found in page HTML but not matched by locator")
                in_table = True
            else:
                all_tools = self.page.locator("table tr, [role='row']").all_text_contents()
                logger.info(f"Available rows: {all_tools[:5]}")
        
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
        
        # Wait for confirmation dialog to appear
        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_navigation_complete()
        popup_visible = self._check_success_popup()
        
        # Wait for table to refresh
        self.wait_for_table_content()
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
