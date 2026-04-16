import pytest
from playwright.sync_api import Page
from pages.secrets_page import SecretsPage
from pages.models_page import ModelsPage
from pages.agents_page import AgentsPage
from pages.teams_page import TeamsPage


@pytest.fixture(scope="class")
def team_loop_resources():
    return {
        "secret_name": None,
        "model_name": None,
        "agent_name": None,
        "created_teams": [],
        "setup_failed": False,
    }


@pytest.mark.teams
@pytest.mark.xdist_group("ark_team_loops")
class TestTeamSequentialLoops:

    def _setup(self, page: Page, resources: dict) -> None:
        if resources["setup_failed"]:
            pytest.skip("Prerequisites failed in an earlier test")
        if resources["agent_name"]:
            return

        secrets = SecretsPage(page)
        models = ModelsPage(page)
        agents = AgentsPage(page)
        model_data = models.TEST_DATA["openai"]

        secret = secrets.create_secret_for_test("loops-secret", model_data["env_key"])
        if not secret["in_table"]:
            resources["setup_failed"] = True
            pytest.skip("Secret creation failed")
        resources["secret_name"] = secret["name"]

        model = models.create_model_for_test("loops-model", secret["name"], secrets)
        if not model["in_table"]:
            resources["setup_failed"] = True
            pytest.skip("Model creation failed")
        resources["model_name"] = model["name"]

        agent = agents.create_agent_for_test("loops-agent", model["name"])
        if not agent["in_table"]:
            resources["setup_failed"] = True
            pytest.skip("Agent creation failed")
        resources["agent_name"] = agent["name"]

    def _teardown(self, page: Page, resources: dict) -> None:
        teams = TeamsPage(page)
        agents = AgentsPage(page)
        models = ModelsPage(page)
        secrets = SecretsPage(page)

        teams.navigate_to_teams_tab()
        for name in list(resources["created_teams"]):
            if teams.is_team_in_table(name):
                teams.delete_team_with_verification(name)

        if resources["agent_name"]:
            agents.navigate_to_agents_tab()
            agents.delete_agent_with_verification(resources["agent_name"])

        if resources["model_name"]:
            models.navigate_to_models_tab()
            models.delete_model_with_verification(resources["model_name"])

        if resources["secret_name"]:
            secrets.navigate_to_secrets_tab()
            secrets.delete_secret_with_verification(resources["secret_name"])

    def _open_dialog(self, teams: TeamsPage) -> None:
        teams.navigate_to_teams_tab()
        teams.page.locator(teams.ADD_TEAM_BUTTON).first.click()
        teams.wait_for_load_state("domcontentloaded")
        teams.page.locator("input").first.wait_for(state="visible", timeout=10000)

    def test_round_robin_absent_from_strategy_dropdown(self, page: Page):
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        options = [o.lower() for o in teams.get_strategy_options()]
        assert any("sequential" in o for o in options), f"Sequential missing from: {options}"
        assert not any("round" in o for o in options), f"Round Robin must not appear in: {options}"

    def test_loops_checkbox_hidden_for_selector_strategy(self, page: Page):
        teams = TeamsPage(page)
        self._open_dialog(teams)
        teams.select_strategy_in_form("Selector")
        assert not teams.is_loops_checkbox_visible(), "Loops checkbox must not appear for Selector strategy"
        teams.wait_for_modal_close()

    def test_loops_checkbox_visible_for_sequential_strategy(self, page: Page):
        teams = TeamsPage(page)
        self._open_dialog(teams)
        teams.select_strategy_in_form("Sequential")
        assert teams.is_loops_checkbox_visible(), "Loops checkbox must appear for Sequential strategy"
        teams.wait_for_modal_close()

    def test_max_turns_hidden_until_loops_enabled(self, page: Page):
        teams = TeamsPage(page)
        self._open_dialog(teams)
        teams.select_strategy_in_form("Sequential")
        assert not teams.is_max_turns_field_visible(), "Max Turns must be hidden before enabling loops"
        teams.toggle_loops_checkbox()
        assert teams.is_max_turns_field_visible(), "Max Turns must appear after enabling loops"
        teams.wait_for_modal_close()

    def test_max_turns_hides_when_loops_unchecked(self, page: Page):
        teams = TeamsPage(page)
        self._open_dialog(teams)
        teams.select_strategy_in_form("Sequential")
        teams.toggle_loops_checkbox()
        assert teams.is_max_turns_field_visible(), "Max Turns must appear after enabling loops"
        teams.toggle_loops_checkbox()
        assert not teams.is_max_turns_field_visible(), "Max Turns must hide after disabling loops"
        teams.wait_for_modal_close()

    def test_create_sequential_team_with_loops(self, page: Page, team_loop_resources: dict):
        self._setup(page, team_loop_resources)
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        team_name = teams.generate_team_name("seq-loops")

        result = teams.create_sequential_loops_team(
            team_name=team_name,
            member_name=team_loop_resources["agent_name"],
            max_turns="6",
            loops=True,
        )
        if result["in_table"]:
            team_loop_resources["created_teams"].append(team_name)

        assert result["loops_checkbox_visible"], f"Loops checkbox must be visible during '{team_name}' creation"
        assert result["max_turns_visible"], f"Max Turns must be visible when loops enabled for '{team_name}'"
        assert result["popup_visible"], f"Success popup must appear after creating '{team_name}'"
        assert result["in_table"], f"'{team_name}' must appear in teams list"

    def test_sequential_loops_team_shows_loops_label_in_row(self, page: Page, team_loop_resources: dict):
        loop_teams = [t for t in team_loop_resources["created_teams"] if "seq-loops" in t]
        if not loop_teams:
            pytest.skip("No loops team created yet")
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        row_text = teams.get_team_row_strategy_text(loop_teams[0])
        assert "loop" in row_text.lower(), f"Row must show 'Loops' indicator; got: '{row_text}'"

    def test_create_sequential_team_without_loops(self, page: Page, team_loop_resources: dict):
        self._setup(page, team_loop_resources)
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        team_name = teams.generate_team_name("seq-no-loops")

        result = teams.create_sequential_loops_team(
            team_name=team_name,
            member_name=team_loop_resources["agent_name"],
            max_turns="3",
            loops=False,
        )
        if result["in_table"]:
            team_loop_resources["created_teams"].append(team_name)

        assert result["popup_visible"], f"Success popup must appear after creating '{team_name}'"
        assert result["in_table"], f"'{team_name}' must appear in teams list"

    def test_sequential_no_loops_row_shows_plain_sequential(self, page: Page, team_loop_resources: dict):
        no_loop_teams = [t for t in team_loop_resources["created_teams"] if "seq-no-loops" in t]
        if not no_loop_teams:
            pytest.skip("No non-loops team created yet")
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        row_text = teams.get_team_row_strategy_text(no_loop_teams[0])

        strategy_part = ""
        for line in row_text.split("\n"):
            if "\u00b7" in line:
                strategy_part = line.split("\u00b7", 1)[-1].strip().lower()
                break

        assert "sequential" in strategy_part, f"Row must show 'Sequential'; got: '{strategy_part}'"
        assert "loop" not in strategy_part, f"Row must not show 'Loops' for non-loops team; got: '{strategy_part}'"

    def test_delete_sequential_loops_team(self, page: Page, team_loop_resources: dict):
        loop_teams = [t for t in team_loop_resources["created_teams"] if "seq-loops" in t]
        if not loop_teams:
            pytest.skip("No loops team found to delete")
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        result = teams.delete_team_with_verification(loop_teams[0])
        if not result["delete_available"]:
            pytest.skip(f"Delete not available for '{loop_teams[0]}'")
        assert result["confirm_dialog_visible"], "Confirm dialog must appear"
        assert result["deleted_from_table"], f"'{loop_teams[0]}' must be removed after deletion"
        team_loop_resources["created_teams"].remove(loop_teams[0])

    def test_delete_sequential_no_loops_team(self, page: Page, team_loop_resources: dict):
        no_loop_teams = [t for t in team_loop_resources["created_teams"] if "seq-no-loops" in t]
        if not no_loop_teams:
            pytest.skip("No non-loops team found to delete")
        teams = TeamsPage(page)
        teams.navigate_to_teams_tab()
        result = teams.delete_team_with_verification(no_loop_teams[0])
        if not result["delete_available"]:
            pytest.skip(f"Delete not available for '{no_loop_teams[0]}'")
        assert result["deleted_from_table"], f"'{no_loop_teams[0]}' must be removed after deletion"
        team_loop_resources["created_teams"].remove(no_loop_teams[0])

        self._teardown(page, team_loop_resources)
