import json
import logging
import os
import pytest
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

logger = logging.getLogger(__name__)


def pytest_addoption(parser):
    try:
        parser.addoption("--visible", action="store_true", default=False)
    except ValueError:
        pass
    try:
        parser.addoption("--browser-type", default="chromium", choices=["chromium", "firefox", "webkit", "gecko"])
    except ValueError:
        pass
    try:
        parser.addoption("--skip-install", action="store_true", default=False)
    except ValueError:
        pass


def get_ark_pods():
    result = subprocess.run(['kubectl', 'get', 'pods', '--all-namespaces', '-o', 'json'],
                          capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return []
    
    pods_data = json.loads(result.stdout)
    ark_pods = []
    
    for pod in pods_data.get('items', []):
        pod_name = pod['metadata']['name']
        if any(name in pod_name for name in ['ark-dashboard', 'ark-api', 'ark-mcp']):
            ready = False
            for condition in pod.get('status', {}).get('conditions', []):
                if condition.get('type') == 'Ready' and condition.get('status') == 'True':
                    ready = True
                    break
            ark_pods.append({
                'name': pod_name,
                'status': pod['status']['phase'],
                'ready': ready
            })
    
    return ark_pods


def is_ark_running():
    pods = get_ark_pods()
    if not pods:
        return False
    
    required_services = ['ark-dashboard', 'ark-api', 'ark-mcp']
    for service in required_services:
        service_pods = [p for p in pods if service in p['name']]
        if not any(p['status'] == 'Running' and p['ready'] for p in service_pods):
            return False
    return True


def install_ark():
    logger.info("Installing ARK...")
    result = subprocess.run(['ark', 'install', '-y'], capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        pytest.exit(f"ARK installation failed: {result.stderr}", returncode=1)
    logger.info("ARK installation successful")


def wait_for_pods_ready():
    logger.info("Waiting for ARK pods to be ready...")
    required_services = ['ark-dashboard', 'ark-api', 'ark-mcp']
    
    for attempt in range(60):
        pods = get_ark_pods()
        if not pods:
            time.sleep(5)
            continue
            
        all_ready = True
        for service in required_services:
            service_pods = [p for p in pods if service in p['name']]
            if not any(p['status'] == 'Running' and p['ready'] for p in service_pods):
                all_ready = False
                break
        
        if all_ready:
            ready_pods = [p for p in pods if p['status'] == 'Running' and p['ready']]
            pod_statuses = [f"{p['name']}: {p['status']}" for p in ready_pods]
            logger.info(f"Attempt {attempt + 1}/60: {', '.join(pod_statuses)}")
            logger.info("All required ARK services have at least one ready pod")
            return
        
        time.sleep(5)
    pytest.exit("ARK pods not ready", returncode=1)


def wait_for_dashboard():
    logger.info("Waiting for dashboard to be accessible...")
    for attempt in range(12):
        try:
            urllib.request.urlopen('http://localhost:3274', timeout=2)
            return
        except Exception:
            time.sleep(5)


def cleanup_port_forwarding():
    """Clean up port forwarding with graceful shutdown first"""
    # Try graceful shutdown first (SIGTERM)
    subprocess.run(['bash', '-c', 'lsof -ti :3274 | xargs kill -15 2>/dev/null || true'], 
                  capture_output=True)
    time.sleep(2)
    # Force kill if still running (SIGKILL)
    subprocess.run(['bash', '-c', 'lsof -ti :3274 | xargs kill -9 2>/dev/null || true'], 
                  capture_output=True)
    time.sleep(1)


@pytest.fixture(scope="session")
def ark_setup(request):
    skip_install = request.config.getoption("--skip-install")
    port_forward = None
    
    try:
        if not skip_install and not is_ark_running():
            install_ark()
            time.sleep(30)
        
        wait_for_pods_ready()
        cleanup_port_forwarding()
        
        port_forward = subprocess.Popen(
            ['kubectl', 'port-forward', '-n', 'default', 'service/ark-dashboard', '3274:3000'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        time.sleep(5)
        
        if port_forward.poll() is not None:
            pytest.exit("Port forwarding failed", returncode=1)
        
        wait_for_dashboard()
        
        yield
    finally:
        if port_forward:
            port_forward.terminate()
            port_forward.wait(timeout=5)


@pytest.fixture(scope="session")
def playwright():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def browser(playwright, ark_setup, request):
    visible = request.config.getoption("--visible")
    browser_type = request.config.getoption("--browser-type")
    
    if browser_type == "gecko":
        browser_type = "firefox"
    
    launch_args = {
        "headless": not visible,
        "slow_mo": 500 if visible else 0,
        "args": ["--start-maximized"] if visible else []
    }
    
    browser = getattr(playwright, browser_type).launch(**launch_args)
    yield browser
    browser.close()


@pytest.fixture(scope="session")
def context(browser, request):
    visible = request.config.getoption("--visible")
    context_args = {
        "viewport": None if visible else {"width": 1920, "height": 1080},
        "ignore_https_errors": True
    }
    context = browser.new_context(**context_args)
    yield context
    context.close()


@pytest.fixture(scope="session")
def page(context):
    page = context.new_page()
    yield page
    page.close()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    
    if rep.when == "call" and rep.failed:
        page = item.funcargs.get("page")
        if page:
            try:
                # Ensure screenshots directory exists
                screenshots_dir = Path("screenshots")
                screenshots_dir.mkdir(exist_ok=True)
                
                screenshot_path = screenshots_dir / f"{item.name}.png"
                page.screenshot(path=str(screenshot_path))
                logger.info(f"Screenshot saved: {screenshot_path}")
            except Exception as e:
                logger.error(f"Failed to save screenshot: {e}")
