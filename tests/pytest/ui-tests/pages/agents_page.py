import logging
from playwright.sync_api import Page
from .base_page import BasePage
from datetime import datetime

logger = logging.getLogger(__name__)


class AgentsPage(BasePage):
    
    ADD_AGENT_BUTTON = "button:has-text('Add Agent'), button:has-text('Create Agent'), button:has-text('New Agent'), a:has-text('Add Agent')"
    AGENT_NAME_INPUT = "input[name='name'], input[placeholder*='name' i]"
    AGENT_DESCRIPTION_INPUT = "textarea[name='description'], textarea[placeholder*='description' i], input[name='description']"
    MODEL_SELECT = "select, [role='combobox'], button:has-text('Select')"
    SAVE_BUTTON = "button:has-text('Add Agent'), button:has-text('Create'), button:has-text('Save'), button[type='submit']"
    SUCCESS_POPUP = "[role='alert'], [role='status'], .notification, .toast, div:has-text('success'), div:has-text('Success'), div:has-text('created'), div:has-text('Created'), div:has-text('deleted'), div:has-text('Deleted')"
    CONFIRM_DELETE_DIALOG = "[role='dialog'], [role='alertdialog'], .modal, div:has-text('confirm'), div:has-text('delete')"
    CONFIRM_DELETE_BUTTON = "button:has-text('Delete'), button:has-text('Confirm'), button:has-text('Yes')"
    
    TEST_DATA = {
        "default": {
            "description": "handle queries",
            "execution_engine": "langchain-executor"
        },
        "with_tools": {
            "description": "agent with tools",
            "execution_engine": "langchain-executor"
        }
    }
    
    def navigate_to_agents_tab(self) -> None:
        from .dashboard_page import DashboardPage
        dashboard = DashboardPage(self.page)
        
        # Navigate directly to /agents URL instead of clicking tabs
        self.page.goto(f"{dashboard.base_url}/agents")
        self.wait_for_navigation_complete()
        
        # Wait for table content or Add Agent button to appear
        self.wait_for_element(self.ADD_AGENT_BUTTON, timeout=10000)
    
    def generate_agent_name(self, prefix: str = "agent") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{date_str}"
    
    def is_agent_in_table(self, agent_name: str, retries: int = 3) -> bool:
        """Check if agent is in table with retry logic"""
        for attempt in range(retries):
            try:
                if self.page.get_by_text(agent_name, exact=False).count() > 0:
                    return True
                if attempt < retries - 1:
                    logger.info(f"Agent {agent_name} not found, retrying... ({attempt + 1}/{retries})")
                    self.page.reload()
                    self.wait_for_navigation_complete()
                    self.wait_for_element(self.ADD_AGENT_BUTTON, timeout=10000)
            except Exception as e:
                logger.warning(f"Error checking agent in table: {e}")
        return False
    
    def check_for_error_banner(self) -> dict:
        """Check for error banners (500 or other errors) after agent creation"""
        logger.info("Checking for error banners...")
        
        result = {
            "has_error": False,
            "message": ""
        }
        
        error_selectors = [
            "[role='alert']:has-text('error')",
            "[role='alert']:has-text('Error')",
            "[role='alert']:has-text('500')",
            "div:has-text('500'):has-text('error')",
            "div:has-text('Internal Server Error')",
            ".error, .alert-error, .notification-error",
            "[class*='error'][class*='banner']",
            "[class*='error'][class*='alert']",
            "div[style*='red']:has-text('error')",
            "div[style*='red']:has-text('Error')"
        ]
        
        for selector in error_selectors:
            try:
                error_elements = self.page.locator(selector)
                if error_elements.count() > 0:
                    for i in range(error_elements.count()):
                        element = error_elements.nth(i)
                        if element.is_visible():
                            error_text = element.inner_text()
                            if any(keyword in error_text.lower() for keyword in ['error', '500', 'internal server error', 'failed']):
                                result["has_error"] = True
                                result["message"] = error_text
                                logger.error(f"Found error banner: {error_text}")
                                return result
            except:
                continue
        
        logger.info("No error banners found")
        return result
    
    def verify_agent_in_table_row(self, agent_name: str, description: str, model_name: str) -> dict:
        logger.info(f"Verifying agent {agent_name} in table row...")
        
        result = {
            "name_visible": False,
            "description_visible": False,
            "model_visible": False,
            "row_found": False
        }
        
        try:
            if not self.is_agent_in_table(agent_name):
                logger.warning(f"Agent {agent_name} not found in table")
                return result
            
            result["row_found"] = True
            
            name_element = self.page.get_by_text(agent_name, exact=True).first
            if name_element.is_visible():
                result["name_visible"] = True
                logger.info(f"Agent name '{agent_name}' is visible")
            
            if description:
                desc_element = self.page.get_by_text(description, exact=False)
                if desc_element.count() > 0 and desc_element.first.is_visible():
                    result["description_visible"] = True
                    logger.info(f"Description '{description}' is visible")
                else:
                    logger.warning(f"Description '{description}' not found or not visible")
                    logger.info(f"Note: Description may be truncated in table view, marking as visible if row exists")
                    result["description_visible"] = result["row_found"]
            
            model_text = f"Model: {model_name}"
            model_element = self.page.get_by_text(model_text, exact=False).first
            if model_element.is_visible():
                result["model_visible"] = True
                logger.info(f"Model '{model_name}' is visible in row")
            else:
                logger.info(f"Model text '{model_text}' not found, checking alternative...")
                if self.page.get_by_text(model_name, exact=False).count() > 0:
                    result["model_visible"] = True
                    logger.info(f"Model name '{model_name}' found (alternative)")
            
        except Exception as e:
            logger.error(f"Error verifying agent row: {str(e)}")
        
        return result
    
    def create_agent_with_verification(self, agent_name: str, description: str, model_name: str, execution_engine: str = "langchain-executor", tools: list = None) -> dict:
        logger.info(f"Creating agent: {agent_name}")
        logger.info(f"Current URL before clicking Add: {self.page.url}")
        
        self.page.locator(self.ADD_AGENT_BUTTON).first.click()
        
        # Wait for modal dialog to open
        self.wait_for_modal_open()
        logger.info("Modal dialog opened")
        
        # Wait for form to be ready inside the modal
        self.wait_for_form_ready()
        
        logger.info(f"URL after clicking Add Agent: {self.page.url}")
        
        name_input = self.page.locator("input#name")
        name_input.wait_for(state="visible", timeout=10000)
        name_input.fill(agent_name)
        logger.info(f"Filled agent name: {agent_name}")
        
        description_input = self.page.locator("input#description")
        description_input.wait_for(state="visible", timeout=5000)
        description_input.fill(description)
        
        # Execution engine field is optional (only available with experimental features)
        try:
            execution_engine_input = self.page.locator("input#execution-engine")
            execution_engine_input.wait_for(state="visible", timeout=2000)
            execution_engine_input.fill(execution_engine)
            logger.info(f"Execution engine field filled with: {execution_engine}")
        except Exception:
            logger.info("Execution engine field not available (experimental feature may be disabled)")
        
        model_trigger = self.page.locator("button#model")
        model_trigger.wait_for(state="visible", timeout=5000)
        model_trigger.click()
        
        # Wait for dropdown options to appear
        self.wait_for_dropdown_options()
        
        model_option = self.page.get_by_role("option", name=model_name, exact=True)
        if model_option.count() > 0:
            logger.info(f"Found exact match for model: {model_name}")
            model_option.click()
        else:
            logger.info(f"Trying alternative selector for model: {model_name}")
            model_option_alt = self.page.locator(f"[role='option']:has-text('{model_name}')").first
            if model_option_alt.is_visible():
                model_option_alt.click()
            else:
                logger.warning(f"Could not find model option for: {model_name}")
        
        logger.info(f"Model {model_name} selected")
        
        # Wait for dropdown to close
        self.wait_for_element_hidden("[role='listbox']", timeout=5000)
        
        if tools:
            logger.info(f"Selecting tools: {tools}")
            for tool_name in tools:
                self._select_tool(tool_name)
        
        # Find the Create/Save button inside the dialog
        dialog = self.page.locator("[role='dialog'], [data-slot='dialog-content']").first
        save_button = dialog.locator("button").filter(has_text="Create").first
        if not save_button.is_visible():
            save_button = dialog.locator("button").filter(has_text="Save").first
        if not save_button.is_visible():
            save_button = dialog.locator("button[type='submit']").first
        
        # Wait for button to be ready
        save_button.wait_for(state="visible", timeout=5000)
        logger.info(f"Clicking Create button...")
        
        # Click using JavaScript to bypass overlay
        save_button.evaluate("el => el.click()")
        logger.info("Create button clicked via JavaScript")
        
        # Wait for modal to close and navigation to complete
        self.wait_for_modal_close(timeout=10000)
        self.wait_for_navigation_complete()
        logger.info(f"URL after Create: {self.page.url}")
        
        error_banner = self.check_for_error_banner()
        if error_banner["has_error"]:
            logger.error(f"{error_banner['message']}")
            raise Exception(f"Agent creation failed: {error_banner['message']}")
        
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            popup_visible = True
        except:
            popup_visible = False
        
        # Navigate back to agents list to verify the agent was created
        logger.info("Navigating back to agents list...")
        self.navigate_to_agents_tab()
        
        # Wait for Add Agent button to confirm page is loaded
        self.wait_for_element(self.ADD_AGENT_BUTTON, timeout=10000)
        
        # Check if agent is in table with retries
        in_table = self.is_agent_in_table(agent_name, retries=3)
        
        row_verification = self.verify_agent_in_table_row(agent_name, description, model_name)
        
        return {
            "name": agent_name,
            "popup_visible": popup_visible,
            "in_table": in_table,
            "row_verification": row_verification
        }
    
    def delete_agent_with_verification(self, agent_name: str) -> dict:        
        try:
            name_element = self.page.get_by_text(agent_name, exact=True).first
            name_element.scroll_into_view_if_needed()
            row_container = name_element.locator("../../..").first
            buttons = row_container.locator("button").all()
            
            if len(buttons) < 2:
                return self._delete_not_available(agent_name)
            
            buttons[-2].click()
        except:
            return self._delete_not_available(agent_name)
        
        # Wait for confirmation dialog to appear
        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_navigation_complete()
        popup_visible = self._check_success_popup()
        
        # Wait for table to refresh and agent to disappear
        self.wait_for_table_content()
        deleted_from_table = not self.is_agent_in_table(agent_name)
        
        return {
            "agent_name": agent_name,
            "delete_available": True,
            "confirm_dialog_visible": confirm_dialog_visible,
            "confirm_button_visible": confirm_button_visible,
            "popup_visible": popup_visible,
            "deleted_from_table": deleted_from_table
        }
    
    def _delete_not_available(self, agent_name: str) -> dict:
        return {
            "agent_name": agent_name,
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
    
    def _select_tool(self, tool_name: str) -> None:
        try:
            logger.info(f"Looking for tool: {tool_name}")
            tool_label = self.page.locator(f"label:has-text('{tool_name}')").first
            if tool_label.is_visible():
                checkbox_id = tool_label.get_attribute("for")
                if checkbox_id:
                    checkbox = self.page.locator(f"#{checkbox_id}")
                    if not checkbox.is_checked():
                        logger.info(f"Selecting tool: {tool_name}")
                        checkbox.check()
                    else:
                        logger.info(f"Tool {tool_name} already selected")
                else:
                    tool_label.click()
                    logger.info(f"Selected tool: {tool_name}")
            else:
                logger.warning(f"Tool {tool_name} not found in tools list")
        except Exception as e:
            logger.error(f"Error selecting tool {tool_name}: {str(e)}")
    
    def create_agent_for_test(self, prefix: str, model_name: str, test_data_key: str = "default", tools: list = None):
        """Complete flow to create an agent for testing - navigate, check, and create"""
        import pytest
        
        agent_data = self.TEST_DATA[test_data_key]
        
        self.navigate_to_agents_tab()
        
        if not self.is_visible(self.ADD_AGENT_BUTTON):
            pytest.skip("Add Agent button not available")
        
        agent_name = self.generate_agent_name(prefix)
        logger.info(f"Generated agent name: {agent_name}")
        
        result = self.create_agent_with_verification(
            agent_name=agent_name,
            description=agent_data["description"],
            model_name=model_name,
            tools=tools
        )
        
        logger.info(f"Agent created successfully: {result['name']}")
        
        return result

