"""Type definitions for AER."""

from typing import NewType

# Protobuf is a subtype of bytes, representing protobuf-serialized data
Protobuf = NewType("Protobuf", bytes)

