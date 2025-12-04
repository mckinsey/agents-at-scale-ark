import logging
from playwright.sync_api import Page
from .base_page import BasePage
from datetime import datetime

logger = logging.getLogger(__name__)


class TeamsPage(BasePage):
    
    ADD_TEAM_BUTTON = "button:has-text('Add Team'), button:has-text('Create Team'), button:has-text('New Team'), a:has-text('Add Team')"
    TEAM_NAME_INPUT = "input[name='name'], input[placeholder*='name' i], input[id*='name'], input[type='text']:visible"
    TEAM_DESCRIPTION_INPUT = "textarea[name='description'], textarea[placeholder*='description' i], input[name='description'], textarea:visible"
    STRATEGY_SELECT = "select, [role='combobox']"
    MAX_TURNS_INPUT = "input[name='maxTurns'], input[placeholder*='turns' i], input[type='number'], input[name='max']"
    MEMBERS_SELECT = "button:has-text('Select'), [role='combobox']:has-text('Select'), button:has-text('Add')"
    SAVE_BUTTON = "button:has-text('Add Team'), button:has-text('Create'), button:has-text('Save'), button[type='submit']"
    SUCCESS_POPUP = "[role='alert'], [role='status'], .notification, .toast, div:has-text('success'), div:has-text('Success'), div:has-text('created'), div:has-text('Created'), div:has-text('deleted'), div:has-text('Deleted')"
    CONFIRM_DELETE_DIALOG = "[role='dialog'], [role='alertdialog'], .modal, div:has-text('confirm'), div:has-text('delete')"
    CONFIRM_DELETE_BUTTON = "button:has-text('Delete'), button:has-text('Confirm'), button:has-text('Yes')"
    
    TEST_DATA = {
        "default": {
            "description": "Resolve customer queries",
            "strategy": "Round Robin",
            "max_turns": "5"
        }
    }
    
    def navigate_to_teams_tab(self) -> None:
        from .dashboard_page import DashboardPage
        dashboard = DashboardPage(self.page)
        
        # Navigate directly to /teams URL instead of clicking tabs
        self.page.goto(f"{dashboard.base_url}/teams")
        self.wait_for_navigation_complete()
        
        # Wait for Add Team button to appear
        self.wait_for_element(self.ADD_TEAM_BUTTON, timeout=10000)
    
    def generate_team_name(self, prefix: str = "team") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{date_str}"
    
    def is_team_in_table(self, team_name: str, retries: int = 3) -> bool:
        """Check if team is in table with retry logic"""
        for attempt in range(retries):
            try:
                if self.page.get_by_text(team_name, exact=False).count() > 0:
                    return True
                if attempt < retries - 1:
                    logger.info(f"Team {team_name} not found, retrying... ({attempt + 1}/{retries})")
                    self.page.reload()
                    self.wait_for_navigation_complete()
                    self.wait_for_element(self.ADD_TEAM_BUTTON, timeout=10000)
            except Exception as e:
                logger.warning(f"Error checking team in table: {e}")
        return False
    
    def create_team_with_verification(self, team_name: str, description: str, strategy: str, max_turns: str, member_name: str) -> dict:
        logger.info(f"Creating team: {team_name}")
        logger.info(f"Current URL before clicking Add: {self.page.url}")
        
        self.page.locator(self.ADD_TEAM_BUTTON).first.click()
        
        # Wait for modal dialog to open
        self.wait_for_modal_open()
        logger.info("Modal dialog opened")
        
        # Wait for form to be ready inside the modal
        self.wait_for_form_ready()
        
        logger.info(f"URL after clicking Add Team: {self.page.url}")
        
        # Get the dialog element
        dialog = self.page.locator("[role='dialog'], [data-slot='dialog-content']").first
        
        # Fill name field
        name_input = dialog.locator("input").first
        name_input.wait_for(state="visible", timeout=10000)
        name_input.fill(team_name)
        logger.info(f"Filled team name: {team_name}")
        
        # Fill description field
        description_field = dialog.locator("textarea")
        if description_field.count() > 0:
            description_field.first.fill(description)
            logger.info(f"Filled description: {description}")
        else:
            dialog.locator("input").nth(1).fill(description)
        
        # Select strategy
        select_dropdown = dialog.locator("select")
        if select_dropdown.count() > 0:
            select_dropdown.first.select_option(label=strategy)
            logger.info(f"Selected strategy: {strategy}")
        
        # Fill max turns
        max_turns_fields = dialog.locator("input[type='number']")
        if max_turns_fields.count() > 0:
            max_turns_fields.first.fill(max_turns)
            logger.info(f"Filled max turns: {max_turns}")
        
        logger.info(f"Selecting member: {member_name}")
        # Wait for checkbox elements to be available inside dialog
        member_checkboxes = dialog.locator("input[type='checkbox']")
        logger.info(f"Found {member_checkboxes.count()} checkboxes in dialog")
        
        if member_checkboxes.count() > 0:
            # Try to find and check the agent row
            for i in range(member_checkboxes.count()):
                checkbox = member_checkboxes.nth(i)
                parent_text = checkbox.locator("..").inner_text()
                if member_name in parent_text:
                    checkbox.check()
                    logger.info(f"Selected member: {member_name}")
                    break
            else:
                # If not found by parent text, try to check the first one
                logger.warning(f"Member {member_name} not found by name, checking first checkbox")
                member_checkboxes.first.check()
        
        # Find the Create/Save button inside the dialog
        save_button = dialog.locator("button").filter(has_text="Create").first
        if not save_button.is_visible():
            save_button = dialog.locator("button").filter(has_text="Save").first
        if not save_button.is_visible():
            save_button = dialog.locator("button[type='submit']").first
        
        save_button.wait_for(state="visible", timeout=5000)
        logger.info("Clicking Create button...")
        
        # Click using JavaScript to bypass overlay
        save_button.evaluate("el => el.click()")
        logger.info("Create button clicked via JavaScript")
        
        # Wait for modal to close and navigation to complete
        self.wait_for_modal_close(timeout=10000)
        self.wait_for_navigation_complete()
        logger.info(f"URL after Create: {self.page.url}")
        
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            popup_visible = True
        except:
            popup_visible = False
        
        # Navigate back to teams list to verify the team was created
        logger.info("Navigating back to teams list...")
        self.navigate_to_teams_tab()
        
        # Wait for table to load
        self.wait_for_table_content()
        
        # Debug: Log what's visible on the page
        logger.info(f"Looking for team: {team_name}")
        in_table = self.is_team_in_table(team_name)
        logger.info(f"Team in table: {in_table}")
        
        return {
            "name": team_name,
            "popup_visible": popup_visible,
            "in_table": in_table,
            "strategy": strategy
        }
    
    def delete_team_with_verification(self, team_name: str) -> dict:        
        try:
            name_element = self.page.get_by_text(team_name, exact=True).first
            name_element.scroll_into_view_if_needed()
            row_container = name_element.locator("../../..").first
            buttons = row_container.locator("button").all()
            
            if len(buttons) < 2:
                return self._delete_not_available(team_name)
            
            buttons[-2].click()
        except:
            return self._delete_not_available(team_name)
        
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
        deleted_from_table = not self.is_team_in_table(team_name)
        
        return {
            "team_name": team_name,
            "delete_available": True,
            "confirm_dialog_visible": confirm_dialog_visible,
            "confirm_button_visible": confirm_button_visible,
            "popup_visible": popup_visible,
            "deleted_from_table": deleted_from_table
        }
    
    def _delete_not_available(self, team_name: str) -> dict:
        return {
            "team_name": team_name,
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
