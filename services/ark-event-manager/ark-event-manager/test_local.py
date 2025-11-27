"""Simple local test script for AEM service."""

import asyncio
import json
from datetime import datetime

import httpx


async def test_aer():
    """Test AEM endpoints locally."""
    base_url = "http://localhost:8080"

    async with httpx.AsyncClient(timeout=10.0) as client:
        print("Testing AEM service...\n")

        # Test health check
        print("1. Testing health check...")
        response = await client.get(f"{base_url}/health")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}\n")

        # Test event ingestion (simplified - just bytes for now)
        print("2. Testing event ingestion...")
        test_event = {
            "event_id": "test-123",
            "correlation_id": "session-456",
            "timestamp": datetime.utcnow().isoformat(),
            "severity": "INFO",
            "type": "test",
            "subtype": "test_event",
            "source_type": "SERVICE",
            "source": "test-script",
            "version": "v1",
            "payload": {"message": "Hello from test"},
        }
        event_bytes = json.dumps(test_event).encode("utf-8")
        response = await client.post(
            f"{base_url}/events",
            content=event_bytes,
            headers={
                "Content-Type": "application/x-protobuf",
                "X-Correlation-ID": "session-456",
            },
        )
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}\n")

        # Test memory storage - add messages
        print("3. Testing memory storage - add messages...")
        response = await client.post(
            f"{base_url}/messages",
            json={
                "session_id": "test-session-123",
                "query_id": "test-query-456",
                "messages": [
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "Hi there!"},
                ],
            },
        )
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}\n")

        # Test memory storage - get messages
        print("4. Testing memory storage - get messages...")
        response = await client.get(
            f"{base_url}/messages?session_id=test-session-123"
        )
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}\n")

        print("All tests completed!")


if __name__ == "__main__":
    asyncio.run(test_aer())

