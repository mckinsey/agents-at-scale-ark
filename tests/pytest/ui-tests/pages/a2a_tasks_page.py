import logging
import time

from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)

# The column has been called both over the dashboard's life, and the column
# order has changed too, so the cell is found by header rather than by index.
STATUS_HEADERS = ("Status", "Phase")


class A2ATasksPage(BasePage):
    """The A2A Tasks list, where a pending approval shows as 'Input required'."""

    TASKS_TABLE = "table"
    HEADER_CELL = "thead th"
    ROW = "tbody tr"

    def navigate_to_tasks_tab(self) -> None:
        DashboardPage(self.page).navigate_to_section("tasks")
        self.wait_for_element(self.TASKS_TABLE, timeout=15000)

    def _status_column_index(self) -> int:
        headers = [header.strip() for header in self.page.locator(self.HEADER_CELL).all_inner_texts()]
        for index, header in enumerate(headers):
            if header in STATUS_HEADERS:
                return index
        raise AssertionError(
            f"the tasks table has no {' or '.join(STATUS_HEADERS)} column; headers were {headers}"
        )

    def get_task_status(self, task_name: str) -> str:
        row = self.page.locator(f"{self.ROW}:has-text('{task_name}')").first
        if row.count() == 0:
            return ""
        return row.locator("td").nth(self._status_column_index()).inner_text().strip()

    def wait_for_task_status(self, task_name: str, status: str, timeout_s: int = 60) -> str:
        """Reload the list until the task shows the wanted status, or time out.

        The list has no live updates, so a reload is the only way to pick up a
        phase change; the last status seen is returned for the assertion message.
        """
        deadline = time.time() + timeout_s
        current = ""
        while time.time() < deadline:
            current = self.get_task_status(task_name)
            if current == status:
                return current
            self.page.wait_for_timeout(1000)
            self.page.reload()
            self.wait_for_element(self.TASKS_TABLE, timeout=15000)
        logger.warning("Task %s showed %r, wanted %r", task_name, current, status)
        return current
