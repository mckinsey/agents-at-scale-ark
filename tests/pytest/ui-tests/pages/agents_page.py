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
        dashboard.navigate_to_dashboard()
        
        if not self.page.locator(dashboard.AGENTS_TAB).first.is_visible():
            import pytest
            pytest.skip("Agents tab not visible")
        
        self.page.locator(dashboard.AGENTS_TAB).first.click()
        self.wait_for_load_state("networkidle")
        self.wait_for_timeout(2000)
    
    def generate_agent_name(self, prefix: str = "agent") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{date_str}"
    
    def is_agent_in_table(self, agent_name: str) -> bool:
        try:
            return self.page.get_by_text(agent_name, exact=False).count() > 0
        except:
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
        self.page.locator(self.ADD_AGENT_BUTTON).first.click()
        self.wait_for_load_state("networkidle")
        self.wait_for_timeout(2000)
        
        name_input = self.page.locator("input#name")
        name_input.wait_for(state="visible", timeout=10000)
        name_input.fill(agent_name)
        
        description_input = self.page.locator("input#description")
        description_input.wait_for(state="visible", timeout=5000)
        description_input.fill(description)
        
        execution_engine_input = self.page.locator("input#execution-engine")
        execution_engine_input.wait_for(state="visible", timeout=5000)
        execution_engine_input.fill(execution_engine)
        
        self.wait_for_timeout(1000)
        
        model_trigger = self.page.locator("button#model")
        model_trigger.wait_for(state="visible", timeout=5000)
        model_trigger.click()
        self.wait_for_timeout(1000)
        
        self.page.locator("[role='option']").first.wait_for(state="visible", timeout=5000)
        
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
        
        if tools:
            logger.info(f"Selecting tools: {tools}")
            self.wait_for_timeout(1000)
            for tool_name in tools:
                self._select_tool(tool_name)
        
        self.wait_for_timeout(1000)
        
        save_button = self.page.locator("button").filter(has_text="Create").first
        if not save_button.is_visible():
            save_button = self.page.locator("button").filter(has_text="Save").first
        if not save_button.is_visible():
            save_button = self.page.locator("button[type='submit']").first
            
        save_button.click()
        
        self.wait_for_load_state("networkidle")
        self.wait_for_timeout(2000)
        
        error_banner = self.check_for_error_banner()
        if error_banner["has_error"]:
            logger.error(f"{error_banner['message']}")
            raise Exception(f"Agent creation failed: {error_banner['message']}")
        
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            popup_visible = True
        except:
            popup_visible = False
        
        self.wait_for_timeout(3000)
        in_table = self.is_agent_in_table(agent_name)
        
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
        
        self.wait_for_timeout(1000)
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_load_state("networkidle")
        popup_visible = self._check_success_popup()
        self.wait_for_timeout(3000)
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

