#!/usr/bin/env python3
"""Live test script for Claude SDK Executor.

Run with: ANTHROPIC_API_KEY=sk-xxx python scripts/test_live.py

This script starts the executor server and sends a test request.
"""

import os
import sys
import json
import time
import subprocess
import signal
import requests

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

def check_api_key():
    """Verify ANTHROPIC_API_KEY is set."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(f"{RED}Error: ANTHROPIC_API_KEY not set{RESET}")
        print(f"\nRun with: ANTHROPIC_API_KEY=sk-xxx python scripts/test_live.py")
        sys.exit(1)

def start_server():
    """Start the executor server."""
    print(f"{YELLOW}Starting executor server...{RESET}")
    
    # Start server in background
    proc = subprocess.Popen(
        ["uvicorn", "claude_sdk_executor.app:app", "--host", "127.0.0.1", "--port", "8080"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env={**os.environ, "PYTHONPATH": "src"},
    )
    
    # Wait for server to start
    for _ in range(30):
        try:
            resp = requests.get("http://127.0.0.1:8080/health", timeout=1)
            if resp.status_code == 200:
                print(f"{GREEN}✓ Server started{RESET}")
                return proc
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(0.5)
    
    proc.kill()
    print(f"{RED}Failed to start server{RESET}")
    sys.exit(1)

def test_simple_prompt(base_url: str):
    """Test a simple prompt that doesn't need tools."""
    print(f"\n{YELLOW}Test 1: Simple prompt (no tools){RESET}")
    
    request = {
        "query_id": "live-test-001",
        "agent_name": "test-agent",
        "agent_namespace": "test",
        "model": "claude-sonnet-4-20250514",
        "system_prompt": "You are a helpful assistant. Respond concisely.",
        "user_prompt": "What is the capital of France? Reply in one word.",
        "profile": {
            "name": "simple-test",
            "namespace": "test",
            "execution": {
                "maxIterations": 3,
                "timeout": "1m"
            },
            "sdkConfig": {
                "claude": {
                    "allowedTools": [],
                    "permissionMode": "acceptEdits"
                }
            }
        }
    }
    
    try:
        resp = requests.post(f"{base_url}/execute", json=request, timeout=60)
        result = resp.json()
        
        if resp.status_code == 200 and "Paris" in result.get("output", ""):
            print(f"{GREEN}✓ Passed - Got response: {result.get('output', '')[:100]}{RESET}")
            return True
        else:
            print(f"{RED}✗ Failed - Status: {resp.status_code}{RESET}")
            print(f"  Response: {json.dumps(result, indent=2)[:500]}")
            return False
    except Exception as e:
        print(f"{RED}✗ Error: {e}{RESET}")
        return False

def test_with_tools(base_url: str):
    """Test a prompt that uses file tools."""
    print(f"\n{YELLOW}Test 2: With tools (Read, Write){RESET}")
    
    request = {
        "query_id": "live-test-002",
        "agent_name": "test-agent",
        "agent_namespace": "test",
        "model": "claude-sonnet-4-20250514",
        "system_prompt": "You are a helpful coding assistant.",
        "user_prompt": "Describe what a hello world Python script would look like. Don't create any files.",
        "profile": {
            "name": "tools-test",
            "namespace": "test",
            "execution": {
                "maxIterations": 5,
                "timeout": "2m"
            },
            "sdkConfig": {
                "claude": {
                    "allowedTools": ["Read", "Glob", "Grep"],
                    "permissionMode": "acceptEdits"
                }
            }
        }
    }
    
    try:
        resp = requests.post(f"{base_url}/execute", json=request, timeout=120)
        result = resp.json()
        
        if resp.status_code == 200:
            print(f"{GREEN}✓ Passed - Got response{RESET}")
            output = result.get("output", "")[:200]
            print(f"  Output: {output}...")
            return True
        else:
            print(f"{RED}✗ Failed - Status: {resp.status_code}{RESET}")
            print(f"  Response: {json.dumps(result, indent=2)[:500]}")
            return False
    except Exception as e:
        print(f"{RED}✗ Error: {e}{RESET}")
        return False

def main():
    check_api_key()
    
    base_url = "http://127.0.0.1:8080"
    proc = None
    
    try:
        proc = start_server()
        
        results = []
        results.append(test_simple_prompt(base_url))
        results.append(test_with_tools(base_url))
        
        print(f"\n{YELLOW}Results:{RESET}")
        passed = sum(results)
        total = len(results)
        
        if passed == total:
            print(f"{GREEN}All {total} tests passed!{RESET}")
        else:
            print(f"{RED}{passed}/{total} tests passed{RESET}")
            sys.exit(1)
            
    finally:
        if proc:
            print(f"\n{YELLOW}Stopping server...{RESET}")
            proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=5)
            print(f"{GREEN}✓ Server stopped{RESET}")

if __name__ == "__main__":
    main()
