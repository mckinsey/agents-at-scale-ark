"""The Deployment details settings page lists the namespace's Helm releases.

The page shows the same data as `helm list --deployed --failed --pending` for
the active namespace, so helm itself is the oracle: every release it reports
must appear as a row, and a deployed one as Healthy. The suite installs mock-llm with helm, so the
namespace is never empty.
"""

import json
import subprocess

import pytest
from playwright.sync_api import Page, expect

from pages.dashboard_page import DashboardPage

NAMESPACE = "default"


def _page_url(page: Page) -> str:
    base_url = DashboardPage(page).base_url
    return f"{base_url}/settings/deployment-details?namespace={NAMESPACE}"


def _helm_releases(namespace: str) -> list[dict]:
    result = subprocess.run(
        [
            "helm", "list", "--namespace", namespace,
            "--deployed", "--failed", "--pending", "--output", "json",
        ],
        capture_output=True, text=True, timeout=30, check=True,
    )
    return json.loads(result.stdout)


@pytest.mark.dashboard
@pytest.mark.xdist_group("ark_deployment_details")
class TestDeploymentDetails:

    def test_page_lists_every_helm_release_in_the_namespace(self, page: Page):
        releases = _helm_releases(NAMESPACE)
        assert releases, f"helm reports no releases in '{NAMESPACE}'"

        page.goto(_page_url(page), wait_until="domcontentloaded")

        expect(
            page.get_by_role("heading", name="Deployment details", exact=True)
        ).to_be_visible(timeout=30000)
        expect(
            page.get_by_role("status").filter(has_text="Showing your namespace only.")
        ).to_contain_text(NAMESPACE)

        table = page.get_by_role("table", name="Tenant namespace services")
        expect(table).to_be_visible(timeout=15000)

        for release in releases:
            name = release["name"]
            status = release["status"]
            row = table.get_by_role("row").filter(
                has=page.get_by_role("cell", name=name, exact=True)
            )
            expect(row, f"no row for release '{name}'").to_have_count(1)
            if status == "deployed":
                expect(row.get_by_text("Healthy", exact=True)).to_be_visible()

    def test_refresh_reloads_the_releases(self, page: Page):
        page.goto(_page_url(page), wait_until="domcontentloaded")

        expect(page.get_by_text("Last checked:")).to_be_visible(timeout=30000)
        refresh = page.get_by_role("button", name="Refresh")

        with page.expect_response(
            lambda r: "/api/v1/ark-services/helm-releases" in r.url and r.ok
        ):
            refresh.click()

        expect(refresh).to_be_enabled()
