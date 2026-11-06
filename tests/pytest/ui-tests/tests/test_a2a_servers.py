"""Registering and removing an A2A server from the dashboard.

The server is pointed at an address nothing serves, on purpose: the CR is
created and listed either way, and the parts that depend on a real endpoint
answering - readiness, the status message - are left unasserted because the
controller decides them on its own schedule.
"""

import logging

import pytest
from playwright.sync_api import Page

from pages.a2a_servers_page import A2AServersPage
from shared.k8s import delete_resource, get_resource

logger = logging.getLogger(__name__)

SERVER_ADDRESS = "http://ui-tests-a2a.default.svc.cluster.local:8080"
SERVER_DESCRIPTION = "Created by the ui-tests A2A servers journey"


@pytest.fixture(scope="class")
def a2a_server_resources():
    """Carries the server name between tests, and removes the CR afterwards."""
    created = {"name": None}

    yield created

    if created["name"]:
        delete_resource("a2aserver", created["name"])


@pytest.mark.a2a
@pytest.mark.xdist_group("ark_a2a_servers")
class TestA2AServers:
    """One A2A server: registered, linked to its events, then deleted."""

    def test_an_a2a_server_can_be_registered(
        self, page: Page, a2a_server_resources: dict
    ):
        servers = A2AServersPage(page)
        servers.navigate_to_a2a_servers()

        name = servers.generate_resource_name("ui-a2a")
        dialog_text = servers.open_create_dialog()
        assert "Create new A2A server" in dialog_text, (
            f"the create dialog should announce itself, but read {dialog_text!r}"
        )

        servers.submit_create_dialog(
            name=name, address=SERVER_ADDRESS, description=SERVER_DESCRIPTION
        )
        a2a_server_resources["name"] = name

        servers.wait_for_row(name)
        cells = servers.row_cells(name)
        assert SERVER_ADDRESS in cells, (
            f"the new row should show the address it was given, but held {cells}"
        )

        server = get_resource("a2aserver", name)
        assert server is not None, (
            f"registering {name} on the dashboard should have created an A2AServer, "
            "but none exists in the cluster"
        )
        assert server["spec"]["address"]["value"] == SERVER_ADDRESS, (
            "the stored server should hold the address that was entered, but held "
            f"{server['spec']['address']['value']!r}"
        )

    def test_the_row_links_to_the_events_for_that_server(
        self, page: Page, a2a_server_resources: dict
    ):
        name = a2a_server_resources["name"]
        assert name, "the create test did not record a server name"

        servers = A2AServersPage(page)
        servers.navigate_to_a2a_servers()
        servers.wait_for_row(name)

        servers.open_events_for(name)
        url = servers.get_url()
        assert "/events" in url, (
            f"See events should open the events page, but landed on {url!r}"
        )
        assert "kind=A2AServer" in url and f"name={name}" in url, (
            "the events page should be filtered to this server, but the link carried "
            f"{url!r}"
        )

    def test_an_a2a_server_can_be_deleted(
        self, page: Page, a2a_server_resources: dict
    ):
        name = a2a_server_resources["name"]
        assert name, "the create test did not record a server name"

        servers = A2AServersPage(page)
        servers.navigate_to_a2a_servers()
        servers.wait_for_row(name)

        warning = servers.open_delete_dialog(name)
        assert f'Do you want to delete "{name}" A2A server?' in warning, (
            f"the confirmation should name the server being deleted, but read {warning!r}"
        )

        servers.confirm_delete()
        servers.wait_for_row_gone(name)

        assert get_resource("a2aserver", name) is None, (
            f"deleting {name} on the dashboard should have removed its A2AServer, "
            "but it is still in the cluster"
        )
        a2a_server_resources["name"] = None
