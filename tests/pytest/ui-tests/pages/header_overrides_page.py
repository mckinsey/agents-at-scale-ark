import re

from playwright.sync_api import Locator, expect

from .base_page import BasePage

DASHBOARD_URL = "http://localhost:3274"


class HeaderOverridesPage(BasePage):
    ROW = "[data-testid='header-row']"
    MODEL_HEADERS = "[data-testid='model-headers']"
    MCP_HEADERS = "[data-testid='mcp-header-overrides']"
    CHAT_HEADERS = "[data-testid='chat-mcp-header-overrides']"
    CHAT_EFFECTIVE_COUNT = "[data-testid='chat-mcp-header-effective-count']"
    CHAT_INPUT = "Type your message..."

    def open_model_update(self, model: str) -> None:
        self.page.goto(
            f"{DASHBOARD_URL}/models/{model}/update?namespace=default",
            wait_until="domcontentloaded",
        )
        self.page.get_by_role("button", name="Update Model").wait_for(timeout=30000)
        self.model_headers().wait_for(timeout=30000)

    def open_agent(self, agent: str) -> None:
        self.page.goto(
            f"{DASHBOARD_URL}/agents/{agent}?namespace=default",
            wait_until="domcontentloaded",
        )
        self.mcp_headers().wait_for(timeout=30000)

    def model_headers(self) -> Locator:
        return self.page.locator(self.MODEL_HEADERS)

    def mcp_headers(self) -> Locator:
        return self.page.locator(self.MCP_HEADERS)

    def chat_section(self) -> Locator:
        return self.page.locator(self.CHAT_HEADERS)

    def rows(self, section: Locator) -> Locator:
        return section.locator(self.ROW)

    def add_row(self, section: Locator, label: str) -> Locator:
        rows = self.rows(section)
        before = rows.count()
        section.get_by_role("button", name=label, exact=True).click()
        expect(rows).to_have_count(before + 1)
        return rows.nth(before)

    def blank_or_new_row(self, section: Locator, label: str) -> Locator:
        rows = self.rows(section)
        if rows.count() > 0:
            last = rows.last
            if not last.get_by_label("Header name").input_value():
                return last
        return self.add_row(section, label)

    def _pick(self, row: Locator, control: str, option: str) -> None:
        trigger = row.get_by_label(control, exact=True)
        trigger.scroll_into_view_if_needed()
        listbox = self.page.get_by_role("listbox")
        for _ in range(3):
            trigger.click()
            try:
                listbox.wait_for(state="visible", timeout=5000)
                break
            except Exception:
                pass
        handle = listbox.element_handle(timeout=5000)
        if handle:
            self.page.evaluate(
                "el => Promise.allSettled(el.getAnimations({subtree: true}).map(a => a.finished))",
                handle,
            )
        listbox.get_by_role("option", name=option, exact=True).click()
        expect(listbox).to_have_count(0)

    def fill_row(
        self,
        row: Locator,
        name: str,
        value: str | None = None,
        secret: tuple[str, str] | None = None,
        server: str | None = None,
        name_is_select: bool = False,
    ) -> None:
        if server is not None:
            self._pick(row, "MCP server", server)
        if name_is_select:
            self._pick(row, "Header name", name)
        else:
            name_input = row.get_by_label("Header name", exact=True)
            name_input.fill(name)
            name_input.blur()

        if secret is not None:
            self._pick(row, "Header source", "Secret")
            self._pick(row, "Header override", f"{secret[0]} · {secret[1]}")
        else:
            self._pick(row, "Header source", "Direct")
            row.get_by_label("Header value", exact=True).fill(value or "")

    def _text(self, control: Locator) -> str:
        if control.evaluate("el => el.tagName") == "INPUT":
            return control.input_value().strip()
        return control.inner_text().strip()

    def row_summary(self, row: Locator) -> dict:
        summary = {
            "name": self._text(row.get_by_label("Header name", exact=True)),
            "source": self._text(row.get_by_label("Header source", exact=True)),
        }
        server = row.get_by_label("MCP server", exact=True)
        if server.count() > 0:
            summary["server"] = self._text(server)
        if summary["source"] == "Direct":
            summary["value"] = self._text(row.get_by_label("Header value", exact=True))
        else:
            summary["value"] = self._text(row.get_by_label("Header override", exact=True))
        return summary

    def summaries(self, section: Locator) -> list[dict]:
        return [
            self.row_summary(row)
            for row in self.rows(section).all()
            if self._text(row.get_by_label("Header name", exact=True))
        ]

    def save_model(self) -> None:
        self.page.get_by_role("button", name="Update Model").click()
        self.page.wait_for_url(re.compile(r"/models(\?|$)"), timeout=30000)

    def save_agent(self) -> None:
        self.page.get_by_role("button", name="Save changes").click()
        expect(self.page.get_by_text("Agent updated successfully")).to_be_visible(
            timeout=30000
        )

    def expand_chat_overrides(self) -> Locator:
        section = self.chat_section()
        section.wait_for(timeout=30000)
        section.get_by_role("button", name=re.compile(r"^MCP header overrides")).click()
        section.get_by_role("button", name="Add new", exact=True).wait_for()
        return section

    def chat_effective_count(self) -> str:
        return self.chat_section().locator(self.CHAT_EFFECTIVE_COUNT).inner_text().strip()

    def send_chat_message(self, message: str) -> None:
        textarea = self.page.get_by_placeholder(self.CHAT_INPUT)
        textarea.fill(message)
        textarea.press("Enter")
