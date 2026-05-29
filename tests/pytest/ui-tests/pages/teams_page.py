import logging
import random
from datetime import datetime
from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class TeamsPage(BasePage):
    
    ADD_TEAM_BUTTON = "button:has-text('Add Team'), button:has-text('Create Team'), button:has-text('New Team'), a:has-text('Add Team')"
    TEAM_NAME_INPUT = "input[name='name'], input[placeholder*='name' i], input[id*='name'], input[type='text']:visible"
    TEAM_DESCRIPTION_INPUT = "textarea[name='description'], textarea[placeholder*='description' i], input[name='description'], textarea:visible"
    STRATEGY_SELECT = "select, [role='combobox']"
    MAX_TURNS_INPUT = "input[name='maxTurns'], input[placeholder*='turns' i], input[type='number'], input[name='max']"
    MEMBERS_SELECT = "button:has-text('Select'), [role='combobox']:has-text('Select'), button:has-text('Add')"
    SAVE_BUTTON = "button:has-text('Add Team'), button:has-text('Create'), button:has-text('Save'), button[type='submit']"
    SUBMIT_TEAM_BUTTON = "button:has-text('Create Team'), button:has-text('Create'), [role='dialog'] button[type='submit'], [data-slot='dialog-content'] button[type='submit']"
    STRATEGY_TRIGGER = "form [role='combobox'], [role='dialog'] [role='combobox'], button:has-text('Select a strategy')"
    CONFIRM_DELETE_DIALOG = "[role='dialog'], [role='alertdialog'], .modal, div:has-text('confirm'), div:has-text('delete')"
    CONFIRM_DELETE_BUTTON = "button:has-text('Delete'), button:has-text('Confirm'), button:has-text('Yes')"

    TEST_DATA = {
        "default": {
            "description": "Resolve customer queries",
            "strategy": "Sequential",
            "max_turns": "5"
        }
    }

    def navigate_to_teams_tab(self) -> None:
        dashboard = DashboardPage(self.page)
        dashboard.navigate_to_section("teams")
        self.wait_for_element(self.ADD_TEAM_BUTTON, timeout=10000)

    def generate_team_name(self, prefix: str = "team") -> str:
        date_str = datetime.now().strftime("%d%m%y%H%M%S")
        rand = random.randint(100, 999)
        return f"{prefix}-{date_str}{rand}"

    def is_team_in_table(self, team_name: str, retries: int = 3) -> bool:
        for attempt in range(retries):
            try:
                self.page.get_by_text(team_name, exact=False).first.wait_for(state="visible", timeout=10000)
                return True
            except Exception as e:
                logger.debug(f"Team {team_name} not visible on attempt {attempt + 1}/{retries}: {e}")
                if attempt < retries - 1:
                    logger.info(f"Team {team_name} not found, retrying ({attempt + 1}/{retries})...")
                    self.page.reload()
                    self.wait_for_navigation_complete()
                    self.wait_for_element(self.ADD_TEAM_BUTTON, timeout=10000)
        return False

    def _select_member(self, member_name: str) -> None:
        logger.info(f"Selecting member: {member_name}")
        try:
            member_label = self.page.locator(f"label:has-text('{member_name}')").first
            member_label.wait_for(state="visible", timeout=10000)
            member_label.click()
            logger.info(f"Selected member via label click: {member_name}")
        except Exception as e:
            logger.warning(f"Could not select member via label: {e}")
            try:
                member_row = self.page.locator(f"div:has(div:text('{member_name}'))").first
                checkbox = member_row.locator("button[role='checkbox']").first
                checkbox.wait_for(state="visible", timeout=5000)
                checkbox.click()
                logger.info(f"Selected member via checkbox button: {member_name}")
            except Exception as e2:
                logger.warning(f"Could not select member via checkbox button: {e2}")

    def _ensure_on_team_form(self) -> None:
        """Wait for client-side navigation to the full-page /teams/new form.

        Clicking "Create Team" is a Next.js client-side link, so the URL and DOM
        change asynchronously. The teams-list search input is visible immediately,
        so waiting on a generic input races. The form's name field only exists on
        /teams/new, so it is the reliable gate.
        """
        try:
            self.page.wait_for_url("**/teams/new**", timeout=10000)
        except Exception:
            logger.info("Did not observe /teams/new URL, waiting for form fields")
        self.page.locator("input[name='name']").first.wait_for(state="visible", timeout=10000)

    def create_team_with_verification(self, team_name: str, description: str, strategy: str, max_turns: str, member_names: list) -> dict:
        logger.info(f"Creating team: {team_name}")

        self.page.locator(self.ADD_TEAM_BUTTON).first.click()
        self._ensure_on_team_form()
        return self._create_team_full_page(team_name, description, strategy, max_turns, member_names)

    def _create_team_full_page(self, team_name: str, description: str, strategy: str, max_turns: str, member_names: list) -> dict:
        logger.info("Using full-page team creation form")

        name_input = self.page.locator("input[name='name']")
        name_input.wait_for(state="visible", timeout=10000)
        name_input.fill(team_name)

        desc_input = self.page.locator("input[name='description']")
        if desc_input.count() > 0 and desc_input.first.is_visible():
            desc_input.first.fill(description)

        try:
            self.select_strategy_in_form(strategy)
        except Exception as e:
            logger.warning(f"Could not select strategy: {e}")

        max_turns_field = self.page.locator("input[name='maxTurns'], input[type='number']")
        if max_turns_field.count() > 0:
            max_turns_field.first.fill(max_turns)

        for name in member_names:
            self._select_member(name)

        logger.info("Clicking Create Team button")
        create_btn = self.page.locator(self.SUBMIT_TEAM_BUTTON).first
        create_btn.scroll_into_view_if_needed()
        create_btn.click()
        self.wait_for_load_state("domcontentloaded")

        popup_visible = self._check_toast_popup()
        self.navigate_to_teams_tab()
        in_table = self.is_team_in_table(team_name)

        return {"name": team_name, "popup_visible": popup_visible, "in_table": in_table, "strategy": strategy}

    def delete_team_with_verification(self, team_name: str) -> dict:
        if not self.is_team_in_table(team_name):
            logger.warning("Team '%s' not found in table after retries", team_name)
            return self._delete_not_available(team_name)
        try:
            name_element = self.page.get_by_text(team_name, exact=True).first
            name_element.wait_for(state="visible", timeout=10000)
            name_element.scroll_into_view_if_needed()
            card = name_element.locator("xpath=ancestor::div[.//button[@aria-label='Delete team'] or .//button[.//*[contains(@class,'lucide-trash')]]  ][1]")
            delete_btn = card.locator("button[aria-label='Delete team'], button:has(svg.lucide-trash-2)").first
            delete_btn.wait_for(state="visible", timeout=5000)
            delete_btn.click(force=True)
        except Exception as e:
            logger.warning("Delete button not accessible for team '%s': %s", team_name, e)
            return self._delete_not_available(team_name)

        self.wait_for_modal_open()
        confirm_dialog_visible = self.page.locator(self.CONFIRM_DELETE_DIALOG).first.is_visible()

        scoped_confirm = "[role='alertdialog'] button:has-text('Delete'), [role='dialog'] button:has-text('Delete'), [role='alertdialog'] button:has-text('Confirm'), [role='dialog'] button:has-text('Confirm'), [role='alertdialog'] button:has-text('Yes'), [role='dialog'] button:has-text('Yes')"
        confirm_button_visible = self.page.locator(scoped_confirm).first.is_visible()

        if confirm_button_visible:
            btn = self.page.locator(scoped_confirm).first
            btn.wait_for(state="visible", timeout=5000)
            btn.click(force=True)

        self.wait_for_load_state("domcontentloaded")
        popup_visible = self._check_toast_popup()
        self.navigate_to_teams_tab()
        deleted_from_table = not self.is_team_in_table(team_name, retries=0)

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

    def _open_strategy_dropdown(self) -> None:
        trigger = self.page.locator(self.STRATEGY_TRIGGER).first
        trigger.scroll_into_view_if_needed()
        trigger.wait_for(state="visible", timeout=15000)
        for attempt in range(3):
            trigger.click()
            try:
                self.wait_for_dropdown_options(timeout=5000)
                return
            except Exception:
                logger.info(f"Strategy dropdown not visible on attempt {attempt + 1}, retrying")
        self.wait_for_dropdown_options(timeout=2000)

    def get_strategy_options(self) -> list[str]:
        self.page.locator(self.ADD_TEAM_BUTTON).first.click()
        self._ensure_on_team_form()

        self._open_strategy_dropdown()
        options = [
            opt.inner_text()
            for opt in self.page.locator("[role='option']").all()
        ]
        self.page.keyboard.press("Escape")
        self.wait_for_modal_close()
        return options

    def is_loops_checkbox_visible(self) -> bool:
        return self.is_visible("label:has-text('Enable loops')", timeout=3000)

    def is_loops_checkbox_checked(self) -> bool:
        checkbox = self.page.locator(
            "label:has-text('Enable loops')"
        ).locator("xpath=preceding-sibling::input[@type='checkbox']").first
        return checkbox.is_checked()

    def is_max_turns_field_visible(self) -> bool:
        return self.is_visible("input[name='maxTurns'], input[type='number']", timeout=8000)

    def select_strategy_in_form(self, strategy: str) -> None:
        self._ensure_on_team_form()
        self._open_strategy_dropdown()
        self.page.locator(f"[role='option']:has-text('{strategy}')").first.click()
        self.page.locator("[role='option']").first.wait_for(state="hidden", timeout=5000)

    def toggle_loops_checkbox(self) -> None:
        checkbox = self.page.locator("label:has-text('Enable loops')").locator("..").locator("button[role='checkbox']").first
        current_state = checkbox.get_attribute("data-state")
        if current_state == "checked":
            checkbox.click()  # uncheck
        else:
            checkbox.click()  # check
        self.page.wait_for_timeout(300)

    def create_sequential_loops_team(self, team_name: str, member_name: str, max_turns: str, loops: bool = True) -> dict:
        logger.info(f"Creating sequential+loops team: {team_name}, loops={loops}")

        self.page.locator(self.ADD_TEAM_BUTTON).first.click()
        self._ensure_on_team_form()

        name_input = self.page.locator("input[name='name']")
        name_input.wait_for(state="visible", timeout=10000)
        name_input.fill(team_name)

        self.select_strategy_in_form("Sequential")

        loops_visible = self.is_loops_checkbox_visible()
        if loops:
            if loops_visible:
                checkbox = self.page.locator("label:has-text('Enable loops')").locator("..").locator("button[role='checkbox']").first
                checkbox.click()
                self.page.locator("input[name='maxTurns'], input[type='number']").first.wait_for(
                    state="visible", timeout=8000
                )
            else:
                logger.warning("Loops checkbox not visible")

        max_turns_visible = self.is_max_turns_field_visible()
        if loops and max_turns_visible:
            self.page.locator("input[name='maxTurns'], input[type='number']").first.fill(max_turns)

        try:
            member_label = self.page.locator(f"label:has-text('{member_name}')").first
            member_label.wait_for(state="visible", timeout=10000)
            member_label.click()
        except Exception as e:
            logger.warning(f"Could not select member via label: {e}")
            try:
                member_row = self.page.locator(f"div:has(div:text('{member_name}'))").first
                member_row.locator("button[role='checkbox']").first.click()
            except Exception as e2:
                logger.warning(f"Could not select member via checkbox: {e2}")

        create_btn = self.page.locator(self.SUBMIT_TEAM_BUTTON).first
        create_btn.scroll_into_view_if_needed()
        create_btn.click(force=True)
        self.wait_for_load_state("domcontentloaded")

        popup_visible = self._check_toast_popup()

        self.wait_for_modal_close()
        self.navigate_to_teams_tab()
        in_table = self.is_team_in_table(team_name)

        return {
            "name": team_name,
            "loops": loops,
            "loops_checkbox_visible": loops_visible,
            "max_turns_visible": max_turns_visible,
            "popup_visible": popup_visible,
            "in_table": in_table,
        }

    def get_team_row_strategy_text(self, team_name: str) -> str:
        try:
            name_el = self.page.get_by_text(team_name, exact=True).first
            name_el.wait_for(state="visible", timeout=10000)
            row = name_el.locator("xpath=ancestor::*[@role='link'][1]")
            return row.inner_text()
        except Exception as e:
            logger.warning(f"Could not get row text for team {team_name}: {e}")
            return ""

    def is_deprecation_badge_visible(self, team_name: str) -> bool:
        try:
            name_el = self.page.get_by_text(team_name, exact=True).first
            name_el.wait_for(state="visible", timeout=10000)
            row = name_el.locator("xpath=ancestor::*[@role='link'][1]")
            return row.locator("[data-slot='badge'], span:has-text('Deprecated'), span:has-text('deprecated')").first.is_visible()
        except Exception as e:
            logger.warning(f"Could not check deprecation badge for {team_name}: {e}")
            return False
