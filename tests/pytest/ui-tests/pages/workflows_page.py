import logging
import time

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError
from .base_page import BasePage

logger = logging.getLogger(__name__)


class WorkflowsPage(BasePage):
    
    WORKFLOWS_TAB = "text=Workflows"
    WORKFLOW_TEMPLATES_TAB = "text=Workflow Templates"
    SEARCH_INPUT = "input[placeholder*='Search'], input[type='search']"
    WORKFLOW_LIST = "[class*='workflows'], [class*='workflow-list']"
    STATUS_SUCCEEDED = "text=Succeeded"
    STATUS_RUNNING = "text=Running"
    STATUS_FAILED = "text=Failed"
    WORKFLOW_DETAILS = "[class*='workflow-details'], [class*='workflow-node']"
    LOGS_SECTION = "[class*='logs'], pre, code"
    
    def __init__(self, page: Page):
        super().__init__(page)
        self.base_url = "http://localhost:8081"
    
    def close_modal_if_present(self):
        for attempt in range(3):
            try:
                modal = self.page.locator(".modal, [role='dialog'], .argo-dialog, div[class*='modal']").first
                if modal.is_visible(timeout=1000):
                    logger.debug("Modal visible, pressing Escape (attempt %d)", attempt + 1)
                    self.page.keyboard.press("Escape")
                    modal.wait_for(state="hidden", timeout=2000)
                    continue
            except PlaywrightTimeoutError:
                logger.debug("Modal close via Escape timed out on attempt %d", attempt + 1)
            
            try:
                close_button = self.page.locator("button:has-text('×'), button[aria-label='Close'], button[class*='close']").first
                if close_button.is_visible(timeout=1000):
                    close_button.click()
                    close_button.wait_for(state="hidden", timeout=2000)
                    continue
            except PlaywrightTimeoutError:
                logger.debug("Modal close via button timed out on attempt %d", attempt + 1)
            
            break
        
        try:
            self.page.keyboard.press("Escape")
            self.page.keyboard.press("Escape")
        except PlaywrightTimeoutError:
            logger.debug("Final Escape key press timed out")
    
    def navigate_to_workflows(self):
        self.page.goto(self.base_url, timeout=60000)
        self.wait_for_load_state("domcontentloaded")
        try:
            self.page.wait_for_load_state("networkidle", timeout=5000)
        except PlaywrightTimeoutError:
            logger.debug("Argo UI networkidle timed out (expected for WebSocket-based UI), continuing")
        
        self.close_modal_if_present()
    
    def search_workflow(self, workflow_name: str):
        try:
            search_box = self.page.locator(self.SEARCH_INPUT).first
            search_box.wait_for(state="visible", timeout=5000)
            search_box.fill(workflow_name)
            self.page.wait_for_load_state("domcontentloaded")
        except PlaywrightTimeoutError:
            logger.warning("Search input not visible within timeout")
    
    def click_workflow(self, workflow_name: str):
        self.close_modal_if_present()
        
        workflow_link = self.page.locator(f"a[href*='{workflow_name}']").first
        try:
            workflow_link.wait_for(state="visible", timeout=3000)
        except PlaywrightTimeoutError:
            logger.debug("Link by href not found, falling back to text selector")
            workflow_link = self.page.locator(f"text={workflow_name}").first
        
        workflow_link.wait_for(state="visible", timeout=15000)
        workflow_link.click(force=True)
        self.wait_for_load_state("domcontentloaded")
    
    def is_workflow_visible(self, workflow_name: str) -> bool:
        try:
            return self.page.locator(f"text={workflow_name}").first.is_visible(timeout=10000)
        except PlaywrightTimeoutError:
            logger.debug("Workflow %s not visible within timeout", workflow_name)
            return False
    
    def get_workflow_status(self) -> str:
        status_selectors = [
            self.STATUS_SUCCEEDED,
            self.STATUS_RUNNING,
            self.STATUS_FAILED,
            "[class*='status']",
            "[class*='phase']"
        ]
        
        for selector in status_selectors:
            try:
                element = self.page.locator(selector).first
                if element.is_visible(timeout=3000):
                    return element.inner_text()
            except PlaywrightTimeoutError:
                continue
        
        return "Unknown"
    
    def wait_for_status(self, expected_status: str, timeout_seconds: int = 60) -> bool:
        waited = 0
        
        while waited < timeout_seconds:
            status = self.get_workflow_status()
            
            if expected_status.lower() in status.lower():
                return True
            
            if "failed" in status.lower() or "error" in status.lower():
                return False
            
            time.sleep(5)
            waited += 5
            self.page.reload()
            self.wait_for_load_state("domcontentloaded")
        
        return False
    
    def is_on_workflow_details_page(self, workflow_name: str) -> bool:
        return workflow_name in self.page.url or "workflows" in self.page.url.lower()
    
    def get_workflow_logs(self) -> str:
        try:
            logs_element = self.page.locator(self.LOGS_SECTION).first
            if logs_element.is_visible(timeout=5000):
                return logs_element.inner_text()
        except PlaywrightTimeoutError:
            logger.debug("Logs section not visible within timeout")
        return ""
    
    def verify_workflow_completed(self) -> bool:
        status = self.get_workflow_status()
        return "succeeded" in status.lower() or "completed" in status.lower()
