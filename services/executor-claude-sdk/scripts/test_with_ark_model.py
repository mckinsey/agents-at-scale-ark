#!/usr/bin/env python3
"""Test the executor with Ark model config.

This simulates how the Ark controller sends requests with model credentials.
"""

import asyncio
import os
import sys

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from claude_sdk_executor.sdk.runner import ClaudeSdkRunner, ArkModelConfig
from claude_sdk_executor.types.claude_config import ClaudeSdkConfig

# Colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


async def test_with_model_config():
    """Test execution with Ark model config."""
    
    # Simulate what Ark controller would send in request.agent.model
    # Uses 'bedrock' provider for AWS Bedrock-hosted Claude via AI Gateway
    model_data = {
        "name": "claude-sonnet-4-20250514",
        "type": "bedrock",
        "config": {
            "bedrock": {
                "baseUrl": "https://aws-bedrock.prod.ai-gateway.quantumblack.com/1490d8c5-a4f1-4143-9848-eab537cb54cd",
                "properties": {
                    "apiKey": os.environ.get("ANTHROPIC_API_KEY", ""),
                }
            }
        }
    }
    
    if not model_data["config"]["bedrock"]["properties"]["apiKey"]:
        print(f"{RED}Error: Set ANTHROPIC_API_KEY environment variable{RESET}")
        return False
    
    # Parse model config
    ark_model = ArkModelConfig.from_agent_model(model_data)
    print(f"{YELLOW}Model: {ark_model.name}{RESET}")
    print(f"{YELLOW}Provider: {ark_model.provider}{RESET}")
    print(f"{YELLOW}Base URL: {ark_model.base_url}{RESET}")
    print(f"{YELLOW}API Key: {'set' if ark_model.api_key else 'not set'}{RESET}")
    
    # Create SDK config (minimal)
    claude_config = ClaudeSdkConfig(
        allowed_tools=[],  # No tools for simple test
        permission_mode="acceptEdits",
    )
    
    # Create runner
    runner = ClaudeSdkRunner()
    
    # Test simple prompt
    print(f"\n{YELLOW}Testing simple prompt...{RESET}")
    try:
        output, telemetry = await runner.execute(
            prompt="What is 2 + 2? Reply with just the number.",
            claude_config=claude_config,
            ark_model=ark_model,
            working_dir=None,
            max_turns=3,
            system_prompt="You are a helpful assistant. Be concise.",
        )
        
        print(f"{GREEN}✓ Response: {output}{RESET}")
        print(f"  Session: {telemetry.session_id}")
        print(f"  Cost: ${telemetry.total_cost_usd or 0:.6f}")
        print(f"  Turns: {telemetry.num_turns}")
        
        if "4" in output:
            print(f"{GREEN}✓ Test passed!{RESET}")
            return True
        else:
            print(f"{RED}✗ Expected '4' in response{RESET}")
            return False
            
    except Exception as e:
        print(f"{RED}✗ Error: {e}{RESET}")
        return False


async def main():
    """Run tests."""
    success = await test_with_model_config()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
