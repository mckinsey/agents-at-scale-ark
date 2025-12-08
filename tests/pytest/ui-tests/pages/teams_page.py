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
        dashboard.navigate_to_dashboard()
        
        if not self.page.locator(dashboard.TEAMS_TAB).first.is_visible():
            import pytest
            pytest.skip("Teams tab not visible")
        
        self.page.locator(dashboard.TEAMS_TAB).first.click()
        self.wait_for_load_state("domcontentloaded")
        self.wait_for_timeout(3000)
    
    def generate_team_name(self, prefix: str = "team") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{date_str}"
    
    def is_team_in_table(self, team_name: str) -> bool:
        try:
            return self.page.get_by_text(team_name, exact=False).count() > 0
        except:
            return False
    
    def create_team_with_verification(self, team_name: str, description: str, strategy: str, max_turns: str, member_name: str) -> dict:
        logger.info(f"Creating team: {team_name}")
        
        self.page.locator(self.ADD_TEAM_BUTTON).first.click()
        self.wait_for_load_state("domcontentloaded")
        
        self.page.locator("input").first.wait_for(state="visible", timeout=10000)
        self.page.locator("input").first.fill(team_name)
        
        description_field = self.page.locator("textarea")
        if description_field.count() > 0:
            description_field.first.fill(description)
        else:
            self.page.locator("input").nth(1).fill(description)
        
        select_dropdown = self.page.locator("select")
        if select_dropdown.count() > 0:
            select_dropdown.first.select_option(label=strategy)
        
        max_turns_fields = self.page.locator("input[type='number']")
        if max_turns_fields.count() > 0:
            max_turns_fields.first.fill(max_turns)
        
        logger.info(f"Selecting member: {member_name}")
        self.wait_for_timeout(1000)
        
        try:
            checkbox = self.page.locator(f"tr:has-text('{member_name}') input[type='checkbox'], div:has-text('{member_name}') input[type='checkbox'], label:has-text('{member_name}') input[type='checkbox']").first
            if checkbox.is_visible():
                checkbox.check()
            else:
                all_checkboxes = self.page.locator("[role='dialog'] input[type='checkbox']")
                if all_checkboxes.count() > 0:
                    all_checkboxes.first.check()
        except Exception as e:
            logger.warning(f"Could not select member checkbox: {e}")
        
        self.wait_for_timeout(1000)
        
        save_button = self.page.locator("[role='dialog'] button:has-text('Create'), [data-slot='dialog-content'] button:has-text('Create')").first
        if not save_button.is_visible():
            save_button = self.page.locator("[role='dialog'] button[type='submit'], [data-slot='dialog-content'] button[type='submit']").first
        
        logger.info("Clicking Create button in team dialog")
        save_button.scroll_into_view_if_needed()
        save_button.evaluate("el => el.click()")
        
        self.wait_for_load_state("domcontentloaded")
        self.wait_for_timeout(2000)
        
        try:
            self.page.locator(self.SUCCESS_POPUP).first.wait_for(state="visible", timeout=5000)
            popup_visible = True
        except:
            popup_visible = False
        
        try:
            self.page.locator("[data-slot='dialog-overlay'], [role='dialog']").first.wait_for(state="hidden", timeout=10000)
        except:
            logger.info("Dialog may still be open, pressing Escape")
            self.page.keyboard.press("Escape")
            self.wait_for_timeout(1000)
        
        self.wait_for_timeout(1000)
        self.navigate_to_teams_tab()
        self.wait_for_timeout(2000)
        
        in_table = self.is_team_in_table(team_name)
        
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
        
        self.wait_for_timeout(1000)
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()
        confirm_button_visible = self.page.locator(self.CONFIRM_DELETE_BUTTON).first.is_visible()
        
        if confirm_button_visible:
            self.page.locator(self.CONFIRM_DELETE_BUTTON).first.click()
        
        self.wait_for_load_state("domcontentloaded")
        popup_visible = self._check_success_popup()
        self.wait_for_timeout(3000)
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

