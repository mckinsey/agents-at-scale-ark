"""Workflow lifecycle actions are writes and must never fall back to the service account."""
import json
import os
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock, patch

from kubernetes_asyncio.client.rest import ApiException
from kubernetes_asyncio.dynamic.exceptions import api_exception

os.environ["AUTH_MODE"] = "open"

from ark_sdk.impersonation import ImpersonationConfig
from ark_api.api.v1 import resources

USER = ImpersonationConfig(username="alice@example.com", groups=["viewers"])
SUSPENDED_RUNNING = {
    "apiVersion": "argoproj.io/v1alpha1",
    "kind": "Workflow",
    "metadata": {"name": "wf-1", "labels": {}},
    "spec": {"suspend": True, "entrypoint": "main"},
    "status": {"phase": "Running", "nodes": {}},
}
ACTIONS = {
    "suspend": resources.suspend_workflow,
    "resume": resources.resume_workflow,
    "stop": resources.stop_workflow,
    "terminate": resources.terminate_workflow,
    "retry": resources.retry_workflow,
    "resubmit": resources.resubmit_workflow,
}


def forbidden():
    return api_exception(ApiException(status=403, reason="Forbidden"))


class LifecycleCluster:
    """A Workflow API that refuses the user and records which identity each call ran as."""

    def __init__(self, refuse):
        self.refuse = refuse
        self.calls = []

    @asynccontextmanager
    async def api_client(self, impersonation):
        yield "user" if impersonation is not None else "service-account"

    async def dynamic_client(self, identity):
        workflow_resource = Mock()
        workflow_resource.get = self._verb("get", identity, SUSPENDED_RUNNING)
        workflow_resource.patch = self._verb("patch", identity, SUSPENDED_RUNNING)
        workflow_resource.replace = self._verb("replace", identity, SUSPENDED_RUNNING)
        workflow_resource.create = self._verb("create", identity, SUSPENDED_RUNNING)
        client = Mock()
        client.resources.get = AsyncMock(return_value=workflow_resource)
        return client

    def _verb(self, verb, identity, payload):
        async def call(**_kwargs):
            self.calls.append((verb, identity))
            if identity == "user" and verb in self.refuse:
                raise forbidden()
            result = Mock()
            result.to_dict.return_value = json.loads(json.dumps(payload))
            return result

        return call


class TestLifecycleActionsNeverFallBack(unittest.IsolatedAsyncioTestCase):
    async def _run(self, action, refuse):
        cluster = LifecycleCluster(refuse)
        with patch.dict(os.environ, {"IMPERSONATION_FALLBACK": "true"}), \
                patch.object(resources, "get_impersonating_api_client", cluster.api_client), \
                patch.object(resources, "create_dynamic_client", cluster.dynamic_client):
            response = await ACTIONS[action](
                request=Mock(headers={}), workflow_name="wf-1", namespace="default", impersonation=USER
            )
        return response, cluster.calls

    async def test_a_read_refused_to_the_user_is_not_retried_as_the_service_account(self):
        for action in ACTIONS:
            with self.subTest(action=action):
                response, calls = await self._run(action, refuse={"get"})

                self.assertEqual(response.status_code, 403)
                self.assertEqual(json.loads(response.body)["error"], "impersonation_forbidden")
                self.assertNotIn("X-Ark-Impersonation-Fallback", response.headers)
                self.assertEqual(calls, [("get", "user")])

    async def test_a_write_refused_to_the_user_is_not_retried_as_the_service_account(self):
        writes = {"suspend": "patch", "stop": "patch", "terminate": "patch", "resume": "replace", "resubmit": "create"}
        for action, verb in writes.items():
            with self.subTest(action=action):
                response, calls = await self._run(action, refuse={verb})

                self.assertEqual(response.status_code, 403)
                self.assertNotIn("service-account", [identity for _, identity in calls])
                self.assertEqual(calls[-1], (verb, "user"))


if __name__ == "__main__":
    unittest.main()
