from __future__ import annotations

import unittest
from datetime import datetime, timezone

from ark_api.models.events import event_to_response


class TestEventToResponse(unittest.TestCase):
    """Tests for event_to_response, covering both event API representations."""

    def test_legacy_core_v1_event(self):
        """core/v1 events populate first/last_timestamp, count, source directly."""
        event_dict = {
            "metadata": {
                "name": "evt-1",
                "namespace": "default",
                "uid": "uid-1",
                "creation_timestamp": "2026-09-24T10:00:00Z",
            },
            "type": "Normal",
            "reason": "StatusChanged",
            "message": "all good",
            "involved_object": {"kind": "Team", "name": "team-a", "namespace": "default"},
            "source": {"component": "team-controller", "host": "node-1"},
            "first_timestamp": "2026-09-24T10:00:00Z",
            "last_timestamp": "2026-09-24T10:05:00Z",
            "count": 3,
        }

        r = event_to_response(event_dict)

        self.assertEqual(r.involved_object_kind, "Team")
        self.assertEqual(r.involved_object_name, "team-a")
        self.assertEqual(r.reason, "StatusChanged")
        self.assertEqual(r.message, "all good")
        self.assertEqual(r.source_component, "team-controller")
        self.assertEqual(r.source_host, "node-1")
        self.assertEqual(r.count, 3)
        self.assertIsNotNone(r.first_timestamp)
        self.assertIsNotNone(r.last_timestamp)
        self.assertEqual(r.first_timestamp.hour, 10)
        self.assertEqual(r.first_timestamp.minute, 0)
        self.assertEqual(r.last_timestamp.minute, 5)

    def test_events_k8s_io_event_falls_back(self):
        """events.k8s.io/v1 events leave legacy fields empty; fall back to
        event_time / series / reporting_* so the response stays populated."""
        event_dict = {
            "metadata": {
                "name": "evt-2",
                "namespace": "default",
                "uid": "uid-2",
                "creation_timestamp": "2026-09-24T11:00:00Z",
            },
            "type": "Normal",
            "reason": "StatusChanged",
            "message": "all good",
            "involved_object": {"kind": "Team", "name": "team-b", "namespace": "default"},
            # legacy fields empty (core/v1 view of an events.k8s.io event)
            "source": {},
            "first_timestamp": None,
            "last_timestamp": None,
            "count": None,
            # new-style fields populated
            "event_time": "2026-09-24T11:00:30Z",
            "series": {"count": 4, "last_observed_time": "2026-09-24T11:09:00Z"},
            "reporting_component": "ark.mckinsey.com/team-controller",
            "reporting_instance": "team-controller-abc",
        }

        r = event_to_response(event_dict)

        # timestamps fall back to event_time / series.last_observed_time
        self.assertIsNotNone(r.first_timestamp)
        self.assertEqual(r.first_timestamp.minute, 0)
        self.assertEqual(r.first_timestamp.second, 30)
        self.assertIsNotNone(r.last_timestamp)
        self.assertEqual(r.last_timestamp.minute, 9)
        # count from series
        self.assertEqual(r.count, 4)
        # source from reporting_*
        self.assertEqual(r.source_component, "ark.mckinsey.com/team-controller")
        self.assertEqual(r.source_host, "team-controller-abc")

    def test_empty_timestamps_fall_back_to_creation(self):
        """With neither legacy nor new timestamps, fall back to creation_timestamp
        (never None)."""
        event_dict = {
            "metadata": {
                "name": "evt-3",
                "namespace": "default",
                "uid": "uid-3",
                "creation_timestamp": "2026-09-24T12:00:00Z",
            },
            "type": "Normal",
            "reason": "TeamCreated",
            "message": "init",
            "involved_object": {"kind": "Team", "name": "team-c"},
        }

        r = event_to_response(event_dict)

        self.assertIsNotNone(r.first_timestamp)
        self.assertIsNotNone(r.last_timestamp)
        self.assertEqual(r.first_timestamp.hour, 12)
        self.assertEqual(r.count, 1)

    def test_datetime_object_and_unparseable_string_timestamps(self):
        """Timestamp parsing accepts datetime objects as-is and treats an
        unparseable string as absent (falling back to the next candidate)."""
        created = datetime(2026, 9, 24, 13, 0, 0, tzinfo=timezone.utc)
        event_dict = {
            "metadata": {
                "name": "evt-4",
                "namespace": "default",
                "uid": "uid-4",
                "creation_timestamp": created,  # datetime object, not a string
            },
            "type": "Normal",
            "reason": "StatusChanged",
            "message": "msg",
            "involved_object": {"kind": "Team", "name": "team-d"},
            "first_timestamp": "not-a-timestamp",  # unparseable -> ignored
        }

        r = event_to_response(event_dict)

        # unparseable first_timestamp falls back to the datetime creation_timestamp
        self.assertEqual(r.first_timestamp, created)
        self.assertEqual(r.last_timestamp, created)


if __name__ == "__main__":
    unittest.main()
