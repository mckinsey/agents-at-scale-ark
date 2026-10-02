"""Grouping workflow templates on the dashboard's Workflow Templates page.

A group is dashboard state rather than a cluster resource - the page keeps the
layout per namespace in browser storage - so this journey asserts what the page
shows and what is still there after a reload. The test starts from a fresh
browser context, and so from an empty layout.
"""

from pathlib import Path

import pytest
from playwright.sync_api import Page

from pages.workflow_templates_page import WorkflowTemplatesPage
from shared.k8s import apply_yaml, delete_resource

TEMPLATE_FIXTURE = (
    Path(__file__).parent.parent / "fixtures" / "workflow-template-group-sample.yaml"
)
GROUPED_TEMPLATE = "ui-grouped-workflow"

GROUP_NAME = "Data Pipelines"
GROUP_DESCRIPTION = "Templates the data team owns"
RENAMED_GROUP = "Ingestion Pipelines"
RENAMED_DESCRIPTION = "Renamed while the group already existed"


@pytest.fixture(scope="module")
def grouped_template():
    """One template for the group to hold."""
    applied, message = apply_yaml(TEMPLATE_FIXTURE.read_text())
    assert applied, f"could not create the workflow template to group: {message}"

    yield GROUPED_TEMPLATE

    delete_resource("workflowtemplate", GROUPED_TEMPLATE)


@pytest.mark.workflows
@pytest.mark.xdist_group("ark_workflows")
class TestWorkflowTemplateGroups:
    """The life of one group: created, renamed, filled, then deleted."""

    def test_a_group_can_be_created_edited_and_deleted(
        self, page: Page, grouped_template
    ):
        templates = WorkflowTemplatesPage(page)
        templates.navigate_to_workflow_templates()
        templates.wait_for_template_row(grouped_template)

        templates.create_group(GROUP_NAME, GROUP_DESCRIPTION)
        assert templates.group_names() == [GROUP_NAME], (
            f"the page should list the group that was just created, but showed "
            f"{templates.group_names()}"
        )
        assert templates.get_group_description(GROUP_NAME) == GROUP_DESCRIPTION, (
            "the group should carry the description it was given, but showed "
            f"{templates.get_group_description(GROUP_NAME)!r}"
        )

        templates.open_edit_group_dialog(GROUP_NAME)
        assert templates.get_group_dialog_values() == {
            "title": "Edit Group",
            "name": GROUP_NAME,
            "description": GROUP_DESCRIPTION,
        }, (
            "editing should open on the group's current values, but the dialog held "
            f"{templates.get_group_dialog_values()}"
        )

        templates.submit_group_dialog(RENAMED_GROUP, RENAMED_DESCRIPTION)
        templates.wait_for_group(RENAMED_GROUP)
        assert templates.group_names() == [RENAMED_GROUP], (
            f"the edit should rename the group in place, but the page showed "
            f"{templates.group_names()}"
        )
        assert templates.get_group_description(RENAMED_GROUP) == RENAMED_DESCRIPTION, (
            "the edited description should be shown, but the group read "
            f"{templates.get_group_description(RENAMED_GROUP)!r}"
        )

        templates.reload()
        templates.wait_for_template_row(grouped_template)
        assert templates.group_names() == [RENAMED_GROUP], (
            "the group and its rename should survive a reload, but the page showed "
            f"{templates.group_names()}"
        )

        templates.drag_template_into_group(grouped_template, RENAMED_GROUP)
        assert templates.group_member_names(RENAMED_GROUP) == [grouped_template], (
            f"{grouped_template} should be inside the group before it is deleted, but "
            f"the group held {templates.group_member_names(RENAMED_GROUP)}"
        )

        warning = templates.open_delete_group_dialog(RENAMED_GROUP)
        assert f'Delete group "{RENAMED_GROUP}"?' in warning, (
            f"the confirmation should name the group being deleted, but read {warning!r}"
        )
        assert "1 workflow will return to Ungrouped" in warning, (
            "the confirmation should say the grouped workflow is not lost, but read "
            f"{warning!r}"
        )

        templates.confirm_delete_group(RENAMED_GROUP)
        assert templates.group_names() == [], (
            f"no group should be left after deleting the only one, but the page showed "
            f"{templates.group_names()}"
        )
        assert grouped_template in templates.listed_template_names(), (
            f"{grouped_template} should still be listed after its group was deleted, "
            f"but the page showed {templates.listed_template_names()}"
        )

        templates.reload()
        templates.wait_for_template_row(grouped_template)
        assert templates.group_names() == [], (
            "the deleted group should not come back after a reload, but the page "
            f"showed {templates.group_names()}"
        )
