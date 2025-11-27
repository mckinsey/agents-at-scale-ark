"""Type definitions for AEM."""

from typing import NewType

# Protobuf is a subtype of bytes, representing protobuf-serialized data
Protobuf = NewType("Protobuf", bytes)

