from .resource_list_page import ResourceListPage


class ConfigurationsPage(ResourceListPage):
    """The Configurations list and the form behind Add configuration.

    The page has one create affordance in both states - the header carries it
    once rows exist, the empty state carries it before then - so the same
    selector works throughout and doubles as the landmark to wait on.
    """

    ADD_BUTTON = "button:has-text('Add configuration')"
    TABLE = "table[aria-label='Configurations']"
    ROW = "table[aria-label='Configurations'] tbody tr"
    NO_RESULTS = "No configurations match your search."
    SEARCH_INPUT = "input[placeholder='Search']"

    NAME_INPUT = "input[placeholder='e.g., mcp-server-url']"
    DESCRIPTION_INPUT = (
        "input[placeholder='e.g., Base URL of the MCP server for this environment']"
    )
    VALUE_INPUT = "textarea[placeholder='e.g., https://mcp.example.com']"

    DIALOG = "[role='alertdialog']"
    EDIT_ACTION = "button[aria-label='Edit configuration']"
    DELETE_ACTION = "button[aria-label='Delete configuration']"
    CHECKING_REFERENCES = "text=Checking which resources use it..."

    def navigate_to_configurations(self) -> None:
        self.open_list("configurations", self.ADD_BUTTON)

    # --- the create / edit form -------------------------------------------

    def open_create_form(self) -> None:
        self.page.locator(self.ADD_BUTTON).first.click()
        self.wait_for_element(self.NAME_INPUT, timeout=20000)

    def open_edit_form(self, name: str) -> None:
        self.click_row_action(name, self.EDIT_ACTION)
        self.wait_for_element(self.VALUE_INPUT, timeout=20000)

    def form_heading(self) -> str:
        return self.page.locator("h1").first.inner_text().strip()

    def get_form_values(self) -> dict:
        return {
            "name": self.page.locator(self.NAME_INPUT).first.input_value(),
            "description": self.page.locator(self.DESCRIPTION_INPUT).first.input_value(),
            "value": self.page.locator(self.VALUE_INPUT).first.input_value(),
        }

    def name_field_is_editable(self) -> bool:
        return self.page.locator(self.NAME_INPUT).first.is_enabled()

    def fill_form(
        self, name: str | None = None, value: str | None = None,
        description: str | None = None,
    ) -> None:
        if name is not None:
            self.page.locator(self.NAME_INPUT).first.fill(name)
        if description is not None:
            self.page.locator(self.DESCRIPTION_INPUT).first.fill(description)
        if value is not None:
            self.page.locator(self.VALUE_INPUT).first.fill(value)

    def submit_form(self, label: str) -> None:
        """Submit with the form's own label - Create when new, Save when editing."""
        self.page.locator(f"button:has-text('{label}')").first.click()
        self.wait_for_element(self.ADD_BUTTON, timeout=20000)

    # --- search ------------------------------------------------------------

    def search(self, query: str) -> None:
        self.page.locator(self.SEARCH_INPUT).first.fill(query)

    def is_no_results_shown(self) -> bool:
        return self.is_visible(f"text={self.NO_RESULTS}", timeout=5000)

    # --- delete ------------------------------------------------------------

    def open_delete_dialog(self, name: str) -> str:
        """Open the row's delete confirmation once its reference check settles.

        The dialog looks up which resources still read the configuration, so
        its text is incomplete until that spinner goes away.
        """
        text = super().open_delete_dialog(name)
        self.wait_for_element_hidden(self.CHECKING_REFERENCES, timeout=15000)
        return text
