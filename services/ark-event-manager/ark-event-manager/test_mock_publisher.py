"""Mock event publisher to test the full event processing pipeline.

Usage:
    # Terminal 1: Start the service
    cd services/ark-event-manager/ark-event-manager
    USE_DATABASE=true uv run python -m ark_event_manager

    # Terminal 2: Run the mock publisher
    cd services/ark-event-manager/ark-event-manager
    uv run python test_mock_publisher.py
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add src to path for imports
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

import httpx
from google.protobuf import struct_pb2

from ark_event_manager.core.models import Event, EventSeverity, EventSourceType
from ark_event_manager.core.types import Protobuf


class MockEventPublisher:
    """Mock event publisher for testing."""

    def __init__(self, base_url: str = "http://localhost:8080"):
        """
        Initialize mock publisher.

        Args:
            base_url: Base URL of the event manager service
        """
        self.base_url = base_url.rstrip("/")
        self.url = f"{self.base_url}/events"

    def create_event(
        self,
        event_type: str = "query",
        subtype: str = "execution_start",
        correlation_id: str | None = None,
        severity: EventSeverity = EventSeverity.INFO,
        source_type: EventSourceType = EventSourceType.ARK_CONTROLLER,
        source: str = "mock-publisher",
        payload: dict | None = None,
    ) -> Event:
        """
        Create a mock event.

        Args:
            event_type: Event type (e.g., "query", "workflow")
            subtype: Event subtype (e.g., "execution_start", "execution_complete")
            correlation_id: Correlation ID (defaults to generated UUID)
            severity: Event severity
            source_type: Event source type
            source: Source identifier
            payload: Event payload data

        Returns:
            Event instance
        """
        if correlation_id is None:
            correlation_id = f"test-{uuid.uuid4().hex[:8]}"

        if payload is None:
            payload = {}

        return Event(
            event_id=str(uuid.uuid4()),
            correlation_id=correlation_id,
            timestamp=datetime.utcnow(),
            severity=severity,
            type=event_type,
            subtype=subtype,
            source_type=source_type,
            source=source,
            version="v1",
            payload=payload,
        )

    def event_to_protobuf_bytes(self, event: Event) -> Protobuf:
        """
        Convert Event to protobuf-serialized bytes.

        Creates a proper protobuf message using message_factory and serializes it to bytes.

        Args:
            event: Event instance

        Returns:
            Protobuf-serialized bytes
        """
        # Convert timestamp to protobuf Timestamp format
        if isinstance(event.timestamp, datetime):
            timestamp_seconds = int(event.timestamp.timestamp())
            timestamp_nanos = int((event.timestamp.timestamp() - timestamp_seconds) * 1e9)
        else:
            timestamp_seconds = int(datetime.now(timezone.utc).timestamp())
            timestamp_nanos = 0

        # Ensure proto is generated and import generated code
        generated_path = Path(__file__).parent / "generated"
        if generated_path.exists():
            sys.path.insert(0, str(generated_path))
        
        self._ensure_proto_generated()
        
        import event_pb2
        
        EventProto = event_pb2.Event
        
        # Create protobuf message
        proto_event = EventProto()
        proto_event.event_id = event.event_id
        proto_event.correlation_id = event.correlation_id
        
        # Set timestamp
        proto_event.timestamp.seconds = timestamp_seconds
        proto_event.timestamp.nanos = timestamp_nanos
        
        # Set enums and strings
        proto_event.severity = event.severity.value
        proto_event.type = event.type
        proto_event.subtype = event.subtype
        proto_event.source_type = event.source_type.value
        proto_event.source = event.source
        proto_event.version = event.version
        
        # Set payload as Struct
        self._dict_to_protobuf_struct(event.payload, proto_event.payload)
        
        # Serialize to bytes
        return Protobuf(proto_event.SerializeToString())

    def _ensure_proto_generated(self) -> None:
        """Ensure proto code is generated."""
        generated_path = Path(__file__).parent / "generated"
        proto_file = generated_path / "event_pb2.py"
        
        if proto_file.exists():
            return
        
        # Generate proto code
        generate_script = Path(__file__).parent / "generate_proto.py"
        if not generate_script.exists():
            raise ImportError(
                f"generate_proto.py not found at {generate_script}\n"
                "Run: python generate_proto.py"
            )
        
        import subprocess
        result = subprocess.run(
            [sys.executable, str(generate_script)],
            capture_output=True,
            text=True,
        )
        
        if result.returncode != 0:
            raise ImportError(
                f"Failed to generate proto code: {result.stderr}\n"
                "Install grpcio-tools: uv sync --extra dev\n"
                "Then run: python generate_proto.py"
            )
        
        if not proto_file.exists():
            raise ImportError(
                f"Proto file not generated at {proto_file}\n"
                "Check generate_proto.py output for errors"
            )

    def _dict_to_protobuf_struct(self, data: dict, struct: struct_pb2.Struct) -> None:
        """Convert Python dict to protobuf Struct."""
        for key, value in data.items():
            if isinstance(value, str):
                struct.fields[key].string_value = value
            elif isinstance(value, (int, float)):
                struct.fields[key].number_value = float(value)
            elif isinstance(value, bool):
                struct.fields[key].bool_value = value
            elif isinstance(value, dict):
                self._dict_to_protobuf_struct(value, struct.fields[key].struct_value)
            elif isinstance(value, list):
                list_value = struct.fields[key].list_value
                for item in value:
                    if isinstance(item, str):
                        list_value.values.add().string_value = item
                    elif isinstance(item, (int, float)):
                        list_value.values.add().number_value = float(item)
                    elif isinstance(item, bool):
                        list_value.values.add().bool_value = item
                    elif isinstance(item, dict):
                        self._dict_to_protobuf_struct(item, list_value.values.add().struct_value)
            else:
                struct.fields[key].string_value = str(value)

    async def publish(self, event: Event, correlation_id: str | None = None) -> httpx.Response:
        """
        Publish an event to the event manager.

        Args:
            event: Event instance
            correlation_id: Optional correlation ID (uses event's if not provided)

        Returns:
            HTTP response
        """
        event_bytes = self.event_to_protobuf_bytes(event)
        corr_id = correlation_id or event.correlation_id

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.url,
                content=event_bytes,
                headers={
                    "Content-Type": "application/x-protobuf",
                    "X-Correlation-ID": corr_id,
                },
            )
            return response

    async def publish_batch(
        self, events: list[Event], correlation_id: str | None = None
    ) -> list[httpx.Response]:
        """
        Publish multiple events.

        Args:
            events: List of Event instances
            correlation_id: Optional correlation ID for all events

        Returns:
            List of HTTP responses
        """
        responses = []
        for event in events:
            response = await self.publish(event, correlation_id)
            responses.append(response)
            # Small delay between events
            await asyncio.sleep(0.1)
        return responses


async def test_event_pipeline(base_url: str | None = None):
    """
    Test the full event processing pipeline.
    
    Args:
        base_url: Base URL of the event manager service.
                  Defaults to http://localhost:8080 for local,
                  or can be set to http://ark-event-manager.127.0.0.1.nip.io for DevSpace
    """
    if base_url is None:
        base_url = os.getenv("AEM_URL", "http://localhost:8080")
    publisher = MockEventPublisher(base_url=base_url)

    print("=" * 60)
    print("Mock Event Publisher Test")
    print("=" * 60)
    print()

    # Test 1: Health check
    print("1. Testing health check...")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{publisher.base_url}/health")
            print(f"   ✓ Status: {response.status_code}")
            print(f"   ✓ Response: {response.json()}")
        except httpx.ConnectError:
            print("   ✗ Cannot connect to service. Is it running?")
            print("   Run: cd ark-event-manager && uv run python -m ark_event_manager")
            return
    print()

    # Test 2: Publish a single query execution start event
    print("2. Publishing query execution start event...")
    query_id = f"query-{uuid.uuid4().hex[:8]}"
    event1 = publisher.create_event(
        event_type="query",
        subtype="execution_start",
        correlation_id=query_id,
        payload={"queryId": query_id, "queryName": "test-query", "sessionId": "test-session"},
    )
    response = await publisher.publish(event1)
    print(f"   ✓ Status: {response.status_code}")
    print(f"   ✓ Event ID: {event1.event_id}")
    print(f"   ✓ Correlation ID: {event1.correlation_id}")
    print(f"   ✓ Type: {event1.type}/{event1.subtype}")
    print()

    # Test 3: Publish query execution complete event
    print("3. Publishing query execution complete event...")
    await asyncio.sleep(0.5)  # Wait for processing
    event2 = publisher.create_event(
        event_type="query",
        subtype="execution_complete",
        correlation_id=query_id,
        payload={
            "queryId": query_id,
            "queryName": "test-query",
            "sessionId": "test-session",
            "durationMs": 1234.56,
        },
    )
    response = await publisher.publish(event2)
    print(f"   ✓ Status: {response.status_code}")
    print(f"   ✓ Event ID: {event2.event_id}")
    print()

    # Test 4: Publish workflow event
    print("4. Publishing workflow event...")
    workflow_id = f"workflow-{uuid.uuid4().hex[:8]}"
    event3 = publisher.create_event(
        event_type="workflow",
        subtype="succeeded",
        correlation_id=workflow_id,
        source_type=EventSourceType.WATCHER,
        source="argo-watcher",
        payload={"workflowId": workflow_id, "status": "succeeded"},
    )
    response = await publisher.publish(event3)
    print(f"   ✓ Status: {response.status_code}")
    print(f"   ✓ Event ID: {event3.event_id}")
    print()

    # Test 5: Publish error event
    print("5. Publishing error event...")
    event4 = publisher.create_event(
        event_type="error",
        subtype="model_timeout",
        correlation_id=query_id,
        severity=EventSeverity.ERROR,
        payload={"error": "Model timeout", "queryId": query_id},
    )
    response = await publisher.publish(event4)
    print(f"   ✓ Status: {response.status_code}")
    print(f"   ✓ Event ID: {event4.event_id}")
    print()

    # Test 6: Publish batch of events
    print("6. Publishing batch of events...")
    batch_events = [
        publisher.create_event(
            event_type="query",
            subtype="execution_start",
            correlation_id=f"batch-{i}",
            payload={"batch": i},
        )
        for i in range(3)
    ]
    responses = await publisher.publish_batch(batch_events)
    print(f"   ✓ Published {len(responses)} events")
    print(f"   ✓ All status codes: {[r.status_code for r in responses]}")
    print()

    # Test 7: Wait for processing and check storage (if database enabled)
    print("7. Waiting for event processing...")
    await asyncio.sleep(2)  # Wait for EventProcessor to process events
    print("   ✓ Events should be processed by EventProcessor")
    print("   ✓ Query events should be in StreamStorage")
    print("   ✓ All events should be in EventStorage (if USE_DATABASE=true)")
    print()

    print("=" * 60)
    print("Test completed!")
    print("=" * 60)
    print()
    print("To verify events were stored:")
    print("  - Check logs for EventProcessor processing messages")
    print("  - If USE_DATABASE=true, query the SQLite database")
    print("  - Check StreamStorage for query events")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test event processing pipeline")
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help="Base URL of the event manager (default: http://localhost:8080 or AEM_URL env var)",
    )
    args = parser.parse_args()
    
    asyncio.run(test_event_pipeline(base_url=args.url))

