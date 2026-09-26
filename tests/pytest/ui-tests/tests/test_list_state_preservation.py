import logging
from urllib.parse import parse_qs, urlsplit

import pytest
from playwright.sync_api import Page, expect

from conftest import MOCK_LLM_MODEL_NAME
from pages.agents_page import AgentsPage
from pages.dashboard_page import DashboardPage

logger = logging.getLogger(__name__)

SEARCH_INPUT = "input[type='search']"
BREADCRUMB_BACK_LINK = "nav[aria-label='Breadcrumb'] a"
CLOSE_SETTINGS_BUTTON = "button[aria-label='Close settings']"
SETTINGS_NAV_BUTTON = "button:has-text('Settings')"
SEARCH_DEBOUNCE_MS = 600


def query_params(url: str) -> dict:
    return parse_qs(urlsplit(url).query)


def param(url: str, key: str) -> str | None:
    values = query_params(url).get(key)
    return values[0] if values else None


@pytest.fixture(scope="class")
def list_state_resources():
    return {
        "agent_name": None,
        "setup_failed": False,
    }


@pytest.mark.list_state
@pytest.mark.xdist_group("list_state")
class TestListStatePreservation:

    def _seed_agent(self, page: Page, resources: dict) -> str:
        """One agent is enough: the list only has to hold a filter and a row to open."""
        if resources["setup_failed"]:
            pytest.skip("Agent seeding failed in an earlier test")
        if resources["agent_name"]:
            return resources["agent_name"]

        agents = AgentsPage(page)
        result = agents.create_agent_for_test("liststate", MOCK_LLM_MODEL_NAME)
        if not result.get("in_table"):
            resources["setup_failed"] = True
            pytest.skip("Could not seed an agent, skipping list-state tests")
        resources["agent_name"] = result["name"]
        return result["name"]

    def _teardown(self, page: Page, resources: dict) -> None:
        if not resources["agent_name"]:
            return

        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()
        agents.delete_agent_with_verification(resources["agent_name"])
        resources["agent_name"] = None

    def _open_filtered_agents(self, page: Page, search_term: str) -> str:
        agents = AgentsPage(page)
        agents.navigate_to_agents_tab()

        search = page.locator(SEARCH_INPUT).first
        search.wait_for(state="visible", timeout=10000)
        search.fill(search_term)

        page.wait_for_url(
            lambda url: param(url, "q") == search_term,
            timeout=SEARCH_DEBOUNCE_MS + 4000,
        )
        return page.url

    def test_filter_is_written_to_the_url(self, page: Page, list_state_resources: dict):
        seeded_agent = self._seed_agent(page, list_state_resources)
        filtered_url = self._open_filtered_agents(page, seeded_agent)

        assert param(filtered_url, "q") == seeded_agent
        assert param(filtered_url, "namespace"), "namespace must stay in the URL"

    def test_breadcrumb_returns_to_the_filtered_list(
        self, page: Page, list_state_resources: dict
    ):
        seeded_agent = self._seed_agent(page, list_state_resources)
        self._open_filtered_agents(page, seeded_agent)

        page.locator(f"a[href*='/agents/']:has-text('{seeded_agent}')").first.click()
        page.wait_for_url("**/agents/**", timeout=15000)

        back_link = page.locator(BREADCRUMB_BACK_LINK).first
        back_link.wait_for(state="visible", timeout=10000)
        back_link.click()

        page.wait_for_url(lambda url: "/agents/" not in urlsplit(url).path, timeout=15000)

        assert param(page.url, "q") == seeded_agent, (
            f"breadcrumb should restore the filter, got {page.url}"
        )
        expect(page.locator(SEARCH_INPUT).first).to_have_value(seeded_agent)

    def test_closing_settings_returns_to_the_filtered_list(
        self, page: Page, list_state_resources: dict
    ):
        seeded_agent = self._seed_agent(page, list_state_resources)
        self._open_filtered_agents(page, seeded_agent)

        page.locator(SETTINGS_NAV_BUTTON).first.click()
        page.wait_for_url("**/settings/**", timeout=15000)

        page.locator(CLOSE_SETTINGS_BUTTON).first.click()
        page.wait_for_url(lambda url: "/settings" not in urlsplit(url).path, timeout=15000)

        assert urlsplit(page.url).path.endswith("/agents")
        assert param(page.url, "q") == seeded_agent, (
            f"closing settings should restore the filter, got {page.url}"
        )

    def test_deep_linked_detail_page_returns_to_an_unfiltered_list(
        self, page: Page, list_state_resources: dict
    ):
        seeded_agent = self._seed_agent(page, list_state_resources)
        dashboard = DashboardPage(page)
        page.goto(
            f"{dashboard.base_url}/agents/{seeded_agent}",
            wait_until="domcontentloaded",
        )
        dashboard.wait_for_namespace_in_url()

        back_link = page.locator(BREADCRUMB_BACK_LINK).first
        back_link.wait_for(state="visible", timeout=10000)
        back_link.click()

        page.wait_for_url(lambda url: "/agents/" not in urlsplit(url).path, timeout=15000)

        params = query_params(page.url)
        assert "q" not in params, f"no filter should be invented, got {page.url}"
        assert params.get("namespace"), "namespace must still be present"

    def test_changing_a_filter_twice_then_back_leaves_the_list(
        self, page: Page, list_state_resources: dict
    ):
        """Two filter changes on one screen must not become two history entries.

        Filter writes use router.replace, so back skips past every intermediate
        filter state. Going forward must land on the last filter and stay there:
        a component that mirrored the URL in local state would write the stale
        value back and undo the navigation.
        """
        seeded_agent = self._seed_agent(page, list_state_resources)
        term_a = seeded_agent
        term_b = seeded_agent[:4]
        assert term_a != term_b, "the two filter terms must differ"

        self._open_filtered_agents(page, term_a)

        search = page.locator(SEARCH_INPUT).first
        search.fill(term_b)
        page.wait_for_url(
            lambda url: param(url, "q") == term_b,
            timeout=SEARCH_DEBOUNCE_MS + 4000,
        )

        # The second filter must settle, not be reverted by a late write from
        # the first.
        page.wait_for_timeout(SEARCH_DEBOUNCE_MS + 500)
        assert param(page.url, "q") == term_b, (
            f"filter should settle on the last value, got {page.url}"
        )

        page.go_back()
        page.wait_for_load_state("domcontentloaded")

        assert param(page.url, "q") not in (term_a, term_b), (
            "filter changes must not each push a history entry; back landed on "
            f"an intermediate filter state: {page.url}"
        )

        page.go_forward()
        page.wait_for_url(
            lambda url: param(url, "q") == term_b,
            timeout=15000,
        )
        expect(page.locator(SEARCH_INPUT).first).to_have_value(term_b)

        # Nothing may write over the restored value once the debounce elapses.
        page.wait_for_timeout(SEARCH_DEBOUNCE_MS + 500)
        assert param(page.url, "q") == term_b, (
            f"returning forward must not trigger a compensating write, got {page.url}"
        )
        expect(page.locator(SEARCH_INPUT).first).to_have_value(term_b)

    def test_browser_back_still_leaves_the_list(self, page: Page, list_state_resources: dict):
        seeded_agent = self._seed_agent(page, list_state_resources)
        self._open_filtered_agents(page, seeded_agent)
        filter_changes = page.url

        page.locator(f"a[href*='/agents/']:has-text('{seeded_agent}')").first.click()
        page.wait_for_url("**/agents/**", timeout=15000)

        page.go_back()
        page.wait_for_url(lambda url: "/agents/" not in urlsplit(url).path, timeout=15000)

        assert param(page.url, "q") == param(filter_changes, "q"), (
            "browser back should land on the filtered list, not on an intermediate "
            f"filter state; got {page.url}"
        )

        self._teardown(page, list_state_resources)
