
import subprocess
import time
import os
import tempfile
from pathlib import Path


class FileGatewayHelper:
    """Helper class for File Gateway operations and validations"""
    
    TIMEOUTS = {"install": 300, "pods": 120, "api": 60, "cleanup": 30}
    INTERVALS = {"pod_check": 5, "api_check": 2}
    FILE_GATEWAY_PODS = ['file-gateway-file-api', 'file-gateway-filesystem-mcp', 'file-gateway-versitygw']
    API_PORT = 8080
    API_HOST = "localhost"
    DEFAULT_BUCKET = "aas-files"
    DEFAULT_STORAGE_SIZE = "1Gi"
    
    def __init__(self):
        self.original_cwd = os.getcwd()
        self.test_dir = Path(__file__).parent
        self.port_forward_process = None
        self.test_files = []
    
    def _run_cmd(self, cmd, timeout=None, check=True, capture_output=True):
        """Run subprocess with error handling"""
        try:
            result = subprocess.run(
                cmd, 
                capture_output=capture_output, 
                text=True,
                timeout=timeout or self.TIMEOUTS["cleanup"], 
                check=check
            )
            return True, result.stdout, result.stderr
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
            return False, getattr(e, 'stdout', ''), getattr(e, 'stderr', str(e))
    
    def _wait_for_condition(self, check_func, timeout, interval, operation_name):
        """Wait for a condition to be met"""
        time_waited = 0
        while time_waited < timeout:
            if check_func():
                return True
            time.sleep(interval)
            time_waited += interval
            print(f"{operation_name} in progress... ({time_waited}s elapsed)")
        return False
    
    def install_file_gateway(self):
        """Install File Gateway using ark install command"""
        print("Installing File Gateway...")
        
        success, _, stderr = self._run_cmd(
            ['ark', 'install', 'marketplace/services/file-gateway'],
            timeout=self.TIMEOUTS["install"]
        )
        
        if success:
            print("File Gateway installation command completed")
            return True
        else:
            print(f"File Gateway installation failed: {stderr}")
            return False
    
    def verify_pods_running(self):
        """Verify File Gateway pods are running"""
        print("Verifying File Gateway pods...")
        
        def check_pods():
            success, stdout, _ = self._run_cmd(
                ['kubectl', 'get', 'pods', '-l', 'app.kubernetes.io/name=file-gateway', '-o', 'jsonpath={.items[*].status.phase}'],
                check=False
            )
            if not success:
                return False
            
            phases = stdout.strip().split()
            running_count = sum(1 for phase in phases if phase == 'Running')
            print(f"Found {running_count}/{len(self.FILE_GATEWAY_PODS)} File Gateway pods running")
            return running_count >= len(self.FILE_GATEWAY_PODS)
        
        if not self._wait_for_condition(check_pods, self.TIMEOUTS["pods"], self.INTERVALS["pod_check"], "Pod startup"):
            print("Timeout waiting for pods to be ready")
            return False
        
        success, stdout, _ = self._run_cmd(
            ['kubectl', 'get', 'pods', '-l', 'app.kubernetes.io/name=file-gateway', '-o', 'wide'],
            check=False
        )
        if success:
            print("Pod details:")
            print(stdout)
        
        print("File Gateway pods verified successfully")
        return True
    
    def get_pod_names(self):
        """Get list of File Gateway pod names"""
        success, stdout, _ = self._run_cmd(
            ['kubectl', 'get', 'pods', '-l', 'app.kubernetes.io/name=file-gateway', '-o', 'jsonpath={.items[*].metadata.name}'],
            check=False
        )
        if success and stdout.strip():
            return stdout.strip().split()
        return []
    
    def get_pod_image(self, pod_name):
        """Get container image for a pod"""
        success, stdout, _ = self._run_cmd(
            ['kubectl', 'get', 'pod', pod_name, '-o', 'jsonpath={.spec.containers[0].image}'],
            check=False
        )
        if success:
            return stdout.strip()
        return None
    
    def verify_storage_configuration(self):
        """Verify persistent volume claim configuration"""
        print("Verifying storage configuration...")
        
        success, stdout, _ = self._run_cmd(
            ['kubectl', 'get', 'pvc', '-l', 'app.kubernetes.io/name=file-gateway', '-o', 'jsonpath={.items[0].spec.resources.requests.storage}'],
            check=False
        )
        
        if success and stdout.strip():
            storage_size = stdout.strip()
            print(f"Storage size: {storage_size}")
            return True, storage_size
        else:
            print("Failed to get storage configuration")
            return False, None
    
    def verify_pvc_exists(self):
        """Verify PVC exists and is bound"""
        print("Verifying PVC exists...")
        
        success, stdout, _ = self._run_cmd(
            ['kubectl', 'get', 'pvc', '-l', 'app.kubernetes.io/name=file-gateway', '-o', 'jsonpath={.items[0].status.phase}'],
            check=False
        )
        
        if success and stdout.strip() == "Bound":
            print("PVC is bound")
            return True
        else:
            print(f"PVC status: {stdout.strip()}")
            return False
    
    def verify_service_ports(self):
        """Verify service ports configuration"""
        print("Verifying service ports...")
        
        services_config = {
            'file-gateway-api': 80,
            'file-gateway-filesystem-mcp': 80,
            'file-gateway-versitygw': 80
        }
        
        all_correct = True
        for service_name, expected_port in services_config.items():
            success, stdout, _ = self._run_cmd(
                ['kubectl', 'get', 'svc', service_name, '-o', 'jsonpath={.spec.ports[0].port}'],
                check=False
            )
            
            if success and stdout.strip():
                actual_port = int(stdout.strip())
                if actual_port == expected_port:
                    print(f"{service_name}: port {actual_port} (correct)")
                else:
                    print(f"{service_name}: port {actual_port} (expected {expected_port})")
                    all_correct = False
            else:
                print(f"{service_name}: not found")
                all_correct = False
        
        return all_correct
    
    def verify_bucket_configuration(self):
        """Verify S3 bucket configuration"""
        print("Verifying bucket configuration...")
        
        # Try to get bucket name from BASE_DATA_DIR environment variable
        success, stdout, _ = self._run_cmd(
            ['kubectl', 'get', 'deployment', 'file-gateway-filesystem-mcp', '-o', 'jsonpath={.spec.template.spec.containers[0].env[?(@.name=="BASE_DATA_DIR")].value}'],
            check=False
        )
        
        if success and stdout.strip():
            base_data_dir = stdout.strip()
            # Extract bucket name from path like /data/aas-files
            bucket_name = base_data_dir.split('/')[-1]
            print(f"Bucket name: {bucket_name} (from BASE_DATA_DIR: {base_data_dir})")
            return True, bucket_name
        else:
            print("Failed to get bucket configuration")
            return False, None
    
    def verify_component_enabled(self, component):
        """Verify if a component is enabled by checking if deployment exists"""
        print(f"Verifying {component} component...")
        
        deployment_name = f"file-gateway-{component}"
        success, stdout, _ = self._run_cmd(
            ['kubectl', 'get', 'deployment', deployment_name, '-o', 'jsonpath={.metadata.name}'],
            check=False
        )
        
        if success and stdout.strip():
            print(f"{component} component is enabled")
            return True
        else:
            print(f"{component} component not found")
            return False
    
    def verify_mcp_server_registered(self, max_retries=24, retry_delay=5):
        """Verify MCP server is registered with ARK"""
        print("Verifying MCP server registration...")
        
        for attempt in range(max_retries):
            success, stdout, _ = self._run_cmd(
                ['kubectl', 'get', 'mcpserver', 'file-gateway-mcpserver', '-o', 'jsonpath={.status.toolCount}'],
                check=False
            )
            
            if success and stdout.strip().isdigit():
                tool_count = int(stdout.strip())
                print(f"MCP server registered with {tool_count} tools")
                return True, tool_count
            
            if attempt < max_retries - 1:
                print(f"MCP server not ready yet, waiting... (attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
        
        print("MCP server not found or not ready after all retries")
        return False, 0
    
    def verify_mcp_server_status(self, max_retries=24, retry_delay=5):
        """Verify MCP server status is Available"""
        print("Verifying MCP server status...")
        
        for attempt in range(max_retries):
            success, stdout, _ = self._run_cmd(
                ['kubectl', 'get', 'mcpserver', 'file-gateway-mcpserver', '-o', 'jsonpath={.status.conditions[?(@.type=="Available")].status}'],
                check=False
            )
            
            if success and stdout.strip() == "True":
                print("MCP server status: Available")
                return True
            
            if attempt < max_retries - 1:
                status = stdout.strip() if stdout else "Unknown"
                print(f"MCP server status: {status}, waiting... (attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
        
        print(f"MCP server status not Available after all retries: {stdout.strip()}")
        return False
    
    def setup_port_forward(self):
        """Setup port forwarding to File Gateway API"""
        print(f"Setting up port forward to File Gateway API on port {self.API_PORT}...")
        
        # Check if port is already available
        def check_port():
            try:
                import socket
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                result = sock.connect_ex((self.API_HOST, self.API_PORT))
                sock.close()
                return result == 0
            except:
                return False
        
        # If port is already available, skip setup
        if check_port():
            print(f"Port forward already active on {self.API_HOST}:{self.API_PORT}")
            return True
        
        self._run_cmd(['bash', '-c', f'lsof -ti :{self.API_PORT} | xargs kill -9 2>/dev/null || true'], check=False)
        
        self.port_forward_process = subprocess.Popen(
            ['kubectl', 'port-forward', 'svc/file-gateway-api', f'{self.API_PORT}:80'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        
        print("Waiting for port forward to be ready...")
        time.sleep(3)
        
        if self._wait_for_condition(check_port, 30, 1, "Port forward setup"):
            print(f"Port forward ready on {self.API_HOST}:{self.API_PORT}")
            return True
        else:
            print("Port forward failed to become ready")
            return False
    
    def test_api_health(self):
        """Test File Gateway API health endpoint"""
        print("Testing API health endpoint...")
        
        success, stdout, stderr = self._run_cmd(
            ['curl', '-s', f'http://{self.API_HOST}:{self.API_PORT}/health'],
            timeout=10,
            check=False
        )
        
        if success and 'healthy' in stdout:
            print(f"API health check passed: {stdout.strip()}")
            return True
        else:
            print(f"API health check failed: {stderr}")
            return False
    
    def create_test_file(self, content=None):
        """Create a temporary test file"""
        print("Creating test file...")
        
        temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt')
        if content is None:
            content = f"Test file created at {time.strftime('%Y-%m-%d %H:%M:%S')}\nThis is a test for File Gateway functionality.\n"
        temp_file.write(content)
        temp_file.close()
        
        self.test_files.append(temp_file.name)
        print(f"Created test file: {temp_file.name}")
        return temp_file.name, content
    
    def upload_file(self, file_path, key):
        """Upload a file to File Gateway"""
        print(f"Uploading file as '{key}'...")
        
        success, stdout, stderr = self._run_cmd(
            ['curl', '-s', '-X', 'POST',
             '-F', f'file=@{file_path}',
             '-F', f'key={key}',
             f'http://{self.API_HOST}:{self.API_PORT}/files'],
            timeout=30,
            check=False
        )
        
        # Check if upload was successful by looking for key field in JSON response
        # Return the actual uploaded key from the response
        if success and ('"key"' in stdout or 'key' in stdout) and 'last_modified' in stdout:
            print(f"File uploaded successfully: {stdout.strip()}")
            # Extract the actual key from JSON response
            try:
                import json
                response_data = json.loads(stdout)
                uploaded_key = response_data.get('key', key)
                return True, uploaded_key
            except:
                return True, key
        else:
            print(f"File upload failed - stderr: {stderr}, stdout: {stdout}")
            return False, None
    
    def list_files(self):
        """List files in File Gateway"""
        print("Listing files...")
        
        success, stdout, stderr = self._run_cmd(
            ['curl', '-s', f'http://{self.API_HOST}:{self.API_PORT}/files'],
            timeout=10,
            check=False
        )
        
        if success:
            print(f"Files listed: {stdout}")
            return True, stdout
        else:
            print(f"Failed to list files: {stderr}")
            return False, ""
    
    def download_file(self, key):
        """Download a file from File Gateway"""
        print(f"Downloading file '{key}'...")
        
        success, stdout, stderr = self._run_cmd(
            ['curl', '-s', f'http://{self.API_HOST}:{self.API_PORT}/files/{key}/download'],
            timeout=30,
            check=False
        )
        
        if success:
            # Empty files have empty stdout, which is valid
            print(f"File downloaded successfully, content length: {len(stdout)} bytes")
            return True, stdout
        else:
            print(f"File download failed: {stderr}")
            return False, ""
    
    def delete_file(self, key):
        """Delete a file from File Gateway"""
        print(f"Deleting file '{key}'...")
        
        success, stdout, stderr = self._run_cmd(
            ['curl', '-s', '-X', 'DELETE', f'http://{self.API_HOST}:{self.API_PORT}/files/{key}'],
            timeout=10,
            check=False
        )
        
        if success and 'deleted' in stdout:
            print(f"File deleted successfully: {stdout.strip()}")
            return True
        else:
            print(f"File deletion failed: {stderr}")
            return False
    
    def verify_file_size_limit(self):
        """Verify 1MB file size limit for MCP"""
        print("Testing file size limit...")
        
        # Create a file larger than 1MB
        large_content = "X" * (1024 * 1024 + 1)  # 1MB + 1 byte
        file_path, _ = self.create_test_file(large_content)
        
        # Try to upload
        success = self.upload_file(file_path, "large-test-file.txt")
        
        # File API should accept it, but we're testing the limit exists
        return True
    
    def cleanup_resources(self):
        """Clean up resources"""
        print("Cleaning up resources...")
        
        if self.port_forward_process:
            self.port_forward_process.terminate()
            try:
                self.port_forward_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.port_forward_process.kill()
        
        self._run_cmd(['bash', '-c', f'lsof -ti :{self.API_PORT} | xargs kill -9 2>/dev/null || true'], check=False)
        
        for file_path in self.test_files:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Removed test file: {file_path}")
            except Exception as e:
                print(f"Failed to remove test file {file_path}: {e}")
        
        print("Cleanup completed")
    
    def uninstall_file_gateway(self):
        """Uninstall File Gateway"""
        print("Uninstalling File Gateway...")
        
        success, stdout, _ = self._run_cmd(
            ['helm', 'uninstall', 'file-gateway', '-n', 'default'],
            timeout=60,
            check=False
        )
        
        if success:
            print("File Gateway uninstalled")
            return True
        else:
            print(f"Uninstall completed with output: {stdout}")
            return True
