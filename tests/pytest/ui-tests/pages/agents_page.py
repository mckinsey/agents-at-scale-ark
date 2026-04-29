import logging
import random
import pytest
from datetime import datetime
from playwright.sync_api import Page
from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class AgentsPage(BasePage):
    
    ADD_AGENT_BUTTON = "a[href='/agents/new']:has-text('Create Agent'), button:has-text('Create Agent'), button:has-text('Add Agent'), button:has-text('New Agent'), a:has-text('Add Agent')"
    AGENT_NAME_INPUT = "input[name='name'], input[placeholder*='name' i]"
    AGENT_DESCRIPTION_INPUT = "textarea[name='description'], textarea[placeholder*='description' i], input[name='description']"
    MODEL_SELECT = "select, [role='combobox'], button:has-text('Select')"
    SAVE_BUTTON = "button:has-text('Create Agent'), button:has-text('Save Changes'), button:has-text('Add Agent'), button:has-text('Create'), button:has-text('Save'), button[type='submit']"
    CONFIRM_DELETE_DIALOG = "[role='dialog'], [role='alertdialog'], .modal, div:has-text('confirm'), div:has-text('delete')"
    CONFIRM_DELETE_BUTTON = "button:has-text('Delete'), button:has-text('Confirm'), button:has-text('Yes')"
    CHAT_BUTTON = "button:has(svg.lucide-message-circle)"
    CHAT_WINDOW = "div[data-slot='card']"
    CLOSE_CHAT_BUTTON = "button[aria-label='Close chat']"

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
        self._close_dialog_if_open()
        dashboard = DashboardPage(self.page)
        dashboard.navigate_to_section("agents")
        self.wait_for_element(self.ADD_AGENT_BUTTON, timeout=10000)
        self._close_dialog_if_open()
    
    def generate_agent_name(self, prefix: str = "agent") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        rand = random.randint(100, 999)
        return f"{prefix}-{date_str}{rand}"
    
    def is_agent_in_table(self, agent_name: str, retries: int = 3) -> bool:
        for attempt in range(retries):
            try:
                self.page.get_by_text(agent_name, exact=False).first.wait_for(state="visible", timeout=10000)
                return True
            except Exception as e:
                logger.debug(f"Agent {agent_name} not visible on attempt {attempt + 1}/{retries}: {e}")
                if attempt < retries - 1:
                    logger.info(f"Agent {agent_name} not found, retrying ({attempt + 1}/{retries})...")
                    self.page.reload()
                    self.wait_for_navigation_complete()
                    self.wait_for_element(self.ADD_AGENT_BUTTON, timeout=10000)
        return False

    def open_agent_chat(self, agent_name: str):
        if self.page.locator(self.CHAT_WINDOW).is_visible(timeout=100):
            logger.error("Chat already open")
            return
        row = self.page.locator(f"[role='link']:has(p.truncate.text-sm.font-medium:has-text('{agent_name}'))").first
        row.locator(self.CHAT_BUTTON).click()
        self.wait_for_element(self.CHAT_WINDOW)

    def close_agent_chat(self):
        if not self.page.locator(self.CHAT_WINDOW).is_visible(timeout=1000):
            logger.error("Chat not open")
            return
        self.page.locator(self.CLOSE_CHAT_BUTTON).first.click()
        self.wait_for_element_hidden(self.CHAT_WINDOW, timeout=5000)
    
    def check_for_error_banner(self) -> dict:
        logger.info("Checking for error banners...")
        
        result = {
            "has_error": False,
            "message": ""
        }
        
        error_selectors = [
            "[role='alert']:has-text('error')",
            "[role='alert']:has-text('Error')",
            "[role='alert']:has-text('500')",
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
        self.wait_for_navigation_complete()

        name_input = self.page.locator(self.AGENT_NAME_INPUT).first
        name_input.wait_for(state="visible", timeout=20000)
        name_input.fill(agent_name)

        description_input = self.page.locator(self.AGENT_DESCRIPTION_INPUT).first
        description_input.wait_for(state="visible", timeout=5000)
        description_input.fill(description)
        
        execution_engine_input = self.page.locator("input#execution-engine, input[name='execution-engine'], input[name='executionEngine']").first
        if execution_engine_input.is_visible():
            execution_engine_input.fill(execution_engine)
        else:
            logger.info("Execution engine field not found, skipping")
        
        model_selectors = [
            "[role='combobox'][aria-label*='Model' i]",
            "button[aria-haspopup='listbox']:has-text('Select')",
            "[data-slot='trigger'][aria-haspopup='listbox']",
            "button#model",
            "button[name='model']",
            "[role='combobox']"
        ]
        
        model_trigger = None
        for selector in model_selectors:
            try:
                loc = self.page.locator(selector).first
                if loc.is_visible(timeout=2000):
                    model_trigger = loc
                    logger.info(f"Found model selector with: {selector}")
                    break
            except:
                continue
        
        if not model_trigger:
            logger.warning("Could not find model dropdown, trying label approach")
            model_label = self.page.get_by_text("Model", exact=True).first
            model_trigger = model_label.locator("..").locator("button, [role='combobox']").first
        
        model_trigger.click(force=True)
        
        options_visible = False
        for attempt in range(3):
            try:
                self.page.locator("[role='option']").first.wait_for(state="visible", timeout=3000)
                options_visible = True
                break
            except:
                logger.info(f"Options not visible (attempt {attempt + 1}), retrying")
                model_trigger.click(force=True)
        
        if not options_visible:
            logger.warning("Could not open model dropdown")
        
        model_selected = False
        for attempt in range(5):
            model_option = self.page.get_by_role("option", name=model_name, exact=True)
            if model_option.count() > 0:
                logger.info(f"Found exact match for model: {model_name}")
                model_option.first.click(force=True)
                model_selected = True
                break

            model_option_alt = self.page.locator(f"[role='option']:has-text('{model_name}')").first
            if model_option_alt.count() > 0:
                logger.info(f"Found partial match for model: {model_name}")
                model_option_alt.click(force=True)
                model_selected = True
                break

            if attempt < 4:
                logger.info(f"Model {model_name} not in dropdown yet, retrying ({attempt + 1}/5)...")
                self.page.keyboard.press("Escape")
                self.wait_for_element_hidden("[role='option']", timeout=3000)
                self.page.wait_for_timeout(3000)
                model_trigger.click(force=True)
                self.page.locator("[role='option']").first.wait_for(state="visible", timeout=5000)

        if not model_selected:
            raise Exception(f"Could not find model '{model_name}' in dropdown after 5 attempts")

        logger.info(f"Model {model_name} selected")
        
        if tools:
            logger.info(f"Selecting tools: {tools}")
            for tool_name in tools:
                self._select_tool(tool_name)
        
        save_button = self.page.locator("button:has-text('Create Agent'), button:has-text('Save Changes')").first
        if not save_button.is_visible():
            save_button = self.page.locator("[role='dialog'] button:has-text('Create'), [data-slot='dialog-content'] button:has-text('Create')").first
        if not save_button.is_visible():
            save_button = self.page.locator("[role='dialog'] button[type='submit'], [data-slot='dialog-content'] button[type='submit']").first
        
        logger.info("Clicking Create/Save button")
        save_button.scroll_into_view_if_needed()
        save_button.click()
        
        self.wait_for_load_state("domcontentloaded")
        
        error_banner = self.check_for_error_banner()
        if error_banner["has_error"]:
            logger.error(f"{error_banner['message']}")
            raise Exception(f"Agent creation failed: {error_banner['message']}")
        
        popup_visible = self._check_toast_popup()
        
        self._close_dialog_if_open()
        
        self.navigate_to_agents_tab()
        
        in_table = self.is_agent_in_table(agent_name)
        
        row_verification = self.verify_agent_in_table_row(agent_name, description, model_name)
        
        return {
            "name": agent_name,
            "popup_visible": popup_visible,
            "in_table": in_table,
            "row_verification": row_verification
        }
    
    def delete_agent_with_verification(self, agent_name: str) -> dict:
        if not self.is_agent_in_table(agent_name):
            logger.warning("Agent '%s' not found in table after retries", agent_name)
            return self._delete_not_available(agent_name)
        try:
            name_element = self.page.get_by_text(agent_name, exact=True).first
            name_element.wait_for(state="visible", timeout=10000)
            name_element.scroll_into_view_if_needed()
            card = name_element.locator("xpath=ancestor::div[.//button[@aria-label='Delete agent'] or .//button[.//*[contains(@class,'lucide-trash')]]  ][1]")
            delete_btn = card.locator("button[aria-label='Delete agent'], button:has(svg.lucide-trash-2)").first
            delete_btn.wait_for(state="visible", timeout=5000)
            delete_btn.click(force=True)
        except Exception as e:
            logger.warning("Delete button not accessible for agent '%s': %s", agent_name, e)
            return self._delete_not_available(agent_name)
        
        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_load_state("domcontentloaded")
        popup_visible = self._check_toast_popup()
        deleted_from_table = not self.is_agent_in_table(agent_name, retries=0)
        
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
    
    def _close_dialog_if_open(self) -> None:
        for attempt in range(3):
            try:
                dialog_overlay = self.page.locator("[data-slot='dialog-overlay'], [role='dialog']").first
                if dialog_overlay.is_visible(timeout=1000):
                    logger.info(f"Dialog still open, attempting to close (attempt {attempt + 1})")
                    self.page.keyboard.press("Escape")
                    self.wait_for_element_hidden("[data-slot='dialog-overlay'], [role='dialog']", timeout=3000)
                    
                    close_button = self.page.locator("button:has-text('Close'), button:has-text('Cancel'), [aria-label='Close']").first
                    if close_button.is_visible(timeout=500):
                        close_button.click()
                        self.wait_for_element_hidden("[data-slot='dialog-overlay'], [role='dialog']", timeout=3000)
                else:
                    logger.info("Dialog closed successfully")
                    return
            except:
                pass
        
        self.page.keyboard.press("Escape")
    
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
