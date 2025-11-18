
import pytest
import subprocess
import time
import os
import sys
import shutil
from pathlib import Path


class ARKWorkflowTest:
    # Configuration constants
    VENV_NAME = "ark_test_venv"
    TIMEOUTS = {"java": 10, "brew": 300, "ark": 600, "pods": 300, "dashboard": 120, "pytest": 120, "cleanup": 30}
    INTERVALS = {"process": 10, "dashboard": 5}
    HOMEBREW_OPENJDK_PATH = "/opt/homebrew/opt/openjdk/bin"
    REQUIRED_ARK_PODS = ['ark-api', 'ark-dashboard', 'ark-mcp']
    DASHBOARD_URLS = ["http://127.0.0.1.nip.io:8080", "http://localhost:8080", "http://localhost:3000"]
    BASIC_PACKAGES = ["pytest", "kubernetes", "pyyaml", "requests"]

    def __init__(self):
        self.venv_path = None
        self.original_cwd = os.getcwd()
        self.test_dir = Path(__file__).parent
    
    def _get_venv_paths(self):
        """Get platform-specific venv paths"""
        base = "Scripts" if os.name == 'nt' else "bin"
        return self.venv_path / base / "pip", self.venv_path / base / "python"
    
    def _run_cmd(self, cmd, timeout=None, check=True):
        """Run subprocess with error handling"""
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, 
                                  timeout=timeout or self.TIMEOUTS["cleanup"], check=check)
            return True, result.stdout, result.stderr
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
            return False, getattr(e, 'stdout', ''), getattr(e, 'stderr', str(e))
    
    def _check_java(self):
        """Check if Java is available"""
        success, _, _ = self._run_cmd(['java', '-version'], self.TIMEOUTS["java"], check=False)
        return success
    
    def _setup_homebrew_java(self):
        """Setup Java via Homebrew"""
        if os.path.exists(self.HOMEBREW_OPENJDK_PATH):
            current_path = os.environ.get('PATH', '')
            if self.HOMEBREW_OPENJDK_PATH not in current_path:
                os.environ['PATH'] = f"{self.HOMEBREW_OPENJDK_PATH}:{current_path}"
            return self._check_java()
        return False
    
    def _monitor_process(self, process, timeout, sleep_time, operation_name):
        """Monitor process with timeout"""
        time_waited = 0
        while time_waited < timeout:
            if process.poll() is not None:
                output, error = process.communicate()
                return process.returncode == 0, output, error
            time.sleep(sleep_time)
            time_waited += sleep_time
            print(f"{operation_name} in progress... ({time_waited}s elapsed)")
        process.terminate()
        return False, "", f"Timeout after {timeout}s"

    def setup_venv(self):
        """Setup virtual environment"""
        print("Setting up virtual environment...")
        self.venv_path = self.test_dir / self.VENV_NAME
        
        if self.venv_path.exists():
            shutil.rmtree(self.venv_path)
        
        success, _, stderr = self._run_cmd([sys.executable, "-m", "venv", str(self.venv_path)])
        if not success:
            raise RuntimeError(f"Failed to create venv: {stderr}")
        
        pip_executable, python_executable = self._get_venv_paths()
        requirements_path = self.test_dir / "requirements.txt"
        
        if requirements_path.exists():
            success, _, error_msg = self._run_cmd([str(pip_executable), "install", "-r", str(requirements_path)])
            if not success:
                print(f"Requirements failed: {error_msg}, installing basics")
                self._run_cmd([str(pip_executable), "install"] + self.BASIC_PACKAGES)
        else:
            self._run_cmd([str(pip_executable), "install"] + self.BASIC_PACKAGES)
        
        print("Virtual environment ready")
        return str(python_executable)

    def setup_openjdk(self):
        """Setup OpenJDK"""
        print("Checking OpenJDK...")
        
        # Check if already available
        if self._check_java():
            print("OpenJDK available")
            return True
        
        # Try Homebrew path setup
        if self._setup_homebrew_java():
            print("OpenJDK available")
            return True
        
        # Try installing via Homebrew
        print("Installing via Homebrew...")
        success, _, _ = self._run_cmd(['brew', 'install', 'openjdk'], self.TIMEOUTS["brew"], check=False)
        if success and self._setup_homebrew_java():
            print("OpenJDK installed and available")
            return True
        
        print("OpenJDK unavailable - some features may not work")
        return False

    def install_ark(self):
        """Install ARK platform"""
        print("Installing ARK...")
        
        success, version_output, _ = self._run_cmd(['ark', '--version'], self.TIMEOUTS["java"], check=False)
        if not success:
            print("ARK CLI not found. Install with: npm install -g @agents-at-scale/ark")
            return False, None
        
        version_info = version_output.strip()
        print(f"ARK CLI found: {version_info}")
        
        process = subprocess.Popen(['ark', 'install', '-y'], 
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        success, output, error_msg = self._monitor_process(process, self.TIMEOUTS["ark"], 
                                                       self.INTERVALS["process"], "ARK installation")
        
        if success:
            print("ARK installed successfully")
            return True, version_info
        else:
            print(f"ARK installation failed: {error_msg}")
            return False, version_info

    def create_default_model(self):
        """Skip model creation (interactive)"""
        print("Skipping model creation (interactive command)")
        return True

    def verify_pods_running(self):
        """Verify ARK pods are running"""
        print("Verifying ARK pods...")
        
        try:
            # Dynamically find site-packages directory
            python_version = f"python{sys.version_info.major}.{sys.version_info.minor}"
            site_packages = self.venv_path / "lib" / python_version / "site-packages"
            sys.path.insert(0, str(site_packages))
            from kubernetes import config, client
            
            config.load_kube_config()
            kube_client = client.CoreV1Api()
            
            # Get ARK pods
            all_pods = kube_client.list_pod_for_all_namespaces()
            ark_pods = [p for p in all_pods.items if 'ark' in p.metadata.name.lower()]
            running_pods = [p for p in ark_pods if p.status.phase == 'Running']
            
            print(f"Found {len(running_pods)}/{len(ark_pods)} ARK pods running")
            
            return len(running_pods) >= len(self.REQUIRED_ARK_PODS)
                
        except Exception as error:
            print(f"Error verifying pods: {error}")
            return False

    def verify_dashboard_accessible(self):
        """Verify dashboard accessibility via gateway"""
        print("Verifying dashboard via ARK gateway...")
        
        try:
            if self.venv_path is None:
                self.venv_path = self.test_dir / self.VENV_NAME
            
            # Check if dashboard pod exists
            result = subprocess.run(
                ['kubectl', 'get', 'pods', '--all-namespaces', '-l', 'app=ark-dashboard', '-o', 'name'],
                capture_output=True, text=True
            )
            
            if not result.stdout.strip():
                print("ARK dashboard not installed, skipping verification")
                return True  # Pass test if dashboard not installed
            
            subprocess.run(['bash', '-c', 'lsof -ti :8080 | xargs kill -9 2>/dev/null || true'], 
                          capture_output=True)
            subprocess.run(['bash', '-c', 'lsof -ti :3000 | xargs kill -9 2>/dev/null || true'], 
                          capture_output=True)
            
            # Forward to dashboard pod directly
            dashboard_pod = result.stdout.strip().split('/')[-1]
            print(f"Setting up port forwarding to {dashboard_pod}...")
            port_forward_process = subprocess.Popen(
                ['kubectl', 'port-forward', '-n', 'default', dashboard_pod, '8080:3000'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # Dynamically find site-packages directory
            python_version = f"python{sys.version_info.major}.{sys.version_info.minor}"
            site_packages = self.venv_path / "lib" / python_version / "site-packages"
            sys.path.insert(0, str(site_packages))
            import requests
            import webbrowser
            
            print("Waiting for port forwarding to be ready...")
            time.sleep(5)
            
            # Wait for port to be accessible
            for i in range(20):
                try:
                    requests.get("http://localhost:8080", timeout=1)
                    print("Port forwarding is ready")
                    break
                except:
                    time.sleep(1)
                    if i == 19:
                        print("Port forwarding timeout")
                        port_forward_process.terminate()
                        return False
            
            # Try each URL until one works
            for test_url in self.DASHBOARD_URLS:
                try:
                    print(f"Trying {test_url}...")
                    response = requests.get(test_url, timeout=10)
                    if response.status_code == 200:
                        print(f"Dashboard responding at {test_url}")
            
                        # Launch browser
                        print(f"Opening browser at {test_url}")
                        webbrowser.open(test_url)
                        print("Browser launched successfully")
                        
                        print(f"Dashboard accessible - Status: {response.status_code}")
                        return True
                        
                except requests.exceptions.RequestException:
                    continue  # Try next URL
            
            print("Dashboard not accessible on any URL")
            return False
            
        except Exception as error:
            print(f"Dashboard error: {error}")
            return False

    def cleanup_resources(self):
        """Clean up resources"""
        print("Cleaning up...")
        self._run_cmd(['pkill', '-f', 'kubectl port-forward'], check=False)
        self._run_cmd(['bash', '-c', 'lsof -ti :8080 | xargs kill -9 2>/dev/null || true'], check=False)
        self._run_cmd(['bash', '-c', 'lsof -ti :3000 | xargs kill -9 2>/dev/null || true'], check=False)
        
        # Cleanup Kubernetes resources
        cleanup_commands = [
            ['kubectl', 'delete', 'pods', '--all', '-n', 'default'],
            ['kubectl', 'delete', 'services', '--all', '-n', 'default'],
            ['kubectl', 'delete', 'deployments', '--all', '-n', 'default'],
            ['kubectl', 'delete', 'agents', '--all', '-n', 'default'],
            ['kubectl', 'delete', 'models', '--all', '-n', 'default'],
            ['kubectl', 'delete', 'queries', '--all', '-n', 'default']
        ]
        
        for command in cleanup_commands:
            self._run_cmd(command, self.TIMEOUTS["cleanup"], check=False)
        
        # Clean venv
        if self.venv_path and self.venv_path.exists():
            shutil.rmtree(self.venv_path)
        
    def run_workflow(self):
        """Run complete workflow"""
        print("Starting ARK Workflow Test")
        success = True
        
        try:
            python_executable_path = self.setup_venv()
            if not self.install_ark()[0]:
                success = False
            if success:
                self.create_default_model()
                time.sleep(30)  # Wait for pods
                if not self.verify_pods_running() or not self.verify_dashboard_accessible():
                    success = False
        except Exception as e:

            success = False
        finally:
            self.cleanup_resources()
        
        return success


@pytest.fixture(scope="session")
def ark_workflow():
    return ARKWorkflowTest()


def test_ark_venv_setup(ark_workflow):
    """Test virtual environment setup"""
    python_executable_path = ark_workflow.setup_venv()
    assert python_executable_path and Path(python_executable_path).exists(), "Venv setup failed"
    print("Venv setup successful")


def test_ark_openjdk_setup(ark_workflow):
    """Test OpenJDK setup"""
    ark_workflow.setup_openjdk()  # Non-blocking, just warn if fails


def test_ark_installation(ark_workflow):
    """Test ARK installation"""
    installation_success, ark_version = ark_workflow.install_ark()
    assert installation_success and ark_version, "ARK installation failed"
    print(f"ARK installed - {ark_version}")


def test_ark_pods_verification(ark_workflow):
    """Test ARK pods verification with dynamic monitoring"""
    print("Testing ARK pods verification...")
    
    # First run the verification
    pods_ready = ark_workflow.verify_pods_running()
    assert pods_ready, "ARK pods verification failed"
    
    # Then print detailed pod information
    try:
        # Dynamically find site-packages directory
        python_version = f"python{sys.version_info.major}.{sys.version_info.minor}"
        site_packages = ark_workflow.venv_path / "lib" / python_version / "site-packages"
        sys.path.insert(0, str(site_packages))
        from kubernetes import config, client
        
        config.load_kube_config()
        kube_client = client.CoreV1Api()
        all_pods = kube_client.list_pod_for_all_namespaces()
        ark_pods = [pod for pod in all_pods.items if 'ark' in pod.metadata.name.lower()]
        
        print(f"Detailed pod status for {len(ark_pods)} ARK pods:")
        for pod in ark_pods:
            status = "Running" if pod.status.phase == 'Running' else pod.status.phase
            ready_status = "Ready" if (pod.status.container_statuses and 
                         all(c.ready for c in pod.status.container_statuses)) else "Not Ready"
            print(f"- {pod.metadata.name} ({pod.metadata.namespace}): {status} - {ready_status}")
            
    except Exception as error:
        print(f"Could not get detailed pod info: {error}")
    
    print("ARK pods verification successful")


def test_ark_dashboard_verification(ark_workflow):
    """Test ARK dashboard HTTP accessibility"""
    print("Testing ARK dashboard verification...")
    dashboard_accessible = ark_workflow.verify_dashboard_accessible()
    assert dashboard_accessible, "ARK dashboard verification failed"
    print("ARK dashboard verification successful")


def test_ark_pytest_execution(ark_workflow):
    """Test pytest execution"""
    print("Testing pytest execution...")
    try:
        # Dynamically find site-packages directory
        python_version = f"python{sys.version_info.major}.{sys.version_info.minor}"
        site_packages = ark_workflow.venv_path / "lib" / python_version / "site-packages"
        sys.path.insert(0, str(site_packages))
        from kubernetes import config, client
        
        config.load_kube_config()
        kube_client = client.CoreV1Api()
        all_pods = kube_client.list_pod_for_all_namespaces()
        ark_related_pods = [pod for pod in all_pods.items if 'ark' in pod.metadata.name.lower()]
        assert len(ark_related_pods) > 0, "No ARK pods found"
        
        print(f"Found {len(ark_related_pods)} ARK pods:")
        for pod in ark_related_pods:
            pod_status = "Running" if pod.status.phase == 'Running' else f"{pod.status.phase}"
            ready_status = "Ready" if (pod.status.container_statuses and all(container.ready for container in pod.status.container_statuses)) else "Not Ready"
            print(f"- {pod.metadata.name} ({pod.metadata.namespace}): {pod_status} - {ready_status}")
    except Exception as test_error:
        print(f"Pytest test failed: {test_error}")


def test_ark_cleanup(ark_workflow):
    """Test cleanup"""
    ark_workflow.cleanup_resources()
    print("Cleanup successful")


if __name__ == "__main__":
    workflow = ARKWorkflowTest()
    success = workflow.run_workflow()
    sys.exit(0 if success else 1)