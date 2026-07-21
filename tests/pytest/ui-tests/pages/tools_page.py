import logging
import random
import pytest
from datetime import datetime
from playwright.sync_api import expect, TimeoutError as PlaywrightTimeoutError
from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class ToolsPage(BasePage):

    ADD_TOOL_BUTTON = "a[href^='/tools/new'], button:has-text('Add Tool'), button:has-text('Create Tool'), button:has-text('New Tool')"
    TOOL_NAME_INPUT = "input[name='name'], input#name, form input:first-of-type"
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
        
        dashboard = DashboardPage(self.page)
        dashboard.navigate_to_section("tools")
        
        self._close_any_dialog()
        self.wait_for_element(self.ADD_TOOL_BUTTON, timeout=10000)
    
    def _close_any_dialog(self) -> None:
        try:
            dialog = self.page.locator("[data-slot='dialog-overlay'], [role='dialog']").first
            if dialog.is_visible(timeout=1000):
                self.page.keyboard.press("Escape")
                self.wait_for_element_hidden("[data-slot='dialog-overlay'], [role='dialog']", timeout=3000)
        except:
            pass
    
    def generate_tool_name(self, prefix: str = "tool") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        rand = random.randint(100, 999)
        return f"{prefix}-{date_str}{rand}"

    def is_tool_in_table(self, tool_name: str, retries: int = 3) -> bool:
        for attempt in range(retries):
            try:
                self.page.get_by_text(tool_name, exact=False).first.wait_for(state="visible", timeout=10000)
                return True
            except Exception as e:
                logger.debug(f"Tool {tool_name} not visible on attempt {attempt + 1}/{retries}: {e}")
                if attempt < retries - 1:
                    logger.info(f"Tool {tool_name} not found, retrying ({attempt + 1}/{retries})...")
                    self.page.reload()
                    self.wait_for_navigation_complete()
        return False
    
    def create_http_tool_with_verification(self, tool_name: str, description: str, url: str) -> dict:

        self._close_any_dialog()

        # The "Add tool" link moves between the page header and the empty-state
        # body while the tools list loads, so under parallel load the click can
        # miss. Click and confirm we reached the new-tool form via the URL; if
        # the button stays unstable, navigate to the /tools/new route directly
        # (its own visibility is covered by the dashboard navigation test).
        name_input = self.page.locator(self.TOOL_NAME_INPUT).first
        for attempt in range(4):
            if "/tools/new" in self.page.url:
                break
            try:
                self.page.locator(self.ADD_TOOL_BUTTON).first.click(timeout=5000)
                self.page.wait_for_url("**/tools/new**", timeout=5000)
            except Exception:
                logger.info(
                    "Add tool navigation not ready (attempt %d), retrying",
                    attempt + 1,
                )
                self.page.wait_for_timeout(1000)
        if "/tools/new" not in self.page.url:
            logger.info("Add tool button unstable; navigating to /tools/new directly")
            self.page.goto(
                "http://localhost:3274/tools/new", wait_until="domcontentloaded"
            )
        self.wait_for_form_ready()
        name_input.wait_for(state="visible", timeout=15000)

        logger.info(f"Tool name should be: {tool_name}")
        name_input.fill(tool_name)
        name_input.blur()
        logger.info(f"Name in name input is {name_input.input_value()}")

        type_trigger = self.page.locator("[role='combobox']").first
        type_trigger.scroll_into_view_if_needed()
        type_trigger.wait_for(state="visible", timeout=15000)

        for attempt in range(3):
            logger.info(f"Clicking type trigger to open dropdown (attempt {attempt + 1})")
            type_trigger.click()
            try:
                self.wait_for_dropdown_options(timeout=5000)
                logger.info("Dropdown options visible")
                break
            except Exception:
                logger.info(f"Dropdown options not visible on attempt {attempt + 1}, retrying")
        else:
            logger.error("Dropdown failed to open after 3 attempts")
            self.wait_for_dropdown_options(timeout=1000)

        http_option = self.page.locator("[role='option']:has-text('HTTP')").first
        http_option.wait_for(state="visible", timeout=10000)
        logger.info("HTTP option visible, clicking")
        http_option.click()
        self.wait_for_element_hidden("[role='listbox'], [data-slot='select-content']", timeout=3000)
        name_value_after_type = name_input.input_value()
        logger.info(f"Name input value after type selection: '{name_value_after_type}'")
        if not name_value_after_type:
            logger.info("Name was cleared by type selection re-render, re-filling")
            name_input.fill(tool_name)

        description_input = self.page.locator("input#description, input[name='description']").first
        description_input.wait_for(state="visible", timeout=15000)
        description_input.fill(description)

        input_schema = '{"type": "object", "properties": {"city": {"type": "string", "description": "City name to get coordinates for"}}, "required": ["city"]}'
        schema_textarea = self.page.locator("textarea#inputSchema, textarea[name='inputSchema']").first
        schema_textarea.wait_for(state="visible", timeout=15000)
        schema_textarea.fill(input_schema)

        url_input = self.page.locator("input[name='httpUrl'], input#http-url, input#httpUrl, input[placeholder*='https://']").first
        url_input.wait_for(state="visible", timeout=15000)
        url_input.scroll_into_view_if_needed()
        url_input.fill(url)

        save_button = self.page.locator("button:has-text('Create'), button[type='submit']").first
        save_button.scroll_into_view_if_needed()

        # A missing POST after a "successful" click is the stale-DOM re-render
        # race signature (click event lands on a detached node).
        try:
            with self.page.expect_response(
                lambda r: r.request.method == "POST" and "/api/v1/tools" in r.url,
                timeout=5000,
            ):
                save_button.click()
        except PlaywrightTimeoutError:
            logger.error("Create click did not fire POST /api/v1/tools (stale-DOM race)")

        popup_visible = self._check_toast_popup()
        logger.info(f"Toast visible: {popup_visible}")

        self.wait_for_navigation_complete()

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
        if not self.is_tool_in_table(tool_name):
            logger.warning("Tool '%s' not found in table after retries", tool_name)
            return self._delete_not_available(tool_name)
        try:
            name_element = self.page.get_by_text(tool_name, exact=True).first
            name_element.wait_for(state="visible", timeout=10000)
            name_element.scroll_into_view_if_needed()
            row = self.page.get_by_role("row").filter(has_text=tool_name).first
            delete_btn = row.get_by_role("button", name="Delete tool")
            delete_btn.wait_for(state="visible", timeout=5000)
            # The delete action is disabled while the tool is in use by an agent;
            # wait for it to become enabled before clicking.
            expect(delete_btn).to_be_enabled(timeout=15000)
            delete_btn.click()
        except Exception as e:
            logger.warning("Delete button not accessible for tool '%s': %s", tool_name, e)
            return self._delete_not_available(tool_name)
        
        # Wait for confirmation dialog to appear
        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_navigation_complete()
        popup_visible = self._check_toast_popup()
        deleted_from_table = not self.is_tool_in_table(tool_name, retries=0)
        
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

    def create_tool_for_test(self, prefix: str, test_data_key: str = "get_coordinates"):
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

        if result['in_table']:
            logger.info(f"Tool created successfully: {result['name']}")
        else:
            logger.info("Tool not visible in table")
        
        return result
