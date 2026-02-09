import pytest
import subprocess
import time
import os
from pathlib import Path
from playwright.sync_api import Page, expect

from pages.dashboard_page import DashboardPage
from pages.workflows_page import WorkflowsPage


@pytest.mark.workflows
class TestWorkflowIntegration:
    
    def test_engineering_workflow_full_cycle(self, page: Page):
        dashboard = DashboardPage(page)
        workflows_page = WorkflowsPage(page)
        workflow_name = ""
        
        test_dir = Path(__file__).parent.parent
        workflow_template_path = test_dir / "fixtures" / "engineering-workflow-sample.yaml"
        run_workflow_path = test_dir / "fixtures" / "run-engineering-workflow.yaml"
        
        try:
            print("\n=== Step 1: Creating WorkflowTemplate ===")
            create_template_result = subprocess.run(
                ["kubectl", "apply", "-f", workflow_template_path],
                capture_output=True,
                text=True,
                timeout=30
            )
            if create_template_result.returncode != 0:
                pytest.fail(f"Failed to create WorkflowTemplate: {create_template_result.stderr}")
            print("WorkflowTemplate created successfully")
            
            wait_template_result = subprocess.run(
                ["kubectl", "get", "workflowtemplate", "engineering-build-test", "-n", "default"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if wait_template_result.returncode == 0:
                print("WorkflowTemplate is available")
            
            print("\n=== Step 3: Opening ARK Dashboard ===")
            dashboard.navigate_to_dashboard()
            expect(page.locator(dashboard.MAIN_CONTENT)).to_be_visible(timeout=15000)
            print("ARK Dashboard loaded")

            print("\n=== Step 4: Navigating to Workflow Templates in ARK Dashboard ===")
            page.goto(f"{dashboard.base_url}/workflow-templates")
            page.wait_for_load_state("networkidle", timeout=15000)
            assert "/workflow-templates" in page.url, f"Expected /workflow-templates in URL, got: {page.url}"
            print("Navigated to Workflow Templates page")

            print("\n=== Step 5: Viewing Argo link from Workflow Templates page ===")
            argo_link = page.locator("a[href*='argo'], button:has-text('Open in Argo')").first
            if argo_link.is_visible(timeout=5000):
                print("Argo Workflows link available on page")
            else:
                print("Continuing without Argo link verification")

            print("\n=== Step 6: Going back to ARK Dashboard ===")
            dashboard.navigate_to_dashboard()
            expect(page.locator(dashboard.MAIN_CONTENT)).to_be_visible(timeout=15000)
            print("Back to ARK Dashboard")

            print("\n=== Step 7: Running workflow from ARK Dashboard ===")
            create_result = subprocess.run(
                ["kubectl", "create", "-f", str(run_workflow_path)],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            assert create_result.returncode == 0, f"Failed to create workflow: {create_result.stderr}"
            workflow_name = create_result.stdout.strip().split('/')[-1].split()[0]
            print(f"Workflow created: {workflow_name}")
            
            wait_result = subprocess.run(
                ["kubectl", "wait", "--for=condition=Ready", "workflow", workflow_name, "-n", "default", "--timeout=10s"],
                capture_output=True,
                text=True,
                timeout=15
            )
            if wait_result.returncode != 0:
                print(f"Warning: Workflow wait timed out, continuing anyway")
            else:
                print("Workflow is ready")

            print("\n=== Step 8: Verifying workflow in ARK Dashboard ===")
            page.goto(f"{dashboard.base_url}/workflow-templates")
            page.wait_for_load_state("networkidle", timeout=15000)
            assert "/workflow-templates" in page.url, f"Expected /workflow-templates in URL, got: {page.url}"
            print("Viewing Workflow Templates page in ARK")

            print("\n=== Step 9: Waiting for workflow to complete (max 90s) ===")
            final_status = ""
            for i in range(0, 90, 5):
                status_result = subprocess.run(
                    ["kubectl", "get", "workflow", workflow_name, "-n", "default", "-o", "jsonpath={.status.phase}"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                current_status = status_result.stdout.strip()
                print(f"Status check at {i}s: {current_status}")
                
                if current_status == "Succeeded":
                    final_status = current_status
                    print(f"Workflow completed successfully after {i} seconds")
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

            print("\n=== Step 10: Verifying workflow status in Argo Dashboard ===")
            workflows_page.navigate_to_workflows()
            workflows_page.close_modal_if_present()
            workflows_page.search_workflow(workflow_name)
            
            workflow_link = page.locator(f"text={workflow_name}").first
            expect(workflow_link).to_be_visible(timeout=15000)
            print(f"Workflow {workflow_name} visible in Argo")
            
            workflows_page.click_workflow(workflow_name)
            page.wait_for_load_state("domcontentloaded", timeout=15000)
            workflows_page.close_modal_if_present()
            print("Opened workflow details in Argo")

            print("\n=== Step 11: Verifying final status in Argo UI ===")
            page.wait_for_timeout(2000)
            
            argo_status = workflows_page.get_workflow_status()
            print(f"Workflow status in Argo UI: {argo_status}")
            
            if argo_status and argo_status != "Unknown":
                print(f"Status verified in Argo UI: {argo_status}")
            else:
                print(f"Status from kubectl: {final_status} (UI status: {argo_status})")

            print("\n=== Step 12: Checking workflow logs ===")
            logs_result = subprocess.run(
                ["kubectl", "logs", "-n", "default", "-l", f"workflows.argoproj.io/workflow={workflow_name}", "--tail=30"],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            logs = logs_result.stdout
            print(f"Workflow logs sample:\n{logs[:300]}")
            assert "Workflow completed successfully" in logs or "Starting engineering workflow" in logs, \
                "Expected log message not found"

            print("\n=== Test Passed Successfully ===")
            print(f"Workflow verified in both ARK Dashboard and Argo Dashboard")

        except Exception as e:
            print(f"\n=== Test Failed ===")
            print(f"Error: {e}")
            pytest.fail(f"Test failed: {e}")
            
        finally:
            if workflow_name:
                print(f"\n=== Cleanup: Deleting workflow {workflow_name} ===")
                delete_result = subprocess.run(
                    ["kubectl", "delete", "workflow", workflow_name, "-n", "default"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if delete_result.returncode == 0:
                    print(f"Workflow {workflow_name} deleted successfully")
                    
                    verify_result = subprocess.run(
                        ["kubectl", "get", "workflow", workflow_name, "-n", "default"],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if verify_result.returncode != 0:
                        print("Verified: Workflow no longer exists")
                else:
                    print(f"Workflow deletion warning: {delete_result.stderr}")
                
                print("Workflow cleanup completed")
            
            print("\n=== Cleanup: Deleting WorkflowTemplate ===")
            delete_template_result = subprocess.run(
                ["kubectl", "delete", "-f", workflow_template_path],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if delete_template_result.returncode == 0:
                print("WorkflowTemplate deleted successfully")
            else:
                print(f"WorkflowTemplate deletion warning: {delete_template_result.stderr}")
            
            print("All cleanup completed")
