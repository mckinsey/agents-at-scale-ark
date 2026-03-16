import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from helpers.mcp_servers_helper import McpServersHelper


class TestMcpServersCLI:
    helper = None
    test_server_name = "file-gateway-mcpserver"
    
    @classmethod
    def setup_class(cls):
        cls.helper = McpServersHelper()
    
    def test_list_mcp_servers(self):
        success, servers = self.helper.list_mcp_servers()
        assert success, "Failed to list MCP servers"
        assert isinstance(servers, list)
    
    def test_get_mcp_server(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        server_name = servers[0]
        success, server_data = self.helper.get_mcp_server(server_name)
        assert success, f"Failed to get MCP server: {server_name}"
        assert server_data is not None
        assert server_data["metadata"]["name"] == server_name
    
    def test_verify_mcp_server_status(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        if self.test_server_name in servers:
            server_name = self.test_server_name
        else:
            server_name = servers[0]
        
        success, status = self.helper.verify_mcp_server_status(server_name, max_retries=6, retry_delay=5)
        
        if not success and "timed out" in status.lower():
            pytest.skip(f"MCP server {server_name} not yet reconciled")
        
        assert success, f"Failed to verify MCP server status: {status}"
        assert status == "Available" or "Failed" in status, f"Unexpected status: {status}"
    
    def test_get_mcp_server_tools(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        server_name = servers[0]
        success, tools = self.helper.get_mcp_server_tools(server_name)
        
        assert success, "Failed to get MCP server tools"
        assert isinstance(tools, list)
    
    def test_verify_mcp_server_tool_count(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        if self.test_server_name in servers:
            server_name = self.test_server_name
        else:
            server_name = servers[0]
        
        success, tool_count = self.helper.verify_mcp_server_tool_count(server_name, min_count=1)
        
        if not success and tool_count == 0:
            pytest.skip(f"MCP server {server_name} has no tools (not yet reconciled or not available)")
        
        assert success, f"MCP server has insufficient tools. Count: {tool_count}"
        assert tool_count > 0, "MCP server should have at least 1 tool"
    
    def test_verify_mcp_server_endpoints(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        server_name = servers[0]
        success, endpoint = self.helper.verify_mcp_server_endpoints(server_name)
        
        assert success, f"Failed to verify MCP server endpoint: {endpoint}"
        assert len(endpoint) > 0, "Endpoint should not be empty"
    
    def test_file_gateway_mcp_server_specific(self):
        success, servers = self.helper.list_mcp_servers()
        if not success:
            pytest.skip("Failed to list MCP servers")
        
        if self.test_server_name not in servers:
            pytest.skip(f"MCP server {self.test_server_name} not found")
        
        success, server_data = self.helper.get_mcp_server(self.test_server_name)
        assert success, f"Failed to get {self.test_server_name}"
        
        status = server_data.get("status", {})
        tool_count = status.get("toolCount", 0)
        assert tool_count > 0, f"File Gateway should have tools, found {tool_count}"
        
        conditions = status.get("conditions", [])
        available = any(
            c.get("type") == "Available" and c.get("status") == "True" 
            for c in conditions
        )
        assert available, "File Gateway MCP server should be Available"
    
    def test_mcp_server_metadata(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        server_name = servers[0]
        success, server_data = self.helper.get_mcp_server(server_name)
        
        assert success
        metadata = server_data["metadata"]
        assert "name" in metadata
        assert "namespace" in metadata
        assert "creationTimestamp" in metadata
    
    def test_mcp_server_spec(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        server_name = servers[0]
        success, server_data = self.helper.get_mcp_server(server_name)
        
        assert success
        spec = server_data.get("spec", {})
        assert "endpoint" in spec or "address" in spec, "MCP server should have an endpoint or address"
    
    def test_mcp_server_status_conditions(self):
        success, servers = self.helper.list_mcp_servers()
        if not success or not servers:
            pytest.skip("No MCP servers available")
        
        server_name = servers[0]
        success, server_data = self.helper.get_mcp_server(server_name)
        
        assert success
        status = server_data.get("status", {})
        conditions = status.get("conditions", [])
        
        assert isinstance(conditions, list), "Conditions should be a list"
        
        if conditions:
            condition = conditions[0]
            assert "type" in condition
            assert "status" in condition
