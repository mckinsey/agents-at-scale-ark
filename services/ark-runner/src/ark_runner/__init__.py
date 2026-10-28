"""Config-driven Ark agent runner.

PID-1 inside a Substrate actor. Honors the Substrate runner contract, reads the
Agent/Model/Tool spec supplied by ark-substrate-executor, and runs the agent via a
framework adapter (default: completions) — so the framework is chosen by config, not
by baking a separate image per framework. See
openspec/changes/substrate-execution-backend (specs/substrate-agent-runner).
"""
