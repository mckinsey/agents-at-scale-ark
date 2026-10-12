from .resource_list_page import ResourceListPage


class APIKeysPage(ResourceListPage):
    """The API keys list, its create dialog, and the one-time secret dialog.

    The page labels the same action two ways - 'Create API Key' in the header
    once rows exist, plain 'Create' in the empty state - and the create
    dialog's submit repeats the header's wording, so every dialog control here
    is scoped to the dialog to keep the two apart.
    """

    NAME_INPUT = "[role='dialog'] input[placeholder='Enter a descriptive name']"
    DIALOG_SUBMIT = "[role='dialog'] button[type='submit']"

    SUCCESS_DIALOG = "[role='dialog']:has-text('API Key Created Successfully')"
    PUBLIC_KEY_FIELD = "#public-key"
    SECRET_KEY_FIELD = "#secret-key"

    COPY_ACTION_TEMPLATE = "button[aria-label='Copy public key for {name}']"
    COPIED_BUTTON = "button[aria-label='Public key copied']"
    REVOKE_ACTION = "button:has-text('Revoke')"

    def navigate_to_api_keys(self) -> None:
        self.open_list("api-keys", self.OPEN_CREATE)

    # --- create ------------------------------------------------------------

    def submit_create_dialog(self, name: str) -> None:
        self.page.locator(self.NAME_INPUT).first.fill(name)
        self.page.locator(self.DIALOG_SUBMIT).first.click()

    def wait_for_created_dialog(self, timeout: int = 20000) -> None:
        self.wait_for_element(self.SUCCESS_DIALOG, timeout=timeout)
        self.wait_for_animations_complete(self.page.locator(self.SUCCESS_DIALOG).first)

    def created_credentials(self) -> dict:
        """The public and secret keys the one-time dialog is showing."""
        return {
            "public_key": self.page.locator(self.PUBLIC_KEY_FIELD).first.input_value(),
            "secret_key": self.page.locator(self.SECRET_KEY_FIELD).first.input_value(),
        }

    def dismiss_created_dialog(self) -> None:
        self.confirm_dialog("Done")

    # --- row actions -------------------------------------------------------

    def copy_public_key(self, name: str) -> None:
        self.click_row_action(name, self.COPY_ACTION_TEMPLATE.format(name=name))

    def is_copy_confirmed(self, name: str) -> bool:
        """Whether the row's copy button has flipped to its copied label.

        Asserted instead of the clipboard itself, which headless Chromium gates
        behind a permission the suite does not grant.
        """
        return self.is_visible(
            f"{self.ROW}:has-text('{name}') {self.COPIED_BUTTON}", timeout=5000
        )

    def open_revoke_dialog(self, name: str) -> str:
        return self.open_dialog_from_row(name, self.REVOKE_ACTION)

    def confirm_revoke(self) -> None:
        self.confirm_dialog("Revoke")
