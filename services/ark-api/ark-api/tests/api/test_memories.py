"""Tests for the memories CRUD endpoints."""
import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

os.environ["AUTH_MODE"] = "open"

from fastapi.testclient import TestClient
from ark_api.main import app

BROKER_URL = "http://ark-broker.default.svc"


def _memory(spec=None, labels=None, annotations=None, status=None):
    metadata = {"name": "m", "namespace": "default"}
    if labels is not None:
        metadata["labels"] = labels
    if annotations is not None:
        metadata["annotations"] = annotations
    obj = Mock()
    obj.to_dict.return_value = {
        "apiVersion": "ark.mckinsey.com/v1alpha1",
        "kind": "Memory",
        "metadata": metadata,
        "spec": spec if spec is not None else {"address": {"value": BROKER_URL}},
        "status": status or {},
    }
    return obj


class MemoriesTestBase(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        patcher = patch("ark_api.api.v1.memories.with_ark_client")
        mock_with_client = patcher.start()
        self.addCleanup(patcher.stop)
        self.ark = AsyncMock()
        mock_with_client.return_value.__aenter__.return_value = self.ark


class TestCreateMemory(MemoriesTestBase):
    def test_sends_the_crd_spec(self):
        self.ark.memories.a_create = AsyncMock(return_value=_memory(
            spec={
                "address": {"value": BROKER_URL},
                "headers": [{"name": "X-Tenant", "value": {"value": "a"}}],
            },
            labels={"team": "a"},
        ))

        response = self.client.post("/v1/memories?namespace=default", json={
            "name": "m",
            "labels": {"team": "a"},
            "spec": {
                "address": {"value": BROKER_URL},
                "headers": [{"name": "X-Tenant", "value": {"value": "a"}}],
            },
        })

        self.assertEqual(response.status_code, 200)
        sent = self.ark.memories.a_create.call_args.args[0].to_dict()
        self.assertEqual(sent["metadata"]["name"], "m")
        self.assertEqual(sent["metadata"]["namespace"], "default")
        self.assertEqual(sent["metadata"]["labels"], {"team": "a"})
        self.assertEqual(sent["spec"], {
            "address": {"value": BROKER_URL},
            "headers": [{"name": "X-Tenant", "value": {"value": "a"}}],
        })
        body = response.json()
        self.assertEqual(body["spec"]["address"]["value"], BROKER_URL)
        self.assertEqual(body["labels"], {"team": "a"})
        self.assertNotIn("description", body)
        self.assertNotIn("config", body)

    def test_value_from_is_sent_without_a_null_value(self):
        self.ark.memories.a_create = AsyncMock(return_value=_memory())
        service_ref = {"name": "ark-broker", "port": "http"}

        response = self.client.post("/v1/memories?namespace=default", json={
            "name": "m",
            "spec": {"address": {"valueFrom": {"serviceRef": service_ref}}},
        })

        self.assertEqual(response.status_code, 200)
        sent = self.ark.memories.a_create.call_args.args[0].to_dict()
        self.assertEqual(sent["spec"]["address"], {"valueFrom": {"serviceRef": service_ref}})

    def test_invalid_bodies_are_rejected_before_reaching_the_cluster(self):
        self.ark.memories.a_create = AsyncMock()
        cases = {
            "missing spec": {"name": "m"},
            "missing address": {"name": "m", "spec": {}},
            "empty address": {"name": "m", "spec": {"address": {}}},
            "both value and valueFrom": {"name": "m", "spec": {"address": {
                "value": BROKER_URL,
                "valueFrom": {"serviceRef": {"name": "ark-broker"}},
            }}},
            "header without value": {"name": "m", "spec": {
                "address": {"value": BROKER_URL},
                "headers": [{"name": "X"}],
            }},
            "old description and config body": {
                "name": "m",
                "description": "repro",
                "config": {"address": {"value": BROKER_URL}},
            },
        }
        for label, body in cases.items():
            with self.subTest(label):
                response = self.client.post("/v1/memories?namespace=default", json=body)
                self.assertEqual(response.status_code, 422)
        self.ark.memories.a_create.assert_not_called()


class TestUpdateMemory(MemoriesTestBase):
    def test_spec_replaces_the_stored_spec_and_keeps_labels(self):
        self.ark.memories.a_get = AsyncMock(return_value=_memory(
            spec={
                "address": {"value": BROKER_URL},
                "headers": [{"name": "X-Tenant", "value": {"value": "a"}}],
            },
            labels={"team": "a"},
        ))
        self.ark.memories.a_update = AsyncMock(return_value=_memory())

        response = self.client.put("/v1/memories/m?namespace=default", json={
            "spec": {"address": {"value": "http://other:8080"}},
        })

        self.assertEqual(response.status_code, 200)
        sent = self.ark.memories.a_update.call_args.args[0].to_dict()
        self.assertEqual(sent["spec"], {"address": {"value": "http://other:8080"}})
        self.assertEqual(sent["metadata"]["labels"], {"team": "a"})

    def test_labels_only_leaves_the_spec_untouched(self):
        stored_spec = {"address": {"valueFrom": {"serviceRef": {"name": "ark-broker"}}}}
        self.ark.memories.a_get = AsyncMock(return_value=_memory(
            spec=stored_spec, labels={"team": "a"},
        ))
        self.ark.memories.a_update = AsyncMock(return_value=_memory())

        response = self.client.put("/v1/memories/m?namespace=default", json={
            "labels": {"team": "b"},
        })

        self.assertEqual(response.status_code, 200)
        sent = self.ark.memories.a_update.call_args.args[0].to_dict()
        self.assertEqual(sent["spec"], stored_spec)
        self.assertEqual(sent["metadata"]["labels"], {"team": "b"})

    def test_invalid_spec_is_rejected_before_reaching_the_cluster(self):
        self.ark.memories.a_get = AsyncMock()
        self.ark.memories.a_update = AsyncMock()

        response = self.client.put("/v1/memories/m?namespace=default", json={
            "spec": {"address": {}},
        })

        self.assertEqual(response.status_code, 422)
        self.ark.memories.a_update.assert_not_called()


class TestReadMemory(MemoriesTestBase):
    def test_get_returns_spec_labels_and_annotations(self):
        self.ark.memories.a_get = AsyncMock(return_value=_memory(
            spec={
                "address": {"valueFrom": {"serviceRef": {"name": "ark-broker", "port": "http"}}},
                "headers": [{"name": "Authorization", "value": {
                    "valueFrom": {"secretKeyRef": {"name": "creds", "key": "token"}},
                }}],
            },
            labels={"team": "a"},
            annotations={"note": "x"},
            status={"phase": "ready", "lastResolvedAddress": BROKER_URL},
        ))

        response = self.client.get("/v1/memories/m?namespace=default")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["spec"]["address"]["valueFrom"]["serviceRef"]["name"], "ark-broker")
        self.assertEqual(
            body["spec"]["headers"][0]["value"]["valueFrom"]["secretKeyRef"],
            {"name": "creds", "key": "token", "optional": None},
        )
        self.assertEqual(body["labels"], {"team": "a"})
        self.assertEqual(body["annotations"], {"note": "x"})
        self.assertEqual(body["status"]["lastResolvedAddress"], BROKER_URL)
        self.assertNotIn("description", body)
        self.assertNotIn("config", body)

    def test_list_items_carry_labels_and_phase(self):
        page = Mock(items=[_memory(labels={"team": "a"}, status={"phase": "ready"})],
                    continue_token=None, remaining_item_count=None)
        self.ark.memories.a_list_page = AsyncMock(return_value=page)

        response = self.client.get("/v1/memories?namespace=default")

        self.assertEqual(response.status_code, 200)
        item = response.json()["items"][0]
        self.assertEqual(item, {
            "name": "m", "namespace": "default", "labels": {"team": "a"}, "status": "ready",
        })


if __name__ == "__main__":
    unittest.main()
