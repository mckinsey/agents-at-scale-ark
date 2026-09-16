"""The Ark dashboard's Workflow Templates screen and its Workflow Studio.

Distinct from WorkflowsPage, which drives the Argo UI: everything here is the
dashboard at /workflow-templates - the group layout on the list page and the
studio that authors a template from YAML.
"""

import logging

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import expect

from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class WorkflowTemplatesPage(BasePage):

    ADD_GROUP_BUTTON = "[data-testid='workflow-add-group']"
    CREATE_TEMPLATE_BUTTON = "button:has-text('Create workflow template')"
    GROUP_CARD = "[data-testid^='section-card-']"
    GROUP_HEADING = "h2"
    GROUP_DESCRIPTION = "h2 + p"
    ROW = "[data-testid^='sortable-row-']"
    ROW_DRAG_HANDLE = "button[aria-label^='Reorder']"

    DIALOG = "[data-slot='dialog-content']"
    DIALOG_TITLE = f"{DIALOG} [data-slot='dialog-title']"
    DIALOG_DESCRIPTION = f"{DIALOG} [data-slot='dialog-description']"
    DIALOG_NAME_INPUT = f"{DIALOG} input"
    DIALOG_DESCRIPTION_INPUT = f"{DIALOG} textarea"
    DIALOG_SUBMIT_BUTTON = f"{DIALOG} button[type='submit']"
    CONFIRM_DELETE_BUTTON = f"{DIALOG} button:has-text('Delete')"

    TEMPLATE_NAME_INPUT = "[data-testid='workflow-name-input']"
    TEMPLATE_TITLE_INPUT = "[data-testid='workflow-title-input']"
    TEMPLATE_DESCRIPTION_INPUT = "[data-testid='workflow-description-input']"
    YAML_VIEW_BUTTON = "[data-testid='studio-view-yaml']"
    YAML_EDITOR = "[data-testid='studio-yaml-editor']"
    YAML_ERROR_BANNER = "[data-testid='studio-yaml-banner']"
    STUDIO_SAVE_BUTTON = "[data-testid='studio-save']"
    STUDIO_RUN_BUTTON = "[data-testid='studio-run']"

    RUN_NAME_INPUT = f"{DIALOG} #workflow-name"
    RUN_SEARCH_INPUT = "input[placeholder*='Search workflows']"
    RUN_STATUS_BADGE = "[data-slot='badge']"

    def navigate_to_workflow_templates(self) -> None:
        DashboardPage(self.page).navigate_to_section("workflow-templates")
        self.wait_for_element(self.ADD_GROUP_BUTTON, timeout=30000)

    def navigate_to_workflow_runs(self) -> None:
        """Open Monitoring > Workflow Runs."""
        DashboardPage(self.page).navigate_to_section("workflow-runs")
        self.wait_for_element(self.RUN_SEARCH_INPUT, timeout=30000)

    def _group_selector(self, group_name: str) -> str:
        return f"{self.GROUP_CARD}:has({self.GROUP_HEADING}:text-is('{group_name}'))"

    def _row_selector(self, template_name: str) -> str:
        return f"[data-testid='sortable-row-{template_name}']"

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

    def wait_for_template_row(self, template_name: str) -> None:
        self.wait_for_element(self._row_selector(template_name), timeout=30000)

    def wait_for_group(self, group_name: str) -> None:
        self.wait_for_element(self._group_selector(group_name))

    def get_template_row_text(self, template_name: str) -> str:
        """Everything one template's row shows: its name, title and description."""
        row = self.wait_for_element(self._row_selector(template_name), timeout=30000)
        return row.inner_text()

    def listed_template_names(self) -> list[str]:
        """Every template listed on the page, grouped or not."""
        return self.page.eval_on_selector_all(
            self.ROW,
            "rows => rows.map(row => row.dataset.testid.replace('sortable-row-', ''))",
        )

    def group_names(self) -> list[str]:
        return [
            name.strip()
            for name in self.page.locator(
                f"{self.GROUP_CARD} {self.GROUP_HEADING}"
            ).all_inner_texts()
        ]

    def get_group_description(self, group_name: str) -> str:
        return (
            self.page.locator(self._group_selector(group_name))
            .locator(self.GROUP_DESCRIPTION)
            .first.inner_text()
            .strip()
        )

    def group_member_names(self, group_name: str) -> list[str]:
        """The templates shown inside one group card."""
        return self.page.eval_on_selector_all(
            f"{self._group_selector(group_name)} {self.ROW}",
            "rows => rows.map(row => row.dataset.testid.replace('sortable-row-', ''))",
        )

    def open_edit_group_dialog(self, group_name: str) -> None:
        self.page.locator(f"button[aria-label='Edit group {group_name}']").click()
        self.wait_for_element(self.DIALOG_NAME_INPUT)

    def get_group_dialog_values(self) -> dict[str, str]:
        """What the open group dialog is prefilled with."""
        return {
            "title": self.page.locator(self.DIALOG_TITLE).inner_text().strip(),
            "name": self.page.locator(self.DIALOG_NAME_INPUT).input_value(),
            "description": self.page.locator(
                self.DIALOG_DESCRIPTION_INPUT
            ).input_value(),
        }

    def submit_group_dialog(self, name: str, description: str) -> None:
        self.page.locator(self.DIALOG_NAME_INPUT).fill(name)
        self.page.locator(self.DIALOG_DESCRIPTION_INPUT).fill(description)
        self.page.locator(self.DIALOG_SUBMIT_BUTTON).click()
        self._wait_for_dialog_closed()

    def create_group(self, name: str, description: str) -> None:
        self.page.locator(self.ADD_GROUP_BUTTON).click()
        self.wait_for_element(self.DIALOG_NAME_INPUT)
        self.submit_group_dialog(name, description)
        self.wait_for_group(name)

    def open_delete_group_dialog(self, group_name: str) -> str:
        """Open the delete confirmation and return what it warns will happen."""
        self.page.locator(f"button[aria-label='Delete group {group_name}']").click()
        self._wait_for_dialog()
        return self.page.locator(self.DIALOG_DESCRIPTION).inner_text().strip()

    def confirm_delete_group(self, group_name: str) -> None:
        self.page.locator(self.CONFIRM_DELETE_BUTTON).click()
        self._wait_for_dialog_closed()
        self.page.locator(self._group_selector(group_name)).wait_for(state="detached")

    def drag_template_into_group(self, template_name: str, group_name: str) -> None:
        """Drag a template row onto a group's drop zone and wait for it to land.

        Both ends of the drag have to be on screen first: a drag that makes the
        page scroll leaves the pointer over whichever row slid under it, and the
        list reorders on hover, so the wrong template gets grouped.
        """
        group_selector = self._group_selector(group_name)
        card_testid = self.page.locator(group_selector).get_attribute("data-testid")
        drop_zone = self.page.locator(
            f"[data-testid='drop-zone-{card_testid.removeprefix('section-card-')}']"
        )
        handle = self.page.locator(
            f"{self._row_selector(template_name)} {self.ROW_DRAG_HANDLE}"
        )

        handle.evaluate("row => row.scrollIntoView({block: 'end', behavior: 'instant'})")
        viewport_height = self.page.evaluate("window.innerHeight")
        handle_box = handle.bounding_box()
        zone_box = drop_zone.bounding_box()

        on_screen = (
            zone_box["y"] >= 0
            and handle_box["y"] + handle_box["height"] <= viewport_height
        )
        assert on_screen, (
            f"the group {group_name!r} and the row for {template_name} do not fit on "
            f"screen together (drop zone at y={zone_box['y']:.0f}, row ends at "
            f"y={handle_box['y'] + handle_box['height']:.0f}, viewport {viewport_height}px), "
            "so the drag would scroll and group the wrong template"
        )

        handle.drag_to(drop_zone)
        self.wait_for_element(f"{group_selector} {self._row_selector(template_name)}")

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
        return card.locator(self.RUN_STATUS_BADGE).first.inner_text().strip()

    def save_template(self) -> str:
        """Save the studio draft and return the toast the dashboard showed."""
        self.page.locator(self.STUDIO_SAVE_BUTTON).click()
        toast = self.wait_for_element(self.POPUP, timeout=30000)
        message = toast.inner_text()
        logger.info("Studio save toast: %s", message.replace("\n", " "))
        return message
