from __future__ import annotations

from ark_api.models.events import event_to_response


class TestEventToResponse:
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

        assert r.involved_object_kind == "Team"
        assert r.involved_object_name == "team-a"
        assert r.reason == "StatusChanged"
        assert r.message == "all good"
        assert r.source_component == "team-controller"
        assert r.source_host == "node-1"
        assert r.count == 3
        assert r.first_timestamp is not None
        assert r.last_timestamp is not None
        assert r.first_timestamp.hour == 10 and r.first_timestamp.minute == 0
        assert r.last_timestamp.minute == 5

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
            # legacy fields empty (as returned by the core/v1 view of an events.k8s.io event)
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
        assert r.first_timestamp is not None
        assert r.first_timestamp.minute == 0 and r.first_timestamp.second == 30
        assert r.last_timestamp is not None
        assert r.last_timestamp.minute == 9
        # count from series
        assert r.count == 4
        # source from reporting_*
        assert r.source_component == "ark.mckinsey.com/team-controller"
        assert r.source_host == "team-controller-abc"

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

        assert r.first_timestamp is not None
        assert r.last_timestamp is not None
        assert r.first_timestamp.hour == 12
        assert r.count == 1
