import logging

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from .base_page import BasePage

logger = logging.getLogger(__name__)


class HitlApprovalsPage(BasePage):
    """The tool-approval card the dashboard renders inside a conversation.

    Ark parks a query in the input-required phase when an agent calls a tool
    whose approval is required, and this card is what the human acts on. One
    card is rendered per pending tool call, and only the last of them carries
    the Approve/Reject buttons.
    """

    # A card is the only thing on the page pairing a bold tool name with a
    # collapsed "Input" section. Anchoring on that rather than on the card's
    # background classes, which differ per decision and expiry state.
    TOOL_CARD = "div.rounded-lg:has(> div > span.font-semibold):has(button:has-text('Input'))"

    # All relative to a card.
    TOOL_NAME = "span.font-semibold"
    INPUT_TOGGLE = "button:has-text('Input')"
    TOOL_INPUT = "pre"
    APPROVE_BUTTON = "button:has-text('Approve')"
    REJECT_BUTTON = "button:has-text('Reject')"
    EXPIRED_NOTICE = "span:has-text('Approval expired')"

    def _cards(self):
        return self.page.locator(self.TOOL_CARD)

    def _in_card(self, selector: str):
        return self._cards().locator(selector)

    def wait_for_approval_request(self, timeout: int = 120000) -> None:
        self.wait_for_element(self.TOOL_CARD, timeout=timeout)

    def get_requested_tool_names(self) -> list[str]:
        return [name.strip() for name in self._in_card(self.TOOL_NAME).all_inner_texts()]

    def get_tool_input(self, timeout: int = 10000) -> str:
        """Expand the collapsed Input section and return the arguments shown."""
        toggle = self._in_card(self.INPUT_TOGGLE).last
        toggle.wait_for(state="visible", timeout=timeout)
        toggle.click()
        arguments = self._in_card(self.TOOL_INPUT).last
        arguments.wait_for(state="visible", timeout=timeout)
        return arguments.inner_text()

    def approve(self, timeout: int = 10000) -> None:
        button = self._in_card(self.APPROVE_BUTTON).last
        button.wait_for(state="visible", timeout=timeout)
        button.click()

    def reject(self, timeout: int = 10000) -> None:
        button = self._in_card(self.REJECT_BUTTON).last
        button.wait_for(state="visible", timeout=timeout)
        button.click()

    def is_decision_offered(self) -> bool:
        """Whether a card is still offering both Approve and Reject."""
        return (
            self._in_card(self.APPROVE_BUTTON).count() > 0
            and self._in_card(self.REJECT_BUTTON).count() > 0
        )

    def wait_for_expiry_notice(self, timeout: int = 60000) -> bool:
        try:
            self._in_card(self.EXPIRED_NOTICE).first.wait_for(state="visible", timeout=timeout)
            return True
        except PlaywrightTimeoutError:
            logger.warning("Approval did not show an expiry notice within %dms", timeout)
            self._capture_failure_debug("approval_expiry_notice_missing")
            return False

    def wait_for_decision_recorded(self, timeout: int = 30000) -> bool:
        """Wait until the card stops offering a decision, i.e. one was taken."""
        try:
            self._in_card(self.APPROVE_BUTTON).first.wait_for(state="hidden", timeout=timeout)
            return True
        except PlaywrightTimeoutError:
            logger.warning("Approve button still offered %dms after deciding", timeout)
            self._capture_failure_debug("approval_decision_not_recorded")
            return False
