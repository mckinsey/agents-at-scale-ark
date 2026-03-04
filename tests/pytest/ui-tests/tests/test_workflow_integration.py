import pytest
import subprocess
import time
import os
import logging
from pathlib import Path
from playwright.sync_api import Page, expect

from pages.dashboard_page import DashboardPage
from pages.workflows_page import WorkflowsPage

logger = logging.getLogger(__name__)


@pytest.mark.workflows
@pytest.mark.xdist_group("ark_workflows")
class TestWorkflowIntegration:
    
    def test_engineering_workflow_full_cycle(self, page: Page):
        dashboard = DashboardPage(page)
        workflows_page = WorkflowsPage(page)
        workflow_name = ""
        
        test_dir = Path(__file__).parent.parent
        workflow_template_path = test_dir / "fixtures" / "engineering-workflow-sample.yaml"
        run_workflow_path = test_dir / "fixtures" / "run-engineering-workflow.yaml"
        
        try:
            create_template_result = subprocess.run(
                ["kubectl", "apply", "-f", workflow_template_path],
                capture_output=True,
                text=True,
                timeout=30
            )
            if create_template_result.returncode != 0:
                pytest.fail(f"Failed to create WorkflowTemplate: {create_template_result.stderr}")
            logger.info("WorkflowTemplate created successfully")
            
            wait_template_result = subprocess.run(
                ["kubectl", "get", "workflowtemplate", "engineering-build-test", "-n", "default"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if wait_template_result.returncode == 0:
                logger.info("WorkflowTemplate is available")
            
            dashboard.navigate_to_dashboard()
            expect(page.locator(dashboard.MAIN_CONTENT)).to_be_visible(timeout=15000)
            logger.info("ARK Dashboard loaded")

            page.goto(f"{dashboard.base_url}/workflow-templates")
            page.wait_for_load_state("networkidle", timeout=15000)
            assert "/workflow-templates" in page.url, f"Expected /workflow-templates in URL, got: {page.url}"
            logger.info("Navigated to Workflow Templates page")

            argo_link = page.locator("a[href*='argo'], button:has-text('Open in Argo')").first
            if argo_link.is_visible(timeout=5000):
                logger.info("Argo Workflows link available on page")
            else:
                logger.info("Continuing without Argo link verification")

            dashboard.navigate_to_dashboard()
            expect(page.locator(dashboard.MAIN_CONTENT)).to_be_visible(timeout=15000)
            logger.info("Back to ARK Dashboard")

            create_result = subprocess.run(
                ["kubectl", "create", "-f", str(run_workflow_path)],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            assert create_result.returncode == 0, f"Failed to create workflow: {create_result.stderr}"
            workflow_name = create_result.stdout.strip().split('/')[-1].split()[0]
            logger.info(f"Workflow created: {workflow_name}")
            
            wait_result = subprocess.run(
                ["kubectl", "wait", "--for=condition=Ready", "workflow", workflow_name, "-n", "default", "--timeout=10s"],
                capture_output=True,
                text=True,
                timeout=15
            )
            if wait_result.returncode != 0:
                logger.warning("Workflow wait timed out, continuing anyway")
            else:
                logger.info("Workflow is ready")

            page.goto(f"{dashboard.base_url}/workflow-templates")
            page.wait_for_load_state("networkidle", timeout=15000)
            assert "/workflow-templates" in page.url, f"Expected /workflow-templates in URL, got: {page.url}"
            logger.info("Viewing Workflow Templates page in ARK")

            final_status = ""
            for i in range(0, 90, 5):
                status_result = subprocess.run(
                    ["kubectl", "get", "workflow", workflow_name, "-n", "default", "-o", "jsonpath={.status.phase}"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                current_status = status_result.stdout.strip()
                logger.info(f"Status check at {i}s: {current_status}")
                
                if current_status == "Succeeded":
                    final_status = current_status
                    logger.info(f"Workflow completed successfully after {i} seconds")
                    break
                elif current_status in ["Failed", "Error"]:
                    final_status = current_status
                    break
                
                time.sleep(5)
            else:
                status_result = subprocess.run(
                    ["kubectl", "get", "workflow", workflow_name, "-n", "default", "-o", "jsonpath={.status.phase}"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                final_status = status_result.stdout.strip()

            assert final_status == "Succeeded", f"Workflow did not succeed. Final status: {final_status}"

            workflows_page.navigate_to_workflows()
            workflows_page.close_modal_if_present()
            workflows_page.search_workflow(workflow_name)
            
            workflow_link = page.locator(f"text={workflow_name}").first
            expect(workflow_link).to_be_visible(timeout=15000)
            logger.info(f"Workflow {workflow_name} visible in Argo")
            
            workflows_page.click_workflow(workflow_name)
            page.wait_for_load_state("domcontentloaded", timeout=15000)
            workflows_page.close_modal_if_present()
            logger.info("Opened workflow details in Argo")

            argo_status = workflows_page.get_workflow_status()
            logger.info(f"Workflow status in Argo UI: {argo_status}")
            
            if argo_status and argo_status != "Unknown":
                logger.info(f"Status verified in Argo UI: {argo_status}")
            else:
                logger.info(f"Status from kubectl: {final_status} (UI status: {argo_status})")

            logs_result = subprocess.run(
                ["kubectl", "logs", "-n", "default", "-l", f"workflows.argoproj.io/workflow={workflow_name}", "--tail=30"],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            logs = logs_result.stdout
            logger.info(f"Workflow logs sample:\n{logs[:300]}")
            assert "Workflow completed successfully" in logs or "Starting engineering workflow" in logs, \
                "Expected log message not found"

            logger.info("Test Passed Successfully")
            logger.info("Workflow verified in both ARK Dashboard and Argo Dashboard")

        except Exception as e:
            logger.error(f"Test Failed: {e}")
            pytest.fail(f"Test failed: {e}")
            
        finally:
            if workflow_name:
                logger.info(f"Cleanup: Deleting workflow {workflow_name}")
                delete_result = subprocess.run(
                    ["kubectl", "delete", "workflow", workflow_name, "-n", "default"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if delete_result.returncode == 0:
                    logger.info(f"Workflow {workflow_name} deleted successfully")
                    
                    verify_result = subprocess.run(
                        ["kubectl", "get", "workflow", workflow_name, "-n", "default"],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if verify_result.returncode != 0:
                        logger.info("Verified: Workflow no longer exists")
                else:
                    logger.warning(f"Workflow deletion warning: {delete_result.stderr}")
                
                logger.info("Workflow cleanup completed")
            
            delete_template_result = subprocess.run(
                ["kubectl", "delete", "-f", workflow_template_path],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if delete_template_result.returncode == 0:
                logger.info("WorkflowTemplate deleted successfully")
            else:
                logger.warning(f"WorkflowTemplate deletion warning: {delete_template_result.stderr}")
        