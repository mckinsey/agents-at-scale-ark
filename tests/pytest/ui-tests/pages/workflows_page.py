import logging
from playwright.sync_api import Page
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
                    self.page.keyboard.press("Escape")
                    self.wait_for_timeout(300)
                    continue
            except:
                pass
            
            try:
                close_button = self.page.locator("button:has-text('×'), button[aria-label='Close'], button[class*='close']").first
                if close_button.is_visible(timeout=1000):
                    close_button.click()
                    self.wait_for_timeout(300)
                    continue
            except:
                pass
            
            break
        
        try:
            self.page.keyboard.press("Escape")
            self.page.keyboard.press("Escape")
            self.wait_for_timeout(200)
        except:
            pass
    
    def navigate_to_workflows(self):
        self.page.goto(self.base_url, timeout=60000)
        self.wait_for_load_state("domcontentloaded")
        self.wait_for_timeout(2000)
        
        self.close_modal_if_present()
    
    def search_workflow(self, workflow_name: str):
        search_box = self.page.locator(self.SEARCH_INPUT).first
        if search_box.is_visible(timeout=5000):
            search_box.fill(workflow_name)
            self.wait_for_timeout(1000)
    
    def click_workflow(self, workflow_name: str):
        self.close_modal_if_present()
        
        workflow_link = self.page.locator(f"a[href*='{workflow_name}']").first
        if not workflow_link.is_visible(timeout=3000):
            workflow_link = self.page.locator(f"text={workflow_name}").first
        
        workflow_link.wait_for(state="visible", timeout=15000)
        workflow_link.click(force=True)
        self.wait_for_load_state("domcontentloaded")
        self.wait_for_timeout(2000)
    
    def is_workflow_visible(self, workflow_name: str) -> bool:
        try:
            return self.page.locator(f"text={workflow_name}").first.is_visible(timeout=10000)
        except:
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
            except:
                continue
        
        return "Unknown"
    
    def wait_for_status(self, expected_status: str, timeout_seconds: int = 60) -> bool:
        import time
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
            self.wait_for_load_state("networkidle")
        
        return False
    
    def is_on_workflow_details_page(self, workflow_name: str) -> bool:
        return workflow_name in self.page.url or "workflows" in self.page.url.lower()
    
    def get_workflow_logs(self) -> str:
        try:
            logs_element = self.page.locator(self.LOGS_SECTION).first
            if logs_element.is_visible(timeout=5000):
                return logs_element.inner_text()
        except:
            pass
        return ""
    
    def verify_workflow_completed(self) -> bool:
        status = self.get_workflow_status()
        return "succeeded" in status.lower() or "completed" in status.lower()
