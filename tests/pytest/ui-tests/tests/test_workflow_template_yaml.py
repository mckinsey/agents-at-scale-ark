"""Authoring a workflow template from YAML in the dashboard's Workflow Studio.

The studio is the only way to add a template from the dashboard: name it, paste
or write the manifest in the YAML view, and save. What lands in the cluster is
read back with kubectl, since that is what the studio claims to have written,
and the template is then run so the whole journey - author, run, see the status
under Monitoring - is covered.
"""

import re
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect

from pages.workflow_templates_page import WorkflowTemplatesPage
from shared.k8s import delete_resource, get_resource, wait_for_phase

STUDIO_MANIFEST = (
    Path(__file__).parent.parent / "fixtures" / "workflow-template-studio.yaml"
)

TEMPLATE_NAME = "ui-studio-workflow"
MANIFEST_NAME = "name-replaced-by-the-studio"
MANIFEST_TITLE = "Pasted Studio Workflow"
MANIFEST_DESCRIPTION = "Declared in the pasted manifest"

RUN_NAME = f"{TEMPLATE_NAME}-run"
RUN_PHASE_SUCCEEDED = "Succeeded"
# The run pulls alpine and echoes one line; the wait covers a cold image pull.
RUN_TIMEOUT_S = 300


@pytest.fixture
def studio_template():
    """The name the studio will save under, cleared before and after.

    A template left behind by an aborted run would turn the studio's Create into
    an overwrite prompt, so this cannot be teardown-only.
    """
    delete_resource("workflow", RUN_NAME)
    for name in (TEMPLATE_NAME, MANIFEST_NAME):
        delete_resource("workflowtemplate", name)

    yield TEMPLATE_NAME

    delete_resource("workflow", RUN_NAME)
    for name in (TEMPLATE_NAME, MANIFEST_NAME):
        delete_resource("workflowtemplate", name)


@pytest.mark.workflows
@pytest.mark.xdist_group("ark_workflows")
class TestWorkflowTemplateYamlAuthoring:
    """Adding a workflow template through the studio's YAML editor."""

    def test_pasted_yaml_is_saved_then_run_and_reported_under_monitoring(
        self, page: Page, studio_template
    ):
        templates = WorkflowTemplatesPage(page)
        templates.navigate_to_workflow_templates()
        templates.open_studio_for_new_template(
            studio_template, "UI Studio Workflow", "Typed into the naming dialog"
        )
        templates.write_yaml(STUDIO_MANIFEST.read_text())

        assert templates.is_save_enabled(), (
            "the studio should offer to save a valid WorkflowTemplate manifest"
        )
        toast = templates.save_template()
        assert "Workflow saved" in toast, (
            f"saving should confirm the template was written, but the toast read {toast!r}"
        )
        expect(page).to_have_url(
            re.compile(rf"/workflow-templates/{studio_template}"), timeout=30000
        )

        template = get_resource("workflowtemplate", studio_template)
        assert template is not None, (
            f"the studio reported saving {studio_template}, but no such workflow "
            "template exists in the cluster"
        )

        annotations = template["metadata"].get("annotations") or {}
        assert annotations.get("workflows.argoproj.io/title") == MANIFEST_TITLE, (
            "the title annotation of the pasted manifest should reach the cluster, but "
            f"the saved template's annotations were {annotations}"
        )
        assert annotations.get("workflows.argoproj.io/description") == MANIFEST_DESCRIPTION, (
            "the description annotation of the pasted manifest should reach the "
            f"cluster, but the saved template's annotations were {annotations}"
        )

        assert template["spec"]["entrypoint"] == "pipeline", (
            "the saved template should keep the entrypoint from the pasted YAML, but "
            f"had {template['spec'].get('entrypoint')!r}"
        )
        saved_steps = [step["name"] for step in template["spec"]["templates"]]
        assert saved_steps == [
            "pipeline",
            "extract-rows",
            "validate-rows",
            "summarise-run",
        ], (
            f"the saved template should keep the steps from the pasted YAML, but had "
            f"{saved_steps}"
        )
        assert get_resource("workflowtemplate", MANIFEST_NAME) is None, (
            "the studio should save under the name given in the dialog, not the "
            f"metadata.name of the pasted YAML ({MANIFEST_NAME})"
        )

        run_toast = templates.run_workflow(RUN_NAME)
        assert "Workflow started" in run_toast, (
            f"running the template should confirm the run started, but the toast read "
            f"{run_toast!r}"
        )

        finished, message = wait_for_phase(
            "workflow", RUN_NAME, RUN_PHASE_SUCCEEDED, timeout_s=RUN_TIMEOUT_S
        )
        assert finished, f"the run started from the studio never succeeded: {message}"

        templates.navigate_to_workflow_templates()
        row = templates.get_template_row_text(studio_template)
        assert MANIFEST_TITLE in row and MANIFEST_DESCRIPTION in row, (
            "the list should show the new template with its display name and "
            f"description, but its row read {row!r}"
        )

        templates.navigate_to_workflow_runs()
        status = templates.get_workflow_run_status(RUN_NAME)
        assert status == "succeeded", (
            f"Monitoring should report {RUN_NAME} as succeeded, but the run showed "
            f"{status!r}"
        )

    @pytest.mark.parametrize(
        "manifest, expected_error",
        [
            pytest.param(
                "kind: Workflow\nspec:\n  templates:\n    - name: greet\n",
                'Missing "kind: WorkflowTemplate".',
                id="wrong-kind",
            ),
            pytest.param(
                "kind: WorkflowTemplate\n",
                'Missing "spec" mapping.',
                id="no-spec",
            ),
            pytest.param(
                "kind: WorkflowTemplate\nspec:\n  templates: []\n",
                'Missing a non-empty "spec.templates".',
                id="no-steps",
            ),
        ],
    )
    def test_yaml_the_studio_cannot_save_is_reported_in_the_editor(
        self, page: Page, manifest: str, expected_error: str
    ):
        templates = WorkflowTemplatesPage(page)
        templates.navigate_to_workflow_templates()
        templates.open_studio_for_new_template(
            "ui-studio-rejected-workflow", "UI Studio Rejected", ""
        )
        templates.write_yaml(manifest)

        error = templates.get_yaml_error()
        assert expected_error in error, (
            f"the editor should explain why the manifest is invalid, but reported "
            f"{error!r}"
        )
        assert not templates.is_save_enabled(), (
            "the studio must not offer to save a manifest it reports as invalid"
        )
