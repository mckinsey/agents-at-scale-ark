import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from helpers.tools_helper import ToolsHelper


class TestToolsCLI:
    helper = None
    created_tools = []
    
    @classmethod
    def setup_class(cls):
        cls.helper = ToolsHelper()
    
    @classmethod
    def teardown_class(cls):
        if cls.helper:
            cls.helper.cleanup_tools("test-tool-cli-")
    
    def test_create_http_tool(self):
        tool_name = "test-tool-cli-create"
        success, message = self.helper.create_http_tool(
            name=tool_name,
            description="Test tool for CLI testing",
            url="https://api.example.com/test",
            method="GET"
        )
        
        assert success, f"Tool creation failed: {message}"
        self.created_tools.append(tool_name)
        
        assert self.helper.verify_tool_exists(tool_name), "Tool should exist after creation"
    
    def test_create_post_tool(self):
        tool_name = "test-tool-cli-post"
        success, message = self.helper.create_http_tool(
            name=tool_name,
            description="POST method tool",
            url="https://api.example.com/create",
            method="POST"
        )
        
        assert success, f"Tool creation failed: {message}"
        self.created_tools.append(tool_name)
    
    def test_get_tool(self):
        tool_name = "test-tool-cli-get"
        self.helper.create_http_tool(
            name=tool_name,
            description="Get tool test",
            url="https://api.example.com/get",
            method="GET"
        )
        self.created_tools.append(tool_name)
        
        success, tool_data = self.helper.get_tool(tool_name)
        assert success, "Failed to get tool"
        assert tool_data is not None
        assert tool_data["metadata"]["name"] == tool_name
    
    def test_list_tools(self):
        success, tools = self.helper.list_tools()
        assert success, "Failed to list tools"
        assert isinstance(tools, list)
        
        for tool_name in self.created_tools:
            assert tool_name in tools, f"Tool {tool_name} not found in list"
    
    def test_verify_tool_spec(self):
        tool_name = "test-tool-cli-verify"
        expected_url = "https://api.example.com/verify"
        expected_method = "GET"
        
        self.helper.create_http_tool(
            name=tool_name,
            description="Verify spec test",
            url=expected_url,
            method=expected_method
        )
        self.created_tools.append(tool_name)
        
        success, message = self.helper.verify_tool_spec(
            name=tool_name,
            expected_url=expected_url,
            expected_method=expected_method
        )
        assert success, f"Tool spec verification failed: {message}"
    
    def test_tool_with_special_chars(self):
        tool_name = "test-tool-cli-special"
        description = "Tool with special characters: @#$%"
        url = "https://api.example.com/special?param=value&other=test"
        
        success, message = self.helper.create_http_tool(
            name=tool_name,
            description=description,
            url=url,
            method="GET"
        )
        
        assert success, f"Tool creation failed: {message}"
        self.created_tools.append(tool_name)
        
        success, tool_data = self.helper.get_tool(tool_name)
        assert success
        assert tool_data["spec"]["http"]["url"] == url
    
    def test_delete_tool(self):
        tool_name = "test-tool-cli-delete"
        self.helper.create_http_tool(
            name=tool_name,
            description="Delete test",
            url="https://api.example.com/delete",
            method="DELETE"
        )
        
        success, message = self.helper.delete_tool(tool_name)
        assert success, f"Failed to delete tool: {message}"
        
        assert not self.helper.verify_tool_exists(tool_name), "Tool should not exist after deletion"
    
    def test_cleanup_tools(self):
        for i in range(3):
            tool_name = f"test-tool-cli-cleanup-{i}"
            self.helper.create_http_tool(
                name=tool_name,
                description=f"Cleanup test {i}",
                url=f"https://api.example.com/cleanup{i}",
                method="GET"
            )
        
        success, count = self.helper.cleanup_tools("test-tool-cli-cleanup-")
        assert success, "Failed to cleanup tools"
        assert count == 3, f"Expected 3 tools deleted, got {count}"
    
    def test_tool_update(self):
        tool_name = "test-tool-cli-update"
        original_url = "https://api.example.com/original"
        updated_url = "https://api.example.com/updated"
        
        self.helper.create_http_tool(
            name=tool_name,
            description="Update test",
            url=original_url,
            method="GET"
        )
        self.created_tools.append(tool_name)
        
        self.helper.create_http_tool(
            name=tool_name,
            description="Updated tool",
            url=updated_url,
            method="POST"
        )
        
        success, message = self.helper.verify_tool_spec(
            name=tool_name,
            expected_url=updated_url,
            expected_method="POST"
        )
        assert success, f"Tool update verification failed: {message}"
