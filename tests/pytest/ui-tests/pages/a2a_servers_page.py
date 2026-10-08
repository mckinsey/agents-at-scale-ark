from .resource_list_page import ResourceListPage


class A2AServersPage(ResourceListPage):
    """The A2A servers list and the dialog behind Create A2A server.

    Like the API keys page, the create action is labelled 'Create A2A server'
    in the header but plain 'Create' in the empty state, and the dialog's
    submit is also 'Create' - so dialog controls are scoped to the dialog.
    """

    TABLE = "table[aria-label='A2A servers']"
    ROW = "table[aria-label='A2A servers'] tbody tr"

    NAME_INPUT = "[role='dialog'] input[placeholder='e.g., deep-research']"
    DESCRIPTION_INPUT = "[role='dialog'] input[placeholder='what this server does']"
    ADDRESS_INPUT = "[role='dialog'] input[placeholder^='https://agentspace-a2a']"
    DIALOG_SUBMIT = "[role='dialog'] button[type='submit']"

    EVENTS_ACTION = "button[aria-label='See events']"
    DELETE_ACTION = "button[aria-label='Delete A2A server']"

    def navigate_to_a2a_servers(self) -> None:
        self.open_list("a2a", self.OPEN_CREATE)

    # --- create ------------------------------------------------------------

    def submit_create_dialog(
        self, name: str, address: str, description: str | None = None
    ) -> None:
        self.page.locator(self.NAME_INPUT).first.fill(name)
        if description is not None:
            self.page.locator(self.DESCRIPTION_INPUT).first.fill(description)
        self.page.locator(self.ADDRESS_INPUT).first.fill(address)
        self.page.locator(self.DIALOG_SUBMIT).first.click()
        self.wait_for_modal_close()

    # --- row actions -------------------------------------------------------

    def open_events_for(self, name: str) -> None:
        """Follow the row's See events link.

        The dashboard routes this client-side, so the document never reloads
        and a load-state wait returns before the URL has changed; the URL
        itself is the only thing that settles.
        """
        self.click_row_action(name, self.EVENTS_ACTION)
        self.page.wait_for_url("**/events*", timeout=15000)
