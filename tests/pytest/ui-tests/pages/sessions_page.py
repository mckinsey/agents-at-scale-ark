import logging
import re
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from .base_page import BasePage
from .dashboard_page import DashboardPage

logger = logging.getLogger(__name__)


class SessionsPage(BasePage):

    NEW_SESSION_BUTTON = "button:has-text('New session')"
    SESSION_DIALOG = "[role='dialog']:has-text('Create new session')"
    DIALOG_SEARCH_INPUT = "[role='dialog'] input[placeholder*='Search']"
    DIALOG_CREATE_BUTTON = "[role='dialog'] button:has-text('Create')"
    DIALOG_CANCEL_BUTTON = "[role='dialog'] button:has-text('Cancel')"
    BACK_TO_SESSIONS_BUTTON = "button:has-text('Back to all sessions')"
    HISTORY_TAB = "[role='tab']:has-text('History')"
    CONVERSATION_SIDEBAR = "div.space-y-3.overflow-y-auto"
    CONVERSATION_SIDEBAR_ITEM = "div.space-y-3.overflow-y-auto button"
    CHAT_TEXTAREA = "textarea[placeholder*='Message']"
    USER_MESSAGE = "div.flex-1.space-y-4 div.flex.flex-col.gap-2.items-end"
    ASSISTANT_MESSAGE = "div.flex-1.space-y-4 div.flex.flex-col.gap-2.items-start"
    SESSION_STATS_BAR = "div.flex.items-center.gap-6.rounded-lg.border.bg-muted"
    SESSION_STATS_TOTAL = "div.flex.items-center.gap-1:has(span:has-text('Sessions')) span.font-medium"
    NEW_CONVERSATION_DIALOG = "[role='dialog']:has-text('Start New Conversation')"

    def navigate_to_session_history(self) -> None:
        dashboard = DashboardPage(self.page)
        dashboard.navigate_to_section("session-history")
        self.wait_for_load_state("domcontentloaded")
        self.wait_for_navigation_complete()

    def open_new_session_dialog(self) -> None:
        btn = self.wait_for_element(self.NEW_SESSION_BUTTON, timeout=10000)
        btn.click()
        self.wait_for_modal_open()

    def select_participant_in_dialog(self, participant_name: str, participant_tab: str = "All") -> None:
        try:
            self.page.wait_for_selector(
                "[role='dialog'] div:has-text('Loading participants...')",
                state="hidden",
                timeout=10000,
            )
        except PlaywrightTimeoutError:
            pass

        if participant_tab != "All":
            try:
                tab = self.page.locator(f"[role='dialog'] [role='tab']:has-text('{participant_tab}')").first
                if tab.is_visible(timeout=2000):
                    tab.click()
                    tab.wait_for(state="attached")
            except PlaywrightTimeoutError:
                logger.info("Could not click tab %s, using default", participant_tab)

        try:
            search = self.page.locator(self.DIALOG_SEARCH_INPUT).first
            if search.is_visible(timeout=2000):
                search.fill(participant_name)
        except PlaywrightTimeoutError:
            logger.info("Could not fill search input")

        participant_item = self.page.locator(
            f"[role='dialog'] label:has-text('{participant_name}'), "
            f"[role='dialog'] div.font-medium:has-text('{participant_name}')"
        ).first
        participant_item.wait_for(state="visible", timeout=10000)
        participant_item.click()

    def confirm_create_session(self) -> str:
        create_btn = self.page.locator(self.DIALOG_CREATE_BUTTON).first
        create_btn.wait_for(state="visible", timeout=5000)
        create_btn.click()
        try:
            self.page.wait_for_url("**/sessions/**", timeout=10000)
        except PlaywrightTimeoutError:
            raise AssertionError(
                f"Session creation failed — URL did not change to /sessions/*. Current: {self.page.url}"
            )
        return self.get_session_id_from_url()

    def get_session_id_from_url(self) -> str:
        match = re.search(r"/sessions/([^/?#]+)", self.page.url)
        return match.group(1) if match else ""

    def wait_for_session_detail_page(self, timeout: int = 15000) -> None:
        self.wait_for_navigation_complete(timeout=timeout)
        self.wait_for_element(self.BACK_TO_SESSIONS_BUTTON, timeout=timeout)

    def get_conversation_count_from_header(self) -> int:
        try:
            section = self.page.locator(
                "div.flex.items-center.gap-1:has(span:has-text('Conversations'))"
            ).first
            if section.is_visible(timeout=3000):
                text = section.inner_text()
                numbers = re.findall(r"\d+", text)
                if numbers:
                    return int(numbers[0])
        except Exception as e:
            logger.warning("Could not get conversation count: %s", e)
        return 0

    def get_participants_count_from_header(self) -> int:
        try:
            section = self.page.locator(
                "div.flex.items-center.gap-1:has(span:has-text('Participants'))"
            ).first
            if section.is_visible(timeout=3000):
                text = section.inner_text()
                numbers = re.findall(r"\d+", text)
                if numbers:
                    return int(numbers[0])
        except Exception as e:
            logger.warning("Could not get participants count: %s", e)
        return 0

    def is_participant_shown_in_header(self, participant_name: str) -> bool:
        try:
            badge = self.page.locator(
                f"div.rounded-lg.bg-card span:has-text('{participant_name}')"
            ).first
            return badge.is_visible(timeout=5000)
        except Exception:
            return False

    def send_message_in_conversation(self, message: str) -> None:
        initial_count = self.get_user_message_count()
        textarea = self.page.locator(self.CHAT_TEXTAREA).first
        textarea.wait_for(state="visible", timeout=10000)
        textarea.click()
        textarea.fill(message)
        textarea.press("Enter")
        start = time.time()
        while time.time() - start < 10:
            if self.get_user_message_count() > initial_count:
                return
            self.page.wait_for_timeout(200)

    def wait_for_assistant_response(self, initial_count: int = 0, timeout_s: int = 90) -> bool:
        start = time.time()
        while time.time() - start < timeout_s:
            try:
                count = self.page.locator(self.ASSISTANT_MESSAGE).count()
                if count > initial_count:
                    self.page.wait_for_timeout(500)
                    return True
            except Exception:
                pass
            self.page.wait_for_timeout(500)
        return False

    def get_user_message_count(self) -> int:
        return self.page.locator(self.USER_MESSAGE).count()

    def get_assistant_message_count(self) -> int:
        return self.page.locator(self.ASSISTANT_MESSAGE).count()

    def get_sidebar_conversation_count(self) -> int:
        try:
            sidebar = self.page.locator(self.CONVERSATION_SIDEBAR).first
            if sidebar.is_visible(timeout=3000):
                return sidebar.locator("button").count()
        except Exception:
            pass
        return 0

    def is_participant_in_conversation_sidebar(self, participant_name: str) -> bool:
        try:
            item = self.page.locator(
                f"div.space-y-3 button span.font-medium:has-text('{participant_name}')"
            ).first
            return item.is_visible(timeout=5000)
        except Exception:
            return False

    def wait_for_conversation_in_sidebar(self, participant_name: str, timeout_s: int = 30) -> bool:
        start = time.time()
        while time.time() - start < timeout_s:
            if self.is_participant_in_conversation_sidebar(participant_name):
                return True
            self.page.wait_for_timeout(1000)
        return False

    def navigate_back_to_sessions(self) -> None:
        back_btn = self.page.locator(self.BACK_TO_SESSIONS_BUTTON).first
        back_btn.wait_for(state="visible", timeout=5000)
        back_btn.click()
        self.wait_for_navigation_complete()

    def is_session_in_table(self, session_id: str, retries: int = 5) -> bool:
        for attempt in range(retries):
            try:
                self.page.get_by_text(session_id, exact=False).first.wait_for(
                    state="visible", timeout=10000
                )
                return True
            except Exception:
                if attempt < retries - 1:
                    logger.info("Session not found, retrying (%d/%d)...", attempt + 1, retries)
                    self.page.reload()
                    self.wait_for_navigation_complete()
        return False

    def get_stats_total_session_count(self, retries: int = 8) -> int:
        for attempt in range(retries):
            try:
                span = self.page.locator(self.SESSION_STATS_TOTAL).first
                if span.is_visible(timeout=5000):
                    text = span.inner_text().strip()
                    if text.isdigit() and int(text) > 0:
                        return int(text)
            except Exception as e:
                logger.warning("Could not get stats session count (attempt %d): %s", attempt + 1, e)
            if attempt < retries - 1:
                self.page.wait_for_timeout(1500)
        return 0

    def create_new_session(self, participant_name: str, participant_tab: str = "All") -> str:
        self.open_new_session_dialog()
        self.select_participant_in_dialog(participant_name, participant_tab)
        return self.confirm_create_session()

    def click_conversations_tab(self) -> None:
        try:
            history_tab = self.page.locator(self.HISTORY_TAB).first
            if history_tab.is_visible(timeout=3000):
                history_tab.click()
        except PlaywrightTimeoutError:
            pass
        try:
            self.page.locator(self.CONVERSATION_SIDEBAR_ITEM).first.wait_for(state="visible", timeout=5000)
        except PlaywrightTimeoutError:
            pass

    def wait_for_conversations_tab_content(self, timeout: int = 10000) -> None:
        try:
            self.wait_for_element(self.CONVERSATION_SIDEBAR, timeout=timeout)
        except Exception:
            logger.warning("Conversation sidebar not found")

    def set_status_filter(self, status: str) -> None:
        trigger = self.page.locator(
            "div.flex.flex-col.gap-1\\.5:has(span:has-text('Status')) button[role='combobox']"
        ).first
        trigger.wait_for(state="visible", timeout=5000)
        trigger.click()
        self.page.wait_for_timeout(400)
        option = self.page.locator(f"[role='option']:has-text('{status}')").first
        option.wait_for(state="visible", timeout=5000)
        option.click()
        self.page.wait_for_timeout(500)

    def get_visible_session_count(self) -> int:
        try:
            try:
                self.page.wait_for_selector(
                    "div.rounded-lg button[aria-pressed], div.py-12.text-center:has-text('No sessions found')",
                    timeout=10000,
                )
            except Exception:
                pass
            rows = self.page.locator(
                "div.rounded-lg button[type='button'][aria-pressed]"
            )
            count = rows.count()
            if count > 0:
                return count
            rows = self.page.locator(
                "div.rounded-lg > button[type='button']"
            )
            return rows.count()
        except Exception as e:
            logger.warning("Could not get visible session count: %s", e)
        return 0

    def search_sessions(self, query: str) -> None:
        try:
            search = self.page.locator(
                "input[type='search'][placeholder='Search'], input[placeholder='Search']"
            ).first
            search.wait_for(state="visible", timeout=5000)
            search.fill(query)
            self.page.wait_for_timeout(1200)
        except Exception as e:
            logger.warning("Could not search sessions: %s", e)

    def clear_search(self) -> None:
        try:
            search = self.page.locator(
                "input[type='search'][placeholder='Search'], input[placeholder='Search']"
            ).first
            if search.is_visible(timeout=3000):
                search.fill("")
                self.page.wait_for_timeout(400)
        except Exception as e:
            logger.warning("Could not clear search: %s", e)

    def navigate_to_session_detail(self, session_id: str) -> None:
        try:
            row = self.page.locator(
                f"button[aria-pressed]:has-text('{session_id}'), "
                f"button[type='button']:has-text('{session_id}')"
            ).first
            row.wait_for(state="visible", timeout=5000)
            row.click()
            self.wait_for_navigation_complete()
            self.wait_for_session_detail_page()
        except Exception as e:
            logger.warning("Could not navigate to session detail for %s: %s", session_id, e)

    def get_session_status_in_table(self, session_id: str) -> str:
        try:
            row = self.page.locator(
                f"button[type='button']:has-text('{session_id}')"
            ).first
            if row.is_visible(timeout=5000):
                active_dot = row.locator("span.bg-blue-500")
                idle_dot = row.locator("span.bg-gray-400")
                error_dot = row.locator("span.bg-red-500")
                if active_dot.count() > 0:
                    return "active"
                if idle_dot.count() > 0:
                    return "idle"
                if error_dot.count() > 0:
                    return "error"
        except Exception as e:
            logger.warning("Could not get session status for %s: %s", session_id, e)
        return ""

    def get_session_conversation_count_in_table(self, session_id: str, retries: int = 5) -> int:
        for attempt in range(retries):
            try:
                row = self.page.locator(
                    f"button[type='button']:has-text('{session_id}')"
                ).first
                if row.is_visible(timeout=5000):
                    row_text = row.inner_text()
                    for token in row_text.split():
                        token = token.strip()
                        if token.isdigit() and token not in session_id:
                            count = int(token)
                            if count > 0:
                                return count
            except Exception as e:
                logger.warning("Could not get conversation count for %s (attempt %d): %s", session_id, attempt + 1, e)
            if attempt < retries - 1:
                self.page.reload()
                self.wait_for_navigation_complete()
        return 0

    def cancel_session_dialog(self) -> None:
        cancel = self.page.locator("[role='dialog'] button:has-text('Cancel')").first
        cancel.wait_for(state="visible", timeout=5000)
        cancel.click()
        self.wait_for_modal_close()

    def is_create_button_disabled(self) -> bool:
        try:
            btn = self.page.locator(self.DIALOG_CREATE_BUTTON).first
            btn.wait_for(state="visible", timeout=5000)
            return btn.is_disabled()
        except PlaywrightTimeoutError:
            return True

    def click_new_conversation_button(self) -> None:
        btn = self.page.locator(
            "button:has(svg.lucide-plus), button[class*='size-6']:has(svg)"
        ).first
        btn.wait_for(state="visible", timeout=8000)
        btn.click()
        self.wait_for_modal_open()

    def confirm_new_conversation(self) -> None:
        if not self.is_visible(self.NEW_CONVERSATION_DIALOG, timeout=2000):
            return
        btn = self.page.locator(
            f"{self.NEW_CONVERSATION_DIALOG} button[type='submit'], "
            f"{self.NEW_CONVERSATION_DIALOG} button:not(:has-text('Cancel'))"
        ).first
        try:
            btn.wait_for(state="visible", timeout=5000)
            btn.click(force=True)
        except PlaywrightTimeoutError:
            logger.warning("Could not find confirm button in new conversation dialog")

    def click_sort_header(self, field: str) -> None:
        try:
            header = self.page.locator(
                f"div.grid button:has-text('{field}')"
            ).first
            header.wait_for(state="visible", timeout=5000)
            header.click()
            self.page.wait_for_timeout(500)
        except Exception as e:
            logger.warning("Could not click sort header %s: %s", field, e)

    def is_empty_state_shown(self) -> bool:
        try:
            empty = self.page.locator(
                "div.py-12.text-center:has-text('No sessions found')"
            ).first
            return empty.is_visible(timeout=8000)
        except Exception:
            return False

    def get_sidebar_selected_conversation_message_count(self) -> int:
        try:
            selected = self.page.locator(
                "div.space-y-3 button.bg-muted span.flex.items-center.gap-1"
            ).first
            if selected.is_visible(timeout=3000):
                text = selected.inner_text()
                numbers = re.findall(r"\d+", text)
                if numbers:
                    return int(numbers[0])
        except Exception as e:
            logger.warning("Could not get selected conversation message count: %s", e)
        return 0
