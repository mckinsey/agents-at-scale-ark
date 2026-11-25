import unittest
from datetime import datetime, timezone
from typing import get_args

from pydantic import ValidationError

from src.ark_api.models.marketplace_installs import (
    InstallResourceState,
    MarketplaceInstallPreview,
    MarketplaceInstallPreviewRequest,
    MarketplaceInstallResource,
)

VERDICTS = {
    "free",
    "conflict-release",
    "conflict-unmanaged",
    "cluster-scoped",
    "namespace-mismatch",
    "crd",
    "skip-webhook-label",
    "rbac-escalation",
    "reserved-secret",
    "personal-secret-ref",
    "psa-violation",
    "unverifiable",
}


class TestPreviewModels(unittest.TestCase):
    def test_verdicts_are_the_contract(self):
        self.assertEqual(set(get_args(InstallResourceState)), VERDICTS)

    def test_unknown_verdict_is_rejected(self):
        with self.assertRaises(ValidationError):
            MarketplaceInstallResource(apiVersion="v1", kind="ConfigMap", name="x", state="adopted")

    def test_request_ignores_a_chart_reference(self):
        request = MarketplaceInstallPreviewRequest.model_validate({"source": "official", "chartPath": "oci://evil/x"})
        self.assertEqual(request.model_dump(), {"source": "official"})

    def test_request_needs_a_valid_source(self):
        for body in ({}, {"source": ""}, {"source": "a/b"}, {"source": "x" * 254}, {"source": "a b"}):
            with self.subTest(body=body):
                with self.assertRaises(ValidationError):
                    MarketplaceInstallPreviewRequest.model_validate(body)

    def test_preview_serialises_with_contract_field_names(self):
        preview = MarketplaceInstallPreview(
            source="official",
            itemName="phoenix",
            chartName="phoenix",
            chartRef="oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
            chartVersion="0.1.0",
            digest="sha256:" + "a" * 64,
            releaseName="phoenix",
            namespace="team-a",
            blocked=False,
            expiresAt=datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc),
            resources=[MarketplaceInstallResource(apiVersion="v1", kind="ConfigMap", name="phoenix", state="free")],
        )
        body = preview.model_dump(mode="json")
        self.assertEqual(
            set(body),
            {"source", "itemName", "chartName", "chartRef", "chartVersion", "digest", "releaseName", "namespace", "blocked", "expiresAt", "resources"},
        )
        self.assertEqual(
            body["resources"][0],
            {"apiVersion": "v1", "kind": "ConfigMap", "name": "phoenix", "namespace": None, "state": "free", "ownedByRelease": None, "hook": False, "message": None},
        )
        self.assertEqual(body["expiresAt"], "2026-11-19T12:00:00Z")


if __name__ == "__main__":
    unittest.main()
