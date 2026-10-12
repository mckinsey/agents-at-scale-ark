import random
from datetime import datetime

from .base_page import BasePage
from .dashboard_page import DashboardPage


class ResourceListPage(BasePage):
    """Shared behaviour for the dashboard's resource list pages.

    Every list page is the same shape - a table of named rows, per-row actions
    that open a confirmation dialog - so the row lookups and the dialog
    handling live here once. Subclasses set TABLE and ROW and keep only the
    selectors and flows that are actually their own.
    """

    TABLE = "table"
    ROW = "tbody tr"
    DIALOG = "[role='dialog']"
    # Subclasses set these to their own page's controls.
    OPEN_CREATE = "button:has-text('Create')"
    DELETE_ACTION = "button:has-text('Delete')"

    def generate_resource_name(self, prefix: str) -> str:
        """A name unique per run, so parallel xdist workers cannot collide."""
        stamp = datetime.now().strftime("%d%m%y%H%M%S")
        return f"{prefix}-{stamp}{random.randint(100, 999)}"

    def open_list(self, section: str, landmark: str, timeout: int = 20000) -> None:
        """Go to a list page and wait for the landmark that means it has rendered."""
        DashboardPage(self.page).navigate_to_section(section)
        self.wait_for_element(landmark, timeout=timeout)

    # --- rows --------------------------------------------------------------

    def _row(self, name: str):
        return self.page.locator(f"{self.ROW}:has-text('{name}')").first

    def listed_names(self) -> list[str]:
        """The first cell of every row, or [] when the page shows no table."""
        if not self.is_visible(self.TABLE, timeout=3000):
            return []
        return [
            row.locator("td").first.inner_text().strip()
            for row in self.page.locator(self.ROW).all()
        ]

    def wait_for_row(self, name: str, timeout: int = 20000) -> None:
        self.wait_for_element(f"{self.ROW}:has-text('{name}')", timeout=timeout)

    def wait_for_row_gone(self, name: str, timeout: int = 20000) -> None:
        self._row(name).wait_for(state="detached", timeout=timeout)

    def row_cells(self, name: str) -> list[str]:
        return [cell.strip() for cell in self._row(name).locator("td").all_inner_texts()]

    def click_row_action(self, name: str, action_selector: str) -> None:
        self._row(name).locator(action_selector).first.click()

    # --- dialogs -----------------------------------------------------------

    def open_dialog_from_row(self, name: str, action_selector: str) -> str:
        """Trigger a row action and return the text of the dialog it opens."""
        self.click_row_action(name, action_selector)
        dialog = self.wait_for_element(self.DIALOG, timeout=15000)
        self.wait_for_animations_complete(self.page.locator(self.DIALOG).first)
        return dialog.inner_text()

    def open_create_dialog(self) -> str:
        """Open the page's create dialog and return the text it shows."""
        self.page.locator(self.OPEN_CREATE).first.click()
        dialog = self.wait_for_element(self.DIALOG, timeout=15000)
        self.wait_for_animations_complete(self.page.locator(self.DIALOG).first)
        return dialog.inner_text()

    def open_delete_dialog(self, name: str) -> str:
        return self.open_dialog_from_row(name, self.DELETE_ACTION)

    def confirm_delete(self) -> None:
        self.confirm_dialog("Delete")

    def confirm_dialog(self, button_text: str) -> None:
        """Click a dialog's confirm button and wait for the dialog to close.

        Scoped to the dialog because the row that opened it usually carries a
        button with the same label.
        """
        self.page.locator(
            f"{self.DIALOG} button:has-text('{button_text}')"
        ).first.click()
        self.wait_for_modal_close()
