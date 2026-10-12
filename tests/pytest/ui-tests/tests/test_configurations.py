"""Creating, editing and deleting a configuration from the dashboard.

A configuration is a ConfigMap that Ark annotates as its own, so every step
asserts the cluster as well as the page - a row can render from an optimistic
cache for a write the API actually rejected, and only reading the ConfigMap
back tells the two apart.
"""

import logging

import pytest
from playwright.sync_api import Page

from pages.configurations_page import ConfigurationsPage
from shared.k8s import delete_resource, get_resource

logger = logging.getLogger(__name__)

RESOURCE_TYPE_ANNOTATION = "ark.mckinsey.com/resource-type"
DESCRIPTION_ANNOTATION = "ark.mckinsey.com/description"
CONFIGURATION_RESOURCE_TYPE = "configuration"

ORIGINAL_VALUE = "https://mcp.example.com"
EDITED_VALUE = "https://mcp.edited.example.com"
DESCRIPTION = "Created by the ui-tests configurations journey"


@pytest.fixture(scope="class")
def configuration_resources():
    """Carries the generated name between the tests, and cleans up after them.

    The teardown runs even when a test fails part-way, so a broken run cannot
    leave a ConfigMap behind for the next one to trip over.
    """
    created = {"name": None}

    yield created

    if created["name"]:
        delete_resource("configmap", created["name"])


@pytest.mark.configurations
@pytest.mark.xdist_group("ark_configurations")
class TestConfigurations:
    """One configuration through its whole life on the dashboard."""

    def test_a_configuration_can_be_created(
        self, page: Page, configuration_resources: dict
    ):
        configurations = ConfigurationsPage(page)
        configurations.navigate_to_configurations()

        name = configurations.generate_resource_name("ui-config")
        configurations.open_create_form()
        assert configurations.form_heading() == "New configuration", (
            "the create form should open on its own heading, but showed "
            f"{configurations.form_heading()!r}"
        )

        configurations.fill_form(
            name=name, value=ORIGINAL_VALUE, description=DESCRIPTION
        )
        configurations.submit_form("Create")
        configuration_resources["name"] = name

        configurations.wait_for_row(name)
        cells = configurations.row_cells(name)
        assert ORIGINAL_VALUE in cells, (
            f"the new row should show the value that was entered, but held {cells}"
        )

        config_map = get_resource("configmap", name)
        assert config_map is not None, (
            f"creating {name} on the dashboard should have created a ConfigMap, "
            "but none exists in the cluster"
        )
        assert config_map["data"]["value"] == ORIGINAL_VALUE, (
            "the stored configuration should hold the value that was entered, but "
            f"held {config_map['data']['value']!r}"
        )
        annotations = config_map["metadata"]["annotations"]
        assert annotations[RESOURCE_TYPE_ANNOTATION] == CONFIGURATION_RESOURCE_TYPE, (
            "the ConfigMap should be annotated as an Ark configuration, but carried "
            f"{annotations.get(RESOURCE_TYPE_ANNOTATION)!r}"
        )
        assert annotations[DESCRIPTION_ANNOTATION] == DESCRIPTION, (
            "the description should be stored on the ConfigMap, but carried "
            f"{annotations.get(DESCRIPTION_ANNOTATION)!r}"
        )

    def test_search_narrows_the_list_to_the_configuration(
        self, page: Page, configuration_resources: dict
    ):
        name = configuration_resources["name"]
        assert name, "the create test did not record a configuration name"

        configurations = ConfigurationsPage(page)
        configurations.navigate_to_configurations()
        configurations.wait_for_row(name)

        configurations.search(name)
        assert configurations.listed_names() == [name], (
            f"searching for {name} should leave only that row, but the page listed "
            f"{configurations.listed_names()}"
        )

        configurations.search(f"{name}-no-such-configuration")
        assert configurations.is_no_results_shown(), (
            "a search matching nothing should say so, but the page still listed "
            f"{configurations.listed_names()}"
        )

    def test_a_configuration_can_be_edited(
        self, page: Page, configuration_resources: dict
    ):
        name = configuration_resources["name"]
        assert name, "the create test did not record a configuration name"

        configurations = ConfigurationsPage(page)
        configurations.navigate_to_configurations()
        configurations.wait_for_row(name)

        configurations.open_edit_form(name)
        assert configurations.form_heading() == "Edit configuration", (
            "editing should open on the edit heading, but showed "
            f"{configurations.form_heading()!r}"
        )
        assert configurations.get_form_values() == {
            "name": name,
            "description": DESCRIPTION,
            "value": ORIGINAL_VALUE,
        }, (
            "the edit form should open on the stored values, but held "
            f"{configurations.get_form_values()}"
        )
        assert not configurations.name_field_is_editable(), (
            "the name cannot be changed after creation, so its field should be "
            "disabled while editing"
        )

        configurations.fill_form(value=EDITED_VALUE)
        configurations.submit_form("Save")

        configurations.wait_for_row(name)
        cells = configurations.row_cells(name)
        assert EDITED_VALUE in cells, (
            f"the row should show the edited value, but held {cells}"
        )

        config_map = get_resource("configmap", name)
        assert config_map["data"]["value"] == EDITED_VALUE, (
            "the edit should have reached the cluster, but the ConfigMap still holds "
            f"{config_map['data']['value']!r}"
        )

    def test_a_configuration_can_be_deleted(
        self, page: Page, configuration_resources: dict
    ):
        name = configuration_resources["name"]
        assert name, "the create test did not record a configuration name"

        configurations = ConfigurationsPage(page)
        configurations.navigate_to_configurations()
        configurations.wait_for_row(name)

        warning = configurations.open_delete_dialog(name)
        assert f'Do you want to delete "{name}"?' in warning, (
            f"the confirmation should name what is being deleted, but read {warning!r}"
        )

        configurations.confirm_delete()
        configurations.wait_for_row_gone(name)

        assert get_resource("configmap", name) is None, (
            f"deleting {name} on the dashboard should have removed its ConfigMap, "
            "but it is still in the cluster"
        )
        configuration_resources["name"] = None