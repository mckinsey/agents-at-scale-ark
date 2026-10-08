"""Tests for the pure Argo Workflow lifecycle CR mutations."""
import unittest

from ark_api.api.v1.workflow_lifecycle import (
    LABEL_ARCHIVING_STATUS,
    LABEL_COMPLETED,
    LABEL_PHASE,
    LABEL_RESUBMITTED_FROM,
    LifecyclePreconditionError,
    formulate_resubmit_workflow,
    formulate_resume_workflow,
    formulate_retry_workflow,
    validate_stoppable,
    validate_suspendable,
)


def _failed_workflow() -> dict:
    """A two-step workflow (ok-step then fail-step) that failed on the pod node.

    Mirrors the shape observed on a real cluster: a top Steps node, a StepGroup,
    and a failed Pod leaf.
    """
    return {
        "apiVersion": "argoproj.io/v1alpha1",
        "kind": "Workflow",
        "metadata": {
            "name": "retry-test-abc",
            "generateName": "retry-test-",
            "labels": {
                LABEL_COMPLETED: "true",
                LABEL_PHASE: "Failed",
                "custom-label": "keep-me",
            },
        },
        "spec": {"entrypoint": "main", "shutdown": "Stop"},
        "status": {
            "phase": "Failed",
            "message": "child failed",
            "finishedAt": "2026-09-30T10:00:00Z",
            "startedAt": "2026-09-30T09:59:00Z",
            "nodes": {
                "retry-test-abc": {
                    "id": "retry-test-abc",
                    "name": "retry-test-abc",
                    "type": "Steps",
                    "phase": "Failed",
                    "children": ["retry-test-abc-group"],
                    "outboundNodes": ["retry-test-abc-111"],
                },
                "retry-test-abc-group": {
                    "id": "retry-test-abc-group",
                    "name": "retry-test-abc[0]",
                    "type": "StepGroup",
                    "phase": "Failed",
                    "boundaryID": "retry-test-abc",
                    "children": ["retry-test-abc-111"],
                },
                "retry-test-abc-111": {
                    "id": "retry-test-abc-111",
                    "name": "retry-test-abc[0].fail-step",
                    "type": "Pod",
                    "phase": "Failed",
                    "boundaryID": "retry-test-abc",
                    "outputs": {"parameters": []},
                },
            },
        },
    }


class TestRetryWorkflow(unittest.TestCase):
    def test_rejects_non_failed_phase(self):
        wf = _failed_workflow()
        wf["status"]["phase"] = "Running"
        with self.assertRaises(LifecyclePreconditionError):
            formulate_retry_workflow(wf)

    def test_rejects_when_node_still_running(self):
        wf = _failed_workflow()
        wf["status"]["nodes"]["retry-test-abc-111"]["phase"] = "Running"
        with self.assertRaises(LifecyclePreconditionError):
            formulate_retry_workflow(wf)

    def test_resets_top_level_status_and_labels(self):
        new_wf, _ = formulate_retry_workflow(_failed_workflow())
        status = new_wf["status"]
        self.assertEqual(status["phase"], "Running")
        self.assertEqual(status["message"], "")
        self.assertIsNone(status["finishedAt"])
        self.assertEqual(status["persistentVolumeClaims"], [])
        self.assertIn({"type": "Completed", "status": "False"}, status["conditions"])

        labels = new_wf["metadata"]["labels"]
        self.assertNotIn(LABEL_COMPLETED, labels)
        self.assertNotIn(LABEL_ARCHIVING_STATUS, labels)
        self.assertEqual(labels[LABEL_PHASE], "Running")
        self.assertEqual(labels["custom-label"], "keep-me")

    def test_clears_shutdown(self):
        new_wf, _ = formulate_retry_workflow(_failed_workflow())
        self.assertNotIn("shutdown", new_wf["spec"])

    def test_failed_group_nodes_reset_in_place(self):
        new_wf, _ = formulate_retry_workflow(_failed_workflow())
        nodes = new_wf["status"]["nodes"]
        # Both group nodes survive, reset to Running
        self.assertEqual(nodes["retry-test-abc"]["phase"], "Running")
        self.assertEqual(nodes["retry-test-abc-group"]["phase"], "Running")
        self.assertEqual(nodes["retry-test-abc"]["message"], "")

    def test_failed_pod_node_dropped_and_pod_deleted(self):
        new_wf, pods = formulate_retry_workflow(_failed_workflow())
        nodes = new_wf["status"]["nodes"]
        self.assertNotIn("retry-test-abc-111", nodes)
        self.assertEqual(pods, ["retry-test-abc-111"])
        # Dangling child reference is purged from the surviving group node
        self.assertEqual(nodes["retry-test-abc-group"].get("children"), [])
        self.assertEqual(nodes["retry-test-abc"].get("outboundNodes"), [])

    def test_succeeded_nodes_kept_verbatim(self):
        wf = _failed_workflow()
        wf["status"]["nodes"]["retry-test-abc-ok"] = {
            "id": "retry-test-abc-ok",
            "name": "retry-test-abc[0].ok-step",
            "type": "Pod",
            "phase": "Succeeded",
            "boundaryID": "retry-test-abc",
            "outputs": {"parameters": [{"name": "result", "value": "42"}]},
        }
        new_wf, pods = formulate_retry_workflow(wf)
        kept = new_wf["status"]["nodes"]["retry-test-abc-ok"]
        self.assertEqual(kept["phase"], "Succeeded")
        self.assertEqual(kept["outputs"]["parameters"][0]["value"], "42")
        self.assertNotIn("retry-test-abc-ok", pods)

    def test_failed_node_with_succeeded_descendant_is_kept(self):
        wf = _failed_workflow()
        # Make the failed pod a boundary whose child succeeded
        wf["status"]["nodes"]["retry-test-abc-111"]["type"] = "DAG"
        wf["status"]["nodes"]["retry-test-abc-111"]["children"] = ["retry-test-abc-child"]
        wf["status"]["nodes"]["retry-test-abc-child"] = {
            "id": "retry-test-abc-child",
            "type": "Pod",
            "phase": "Succeeded",
        }
        # DAG is a group type, so it resets in place regardless; use a non-group failed node instead
        wf["status"]["nodes"]["retry-test-abc-111"]["type"] = "Container"
        new_wf, _ = formulate_retry_workflow(wf)
        self.assertIn("retry-test-abc-111", new_wf["status"]["nodes"])

    def test_onexit_succeeded_node_is_dropped(self):
        wf = _failed_workflow()
        wf["status"]["nodes"]["retry-test-abc-onexit"] = {
            "id": "retry-test-abc-onexit",
            "name": "retry-test-abc.onExit",
            "type": "Pod",
            "phase": "Succeeded",
        }
        new_wf, pods = formulate_retry_workflow(wf)
        self.assertNotIn("retry-test-abc-onexit", new_wf["status"]["nodes"])
        self.assertIn("retry-test-abc-onexit", pods)

    def test_onexit_subtree_is_dropped_with_its_pods(self):
        wf = _failed_workflow()
        nodes = wf["status"]["nodes"]
        nodes["retry-test-abc-onexit"] = {
            "id": "retry-test-abc-onexit",
            "name": "retry-test-abc.onExit",
            "type": "Steps",
            "phase": "Succeeded",
            "children": ["retry-test-abc-exit-group"],
        }
        nodes["retry-test-abc-exit-group"] = {
            "id": "retry-test-abc-exit-group",
            "type": "StepGroup",
            "phase": "Succeeded",
            "children": ["retry-test-abc-exit-pod", "retry-test-abc-exit-pod"],
        }
        nodes["retry-test-abc-exit-pod"] = {
            "id": "retry-test-abc-exit-pod",
            "type": "Pod",
            "phase": "Succeeded",
        }
        new_wf, pods = formulate_retry_workflow(wf)
        new_nodes = new_wf["status"]["nodes"]
        for node_id in ("retry-test-abc-onexit", "retry-test-abc-exit-group", "retry-test-abc-exit-pod"):
            self.assertNotIn(node_id, new_nodes)
        self.assertEqual(pods.count("retry-test-abc-exit-pod"), 1)
        self.assertNotIn("retry-test-abc-onexit", pods)

    def test_failed_node_with_deeper_succeeded_descendant_is_kept(self):
        wf = _failed_workflow()
        nodes = wf["status"]["nodes"]
        nodes["retry-test-abc-111"]["type"] = "Container"
        nodes["retry-test-abc-111"]["children"] = [
            "retry-test-abc-dead",
            "retry-test-abc-dead",
            "missing-node",
            "retry-test-abc-mid",
        ]
        nodes["retry-test-abc-dead"] = {"id": "retry-test-abc-dead", "type": "Pod", "phase": "Failed"}
        nodes["retry-test-abc-mid"] = {
            "id": "retry-test-abc-mid",
            "type": "Container",
            "phase": "Failed",
            "children": ["retry-test-abc-leaf"],
        }
        nodes["retry-test-abc-leaf"] = {"id": "retry-test-abc-leaf", "type": "Pod", "phase": "Succeeded"}
        new_wf, pods = formulate_retry_workflow(wf)
        self.assertIn("retry-test-abc-111", new_wf["status"]["nodes"])
        self.assertNotIn("retry-test-abc-111", pods)

    def test_failed_node_without_succeeded_descendant_is_dropped(self):
        wf = _failed_workflow()
        nodes = wf["status"]["nodes"]
        nodes["retry-test-abc-111"]["type"] = "Container"
        nodes["retry-test-abc-111"]["children"] = ["retry-test-abc-mid"]
        nodes["retry-test-abc-mid"] = {"id": "retry-test-abc-mid", "type": "Pod", "phase": "Failed"}
        new_wf, pods = formulate_retry_workflow(wf)
        self.assertNotIn("retry-test-abc-111", new_wf["status"]["nodes"])
        self.assertEqual(pods, ["retry-test-abc-mid"])

    def test_retry_node_is_dropped_even_with_succeeded_child(self):
        wf = _failed_workflow()
        nodes = wf["status"]["nodes"]
        nodes["retry-test-abc-111"]["type"] = "Retry"
        nodes["retry-test-abc-111"]["children"] = ["retry-test-abc-attempt"]
        nodes["retry-test-abc-attempt"] = {"id": "retry-test-abc-attempt", "type": "Pod", "phase": "Succeeded"}
        new_wf, _ = formulate_retry_workflow(wf)
        self.assertNotIn("retry-test-abc-111", new_wf["status"]["nodes"])

    def test_existing_completed_condition_is_flipped_not_duplicated(self):
        wf = _failed_workflow()
        wf["status"]["conditions"] = [
            {"type": "PodRunning", "status": "False"},
            {"type": "Completed", "status": "True"},
        ]
        new_wf, _ = formulate_retry_workflow(wf)
        conditions = new_wf["status"]["conditions"]
        completed = [c for c in conditions if c["type"] == "Completed"]
        self.assertEqual(completed, [{"type": "Completed", "status": "False"}])
        self.assertIn({"type": "PodRunning", "status": "False"}, conditions)

    def test_clears_zero_active_deadline(self):
        wf = _failed_workflow()
        wf["spec"]["activeDeadlineSeconds"] = 0
        new_wf, _ = formulate_retry_workflow(wf)
        self.assertIsNone(new_wf["spec"]["activeDeadlineSeconds"])

    def test_keeps_non_zero_active_deadline(self):
        wf = _failed_workflow()
        wf["spec"]["activeDeadlineSeconds"] = 300
        new_wf, _ = formulate_retry_workflow(wf)
        self.assertEqual(new_wf["spec"]["activeDeadlineSeconds"], 300)

    def test_clears_shutdown_in_stored_workflow_spec(self):
        wf = _failed_workflow()
        wf["status"]["storedWorkflowSpec"] = {"entrypoint": "main", "shutdown": "Stop"}
        new_wf, _ = formulate_retry_workflow(wf)
        self.assertEqual(new_wf["status"]["storedWorkflowSpec"], {"entrypoint": "main"})

    def test_does_not_mutate_input(self):
        wf = _failed_workflow()
        formulate_retry_workflow(wf)
        self.assertEqual(wf, _failed_workflow())


class TestResumeWorkflow(unittest.TestCase):
    def test_clears_spec_suspend(self):
        wf = {"spec": {"suspend": True}, "status": {"nodes": {}}}
        new_wf = formulate_resume_workflow(wf)
        self.assertNotIn("suspend", new_wf["spec"])

    def test_resolves_active_suspend_node(self):
        wf = {
            "spec": {"suspend": True},
            "status": {
                "nodes": {
                    "gate": {"id": "gate", "type": "Suspend", "phase": "Running"},
                }
            },
        }
        new_wf = formulate_resume_workflow(wf)
        self.assertEqual(new_wf["status"]["nodes"]["gate"]["phase"], "Succeeded")
        self.assertIn("finishedAt", new_wf["status"]["nodes"]["gate"])

    def test_resolves_suspend_output_default(self):
        wf = {
            "spec": {},
            "status": {
                "nodes": {
                    "gate": {
                        "id": "gate",
                        "type": "Suspend",
                        "phase": "Running",
                        "outputs": {"parameters": [{"name": "approve", "valueFrom": {"default": "yes"}}]},
                    }
                }
            },
        }
        new_wf = formulate_resume_workflow(wf)
        param = new_wf["status"]["nodes"]["gate"]["outputs"]["parameters"][0]
        self.assertEqual(param["value"], "yes")
        self.assertIsNone(param["valueFrom"])

    def test_errors_when_suspend_output_has_no_value(self):
        wf = {
            "spec": {},
            "status": {
                "nodes": {
                    "gate": {
                        "id": "gate",
                        "type": "Suspend",
                        "phase": "Running",
                        "outputs": {"parameters": [{"name": "approve", "valueFrom": {}}]},
                    }
                }
            },
        }
        with self.assertRaises(LifecyclePreconditionError):
            formulate_resume_workflow(wf)

    def test_leaves_non_suspend_and_finished_suspend_nodes_untouched(self):
        wf = {
            "spec": {"suspend": True},
            "status": {
                "nodes": {
                    "pod": {"id": "pod", "type": "Pod", "phase": "Running"},
                    "done-gate": {"id": "done-gate", "type": "Suspend", "phase": "Succeeded"},
                }
            },
        }
        new_wf = formulate_resume_workflow(wf)
        self.assertEqual(new_wf["status"]["nodes"], wf["status"]["nodes"])

    def test_keeps_suspend_output_with_supplied_value(self):
        wf = {
            "spec": {},
            "status": {
                "nodes": {
                    "gate": {
                        "id": "gate",
                        "type": "Suspend",
                        "phase": "Running",
                        "outputs": {"parameters": [{"name": "approve", "value": "no", "valueFrom": {}}]},
                    }
                }
            },
        }
        new_wf = formulate_resume_workflow(wf)
        gate = new_wf["status"]["nodes"]["gate"]
        self.assertEqual(gate["phase"], "Succeeded")
        self.assertEqual(gate["outputs"]["parameters"][0]["value"], "no")


class TestResubmitWorkflow(unittest.TestCase):
    def test_builds_fresh_object(self):
        new_wf = formulate_resubmit_workflow(_failed_workflow())
        self.assertNotIn("status", new_wf)
        self.assertNotIn("name", new_wf["metadata"])
        self.assertEqual(new_wf["metadata"]["generateName"], "retry-test-")

    def test_strips_status_labels_and_adds_provenance(self):
        new_wf = formulate_resubmit_workflow(_failed_workflow())
        labels = new_wf["metadata"]["labels"]
        self.assertNotIn(LABEL_COMPLETED, labels)
        self.assertNotIn(LABEL_PHASE, labels)
        self.assertEqual(labels["custom-label"], "keep-me")
        self.assertEqual(labels[LABEL_RESUBMITTED_FROM], "retry-test-abc")

    def test_generatename_falls_back_to_name(self):
        wf = _failed_workflow()
        del wf["metadata"]["generateName"]
        new_wf = formulate_resubmit_workflow(wf)
        self.assertEqual(new_wf["metadata"]["generateName"], "retry-test-abc-")

    def test_clears_shutdown_in_spec(self):
        new_wf = formulate_resubmit_workflow(_failed_workflow())
        self.assertNotIn("shutdown", new_wf["spec"])

    def test_copies_annotations_and_owner_references(self):
        wf = _failed_workflow()
        wf["metadata"]["annotations"] = {"note": "keep"}
        wf["metadata"]["ownerReferences"] = [{"kind": "CronWorkflow", "name": "nightly"}]
        new_wf = formulate_resubmit_workflow(wf)
        self.assertEqual(new_wf["metadata"]["annotations"], {"note": "keep"})
        self.assertEqual(new_wf["metadata"]["ownerReferences"], [{"kind": "CronWorkflow", "name": "nightly"}])
        new_wf["metadata"]["annotations"]["note"] = "changed"
        self.assertEqual(wf["metadata"]["annotations"]["note"], "keep")

    def test_clears_zero_active_deadline(self):
        wf = _failed_workflow()
        wf["spec"]["activeDeadlineSeconds"] = 0
        new_wf = formulate_resubmit_workflow(wf)
        self.assertIsNone(new_wf["spec"]["activeDeadlineSeconds"])

    def test_defaults_api_version_and_kind(self):
        wf = _failed_workflow()
        del wf["apiVersion"]
        del wf["kind"]
        new_wf = formulate_resubmit_workflow(wf)
        self.assertEqual(new_wf["apiVersion"], "argoproj.io/v1alpha1")
        self.assertEqual(new_wf["kind"], "Workflow")


class TestValidators(unittest.TestCase):
    def test_suspend_rejects_completed(self):
        for phase in ("Succeeded", "Failed", "Error"):
            with self.assertRaises(LifecyclePreconditionError):
                validate_suspendable({"status": {"phase": phase}})

    def test_suspend_allows_running(self):
        validate_suspendable({"status": {"phase": "Running"}})

    def test_stop_rejects_completed(self):
        with self.assertRaises(LifecyclePreconditionError):
            validate_stoppable({"status": {"phase": "Succeeded"}})

    def test_stop_allows_running(self):
        validate_stoppable({"status": {"phase": "Running"}})


if __name__ == "__main__":
    unittest.main()
