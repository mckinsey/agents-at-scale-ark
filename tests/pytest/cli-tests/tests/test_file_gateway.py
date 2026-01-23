import pytest
from helpers.file_gateway_helper import FileGatewayHelper


@pytest.fixture(scope="session")
def helper():
    """Create helper instance for all tests"""
    return FileGatewayHelper()


@pytest.fixture(scope="session", autouse=True)
def setup_and_teardown(helper):
    """Setup before all tests and teardown after"""
    yield
    helper.cleanup_resources()


def test_installation(helper):
    """Test File Gateway installation"""
    success = helper.install_file_gateway()
    assert success, "File Gateway installation failed"


def test_pods_running(helper):
    """Test all File Gateway pods are running"""
    success = helper.verify_pods_running()
    assert success, "File Gateway pods verification failed"


def test_pod_count(helper):
    """Test correct number of pods are deployed"""
    pod_names = helper.get_pod_names()
    assert len(pod_names) >= len(helper.FILE_GATEWAY_PODS), f"Expected at least {len(helper.FILE_GATEWAY_PODS)} pods, found {len(pod_names)}"


def test_file_api_pod_exists(helper):
    """Test file-api pod exists"""
    pod_names = helper.get_pod_names()
    file_api_pods = [p for p in pod_names if 'file-api' in p]
    assert len(file_api_pods) > 0, "file-gateway-file-api pod not found"


def test_filesystem_mcp_pod_exists(helper):
    """Test filesystem-mcp pod exists"""
    pod_names = helper.get_pod_names()
    mcp_pods = [p for p in pod_names if 'filesystem-mcp' in p]
    assert len(mcp_pods) > 0, "file-gateway-filesystem-mcp pod not found"


def test_versitygw_pod_exists(helper):
    """Test versitygw pod exists"""
    pod_names = helper.get_pod_names()
    versitygw_pods = [p for p in pod_names if 'versitygw' in p]
    assert len(versitygw_pods) > 0, "file-gateway-versitygw pod not found"


def test_storage_configuration(helper):
    """Test storage PVC is configured"""
    success, storage_size = helper.verify_storage_configuration()
    assert success, "Failed to get storage configuration"
    assert storage_size is not None, "Storage size not found"


def test_storage_size(helper):
    """Test storage size matches default"""
    success, storage_size = helper.verify_storage_configuration()
    assert success, "Failed to get storage configuration"
    assert storage_size == helper.DEFAULT_STORAGE_SIZE, f"Storage size {storage_size} does not match expected {helper.DEFAULT_STORAGE_SIZE}"


def test_pvc_exists_and_bound(helper):
    """Test PVC exists and is bound"""
    success = helper.verify_pvc_exists()
    assert success, "PVC is not bound or does not exist"


def test_service_ports(helper):
    """Test all services are configured with correct ports"""
    success = helper.verify_service_ports()
    assert success, "Service ports verification failed"


def test_file_api_service_port(helper):
    """Test file-api service is on port 80"""
    success, stdout, _ = helper._run_cmd(
        ['kubectl', 'get', 'svc', 'file-gateway-api', '-o', 'jsonpath={.spec.ports[0].port}'],
        check=False
    )
    assert success and stdout.strip() == "80", f"file-api service port is {stdout.strip()}, expected 80"


def test_filesystem_mcp_service_port(helper):
    """Test filesystem-mcp service is on port 80"""
    success, stdout, _ = helper._run_cmd(
        ['kubectl', 'get', 'svc', 'file-gateway-filesystem-mcp', '-o', 'jsonpath={.spec.ports[0].port}'],
        check=False
    )
    assert success and stdout.strip() == "80", f"filesystem-mcp service port is {stdout.strip()}, expected 80"


def test_versitygw_service_port(helper):
    """Test versitygw service is on port 80"""
    success, stdout, _ = helper._run_cmd(
        ['kubectl', 'get', 'svc', 'file-gateway-versitygw', '-o', 'jsonpath={.spec.ports[0].port}'],
        check=False
    )
    assert success and stdout.strip() == "80", f"versitygw service port is {stdout.strip()}, expected 80"


def test_bucket_configuration(helper):
    """Test S3 bucket configuration"""
    success, bucket_name = helper.verify_bucket_configuration()
    assert success, "Failed to get bucket configuration"
    assert bucket_name is not None, "Bucket name not found"


def test_bucket_name_default(helper):
    """Test bucket name matches default"""
    success, bucket_name = helper.verify_bucket_configuration()
    assert success, "Failed to get bucket configuration"
    assert bucket_name == helper.DEFAULT_BUCKET, f"Bucket name {bucket_name} does not match expected {helper.DEFAULT_BUCKET}"


def test_file_api_component_enabled(helper):
    """Test file-api component is enabled"""
    success = helper.verify_component_enabled('file-api')
    assert success, "file-api component not enabled"


def test_filesystem_mcp_component_enabled(helper):
    """Test filesystem-mcp component is enabled"""
    success = helper.verify_component_enabled('filesystem-mcp')
    assert success, "filesystem-mcp component not enabled"


def test_versitygw_component_enabled(helper):
    """Test versitygw component is enabled"""
    success = helper.verify_component_enabled('versitygw')
    assert success, "versitygw component not enabled"


def test_mcp_server_registered(helper):
    """Test MCP server is registered with ARK"""
    success, tool_count = helper.verify_mcp_server_registered()
    assert success, "MCP server not registered"
    assert tool_count > 0, "MCP server has no tools"


def test_mcp_server_tool_count(helper):
    """Test MCP server has expected number of tools"""
    success, tool_count = helper.verify_mcp_server_registered()
    assert success, "MCP server not registered"
    assert tool_count >= 10, f"MCP server has {tool_count} tools, expected at least 10"


def test_mcp_server_status(helper):
    """Test MCP server status is Available"""
    success = helper.verify_mcp_server_status()
    assert success, "MCP server status is not Available"


def test_port_forward_setup(helper):
    """Test port forwarding setup"""
    success = helper.setup_port_forward()
    assert success, "Port forward setup failed"


def test_api_health_endpoint(helper):
    """Test API health endpoint responds"""
    success = helper.test_api_health()
    assert success, "API health check failed"


def test_file_upload(helper):
    """Test file upload functionality"""
    file_path, _ = helper.create_test_file()
    result = helper.upload_file(file_path, "test-upload.txt")
    if isinstance(result, tuple):
        success, uploaded_key = result
        helper.last_uploaded_key = uploaded_key  # Store for next test
    else:
        success = result
        helper.last_uploaded_key = "test-upload.txt"
    assert success, "File upload failed"


def test_file_list(helper):
    """Test file listing functionality"""
    success, file_list = helper.list_files()
    assert success, "File listing failed"
    # Use the actual uploaded key
    uploaded_key = getattr(helper, 'last_uploaded_key', 'test-upload.txt')
    assert uploaded_key in file_list, f"Uploaded file {uploaded_key} not found in listing"


def test_file_download(helper):
    """Test file download functionality"""
    uploaded_key = getattr(helper, 'last_uploaded_key', 'test-upload.txt')
    success, content = helper.download_file(uploaded_key)
    assert success, "File download failed"
    assert len(content) > 0, "Downloaded file is empty"


def test_file_content_integrity(helper):
    """Test downloaded file content matches uploaded content"""
    file_path, original_content = helper.create_test_file("Test content for integrity check\n")
    result = helper.upload_file(file_path, "integrity-test.txt")
    if isinstance(result, tuple):
        upload_success, uploaded_key = result
    else:
        upload_success = result
        uploaded_key = "integrity-test.txt"
    assert upload_success, "File upload failed"
    
    download_success, downloaded_content = helper.download_file(uploaded_key)
    assert download_success, "File download failed"
    assert downloaded_content.strip() == original_content.strip(), "Downloaded content does not match original"
    
    # Cleanup
    helper.delete_file(uploaded_key)


def test_file_delete(helper):
    """Test file deletion functionality"""
    uploaded_key = getattr(helper, 'last_uploaded_key', 'test-upload.txt')
    success = helper.delete_file(uploaded_key)
    assert success, "File deletion failed"


def test_file_deleted_verification(helper):
    """Test file is actually deleted after delete operation"""
    uploaded_key = getattr(helper, 'last_uploaded_key', 'test-upload.txt')
    _, file_list = helper.list_files()
    assert uploaded_key not in file_list, "File still exists after deletion"


def test_multiple_file_operations(helper):
    """Test multiple file uploads and management"""
    files_to_test = ["test-file-1.txt", "test-file-2.txt", "test-file-3.txt"]
    uploaded_keys = []
    
    # Upload multiple files
    for filename in files_to_test:
        file_path, _ = helper.create_test_file(f"Content for {filename}\n")
        result = helper.upload_file(file_path, filename)
        if isinstance(result, tuple):
            success, uploaded_key = result
            uploaded_keys.append(uploaded_key)
        else:
            success = result
            uploaded_keys.append(filename)
        assert success, f"Failed to upload {filename}"
    
    # Verify all files exist
    _, file_list = helper.list_files()
    for uploaded_key in uploaded_keys:
        assert uploaded_key in file_list, f"{uploaded_key} not found in listing"
    
    # Delete all files
    for uploaded_key in uploaded_keys:
        success = helper.delete_file(uploaded_key)
        assert success, f"Failed to delete {uploaded_key}"
    
    # Verify all files are deleted
    _, file_list = helper.list_files()
    for uploaded_key in uploaded_keys:
        assert uploaded_key not in file_list, f"{uploaded_key} still exists after deletion"


def test_file_with_special_characters(helper):
    """Test file operations with special characters in filename"""
    special_filename = "test-file_with-special.chars-123.txt"
    file_path, content = helper.create_test_file("Special filename test\n")
    
    result = helper.upload_file(file_path, special_filename)
    if isinstance(result, tuple):
        upload_success, uploaded_key = result
    else:
        upload_success = result
        uploaded_key = special_filename
    assert upload_success, "Failed to upload file with special characters"
    
    download_success, downloaded_content = helper.download_file(uploaded_key)
    assert download_success, "Failed to download file with special characters"
    assert downloaded_content.strip() == content.strip(), "Content mismatch for special filename"
    
    delete_success = helper.delete_file(uploaded_key)
    assert delete_success, "Failed to delete file with special characters"


def test_empty_file_upload(helper):
    """Test uploading an empty file"""
    file_path, _ = helper.create_test_file("")
    result = helper.upload_file(file_path, "empty-file.txt")
    if isinstance(result, tuple):
        success, uploaded_key = result
    else:
        success = result
        uploaded_key = "empty-file.txt"
    assert success, "Failed to upload empty file"
    
    download_success, content = helper.download_file(uploaded_key)
    assert download_success, "Failed to download empty file"
    
    helper.delete_file(uploaded_key)


def test_container_images(helper):
    """Test pods are using correct container images"""
    pod_names = helper.get_pod_names()
    assert len(pod_names) > 0, "No pods found"
    
    for pod_name in pod_names:
        image = helper.get_pod_image(pod_name)
        assert image is not None, f"Failed to get image for {pod_name}"
        assert "file-gateway" in image.lower() or "file-api" in image.lower() or "filesystem-mcp" in image.lower() or "versitygw" in image.lower(), f"Unexpected image for {pod_name}: {image}"


def test_file_api_image_repository(helper):
    """Test file-api uses correct image repository"""
    pod_names = helper.get_pod_names()
    file_api_pods = [p for p in pod_names if 'file-api' in p]
    assert len(file_api_pods) > 0, "file-api pod not found"
    
    image = helper.get_pod_image(file_api_pods[0])
    assert "ghcr.io/mckinsey" in image or "file-api" in image, f"file-api image repository unexpected: {image}"
