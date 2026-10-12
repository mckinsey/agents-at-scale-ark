"""The Ark dashboard's Workflow Templates screen and its Workflow Studio.

Distinct from WorkflowsPage, which drives the Argo UI: everything here is the
dashboard at /workflow-templates - the list of templates and the studio that
authors a template from YAML.
"""

import logging

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect

from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class WorkflowTemplatesPage(BasePage):

    CREATE_TEMPLATE_BUTTON = "button:has-text('Create workflow template')"
    TABLE = "table[aria-label='Workflow Templates']"

    DIALOG = "[data-slot='dialog-content']"
    DIALOG_SUBMIT_BUTTON = f"{DIALOG} button[type='submit']"

    TEMPLATE_NAME_INPUT = "[data-testid='workflow-name-input']"
    TEMPLATE_TITLE_INPUT = "[data-testid='workflow-title-input']"
    TEMPLATE_DESCRIPTION_INPUT = "[data-testid='workflow-description-input']"
    YAML_VIEW_BUTTON = "[data-testid='studio-view-yaml']"
    YAML_EDITOR = "[data-testid='studio-yaml-editor']"
    YAML_ERROR_BANNER = "[data-testid='studio-yaml-banner']"
    STUDIO_SAVE_BUTTON = "[data-testid='studio-save']"
    STUDIO_RUN_BUTTON = "[data-testid='studio-run']"

    RUN_NAME_INPUT = f"{DIALOG} #workflow-name"
    RUN_SEARCH_INPUT = "[data-testid='workflow-runs-search']"
    RUN_STATUS = "[data-testid='session-status']"

    def navigate_to_workflow_templates(self) -> None:
        """Open the list and wait for it to settle.

        Create is the one control the page shows in every state - loading, empty
        and populated - so it is what tells us the screen is up without assuming
        the cluster has any templates.
        """
        DashboardPage(self.page).navigate_to_section("workflow-templates")
        self.wait_for_element(self.CREATE_TEMPLATE_BUTTON, timeout=30000)

    def navigate_to_workflow_runs(self) -> None:
        """Open Monitoring > Workflow Runs."""
        DashboardPage(self.page).navigate_to_section("workflow-runs")
        self.wait_for_element(self.RUN_SEARCH_INPUT, timeout=30000)

    def _wait_for_dialog(self) -> None:
        self.wait_for_element(self.DIALOG)

    def _wait_for_dialog_closed(self) -> None:
        self.page.locator(self.DIALOG).first.wait_for(state="hidden")

    def wait_for_toasts_to_clear(self, timeout: int = 20000) -> None:
        """Wait out any toast before the next click.

        Toasts render top-right, over the studio's own buttons, and sonner holds
        a toast open for as long as the pointer is over it - which is exactly
        what a retrying Playwright click does - so the pointer is parked first.
        """
        self.page.mouse.move(0, 0)
        self.page.wait_for_function(
            "() => document.querySelectorAll('[data-sonner-toast]').length === 0",
            timeout=timeout,
        )

    def get_template_row_text(self, template_name: str) -> str:
        """Everything one template's row shows: its name, title and description."""
        self.wait_for_element(self.TABLE, timeout=30000)
        row = (
            self.page.locator(self.TABLE)
            .get_by_role("row")
            .filter(has=self.page.get_by_role("link", name=template_name, exact=True))
            .first
        )
        row.wait_for(timeout=30000)
        return row.inner_text()

    def open_studio_for_new_template(
        self, name: str, title: str, description: str
    ) -> None:
        """Start a new template from the list page and land in the studio."""
        self.page.locator(self.CREATE_TEMPLATE_BUTTON).click()
        self._wait_for_dialog()
        self.page.locator(self.TEMPLATE_NAME_INPUT).fill(name)
        self.page.locator(self.TEMPLATE_TITLE_INPUT).fill(title)
        self.page.locator(self.TEMPLATE_DESCRIPTION_INPUT).fill(description)
        self.page.locator(self.DIALOG_SUBMIT_BUTTON).click()
        self._wait_for_dialog_closed()
        self.wait_for_element(self.YAML_VIEW_BUTTON, timeout=30000)

    def write_yaml(self, manifest: str) -> None:
        self.page.locator(self.YAML_VIEW_BUTTON).click()
        editor = self.wait_for_element(self.YAML_EDITOR)
        editor.fill(manifest)

    def get_yaml_error(self) -> str:
        """What the editor reports about the current YAML, or "" if it reports nothing."""
        try:
            banner = self.wait_for_element(self.YAML_ERROR_BANNER)
        except PlaywrightTimeoutError:
            return ""
        return banner.inner_text()

    def is_save_enabled(self) -> bool:
        return self.page.locator(self.STUDIO_SAVE_BUTTON).is_enabled()

    def run_workflow(self, run_name: str) -> str:
        """Run the saved template under a chosen name; returns the toast shown.

        The run is named rather than left to the auto-generated
        "<template>-<timestamp>", so the run can be found again and cleaned up.
        """
        run_button = self.wait_for_element(self.STUDIO_RUN_BUTTON, timeout=30000)
        expect(run_button).to_be_enabled(timeout=30000)
        self.wait_for_toasts_to_clear()
        run_button.click()
        self._wait_for_dialog()
        self.page.locator(self.RUN_NAME_INPUT).fill(run_name)
        self.page.locator(self.DIALOG_SUBMIT_BUTTON).click()
        self._wait_for_dialog_closed()
        toast = self.wait_for_element(self.POPUP, timeout=30000)
        message = toast.inner_text()
        logger.info("Workflow run toast: %s", message.replace("\n", " "))
        return message

    def get_workflow_run_status(self, run_name: str) -> str:
        """The status the Workflow Runs list shows for one run."""
        self.page.locator(self.RUN_SEARCH_INPUT).fill(run_name)
        card = self.wait_for_element(
            f"button:has(span:text-is('{run_name}'))", timeout=30000
        )
        return card.locator(self.RUN_STATUS).first.get_attribute("data-status")

    def save_template(self) -> str:
        """Save the studio draft and return the toast the dashboard showed."""
        self.page.locator(self.STUDIO_SAVE_BUTTON).click()
        toast = self.wait_for_element(self.POPUP, timeout=30000)
        message = toast.inner_text()
        logger.info("Studio save toast: %s", message.replace("\n", " "))
        return message
