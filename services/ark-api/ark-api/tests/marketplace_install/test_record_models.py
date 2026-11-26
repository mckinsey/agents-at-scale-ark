import unittest
from datetime import datetime, timezone
from typing import get_args

from pydantic import ValidationError

from src.ark_api.models.marketplace_installs import (
    InstallRecordState,
    InstallStage,
    MarketplaceInstallError,
    MarketplaceInstallEvent,
    MarketplaceInstallList,
    MarketplaceInstallRecord,
)


class TestRecordModels(unittest.TestCase):
    def test_states_and_stages_are_the_contract_with_the_dashboard(self):
        self.assertEqual(
            set(get_args(InstallRecordState)),
            {"installable", "installing", "installed", "failed", "timed-out", "platform-managed"},
        )
        self.assertEqual(set(get_args(InstallStage)), {"resolve", "apply", "ready"})

    def test_not_installable_is_not_a_state(self):
        with self.assertRaises(ValidationError):
            MarketplaceInstallRecord(release="demo", state="not-installable")

    def test_record_serializes_with_camel_case_fields(self):
        started = datetime(2026, 11, 25, 10, 0, tzinfo=timezone.utc)
        record = MarketplaceInstallRecord(
            source="official",
            itemName="phoenix",
            release="phoenix",
            chartVersion="0.1.0",
            digest="sha256:" + "a" * 64,
            state="installing",
            stage="apply",
            startedAt=started,
            installedBy="alice",
            events=[MarketplaceInstallEvent(type="Warning", reason="FailedCreate", message="quota", objectKind="ReplicaSet", objectName="rs")],
        )
        data = MarketplaceInstallList(items=[record]).model_dump(mode="json")["items"][0]
        self.assertEqual(
            set(data),
            {
                "source",
                "itemName",
                "release",
                "chartVersion",
                "digest",
                "state",
                "stage",
                "failedStage",
                "startedAt",
                "installedBy",
                "events",
                "log",
            },
        )
        self.assertEqual(data["startedAt"], "2026-11-25T10:00:00Z")
        self.assertEqual(data["events"][0]["objectKind"], "ReplicaSet")
        self.assertEqual(data["events"][0]["count"], 1)

    def test_error_body_wraps_the_detail(self):
        body = MarketplaceInstallError.model_validate(
            {"detail": {"code": "already-installed", "message": "m", "record": {"release": "demo", "state": "installed"}}}
        )
        self.assertEqual(body.detail.record.state, "installed")
        self.assertIsNone(MarketplaceInstallError.model_validate({"detail": {"code": "busy", "message": "m"}}).detail.record)

    def test_release_only_record_has_no_item(self):
        record = MarketplaceInstallRecord(release="ark-tenant", state="installed")
        self.assertIsNone(record.itemName)
        self.assertIsNone(record.source)
        self.assertEqual(record.events, [])


if __name__ == "__main__":
    unittest.main()
