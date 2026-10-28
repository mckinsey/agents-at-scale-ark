"""Ark ExecutionEngine backed by Agent Substrate.

Runs Ark agents as sandboxed Substrate actors instead of in-cluster pods. See
openspec/changes/substrate-execution-backend for the proposal, specs, and design.
"""

from .executor import SubstrateExecutor

__all__ = ["SubstrateExecutor"]
