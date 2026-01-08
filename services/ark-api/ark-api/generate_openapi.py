#!/usr/bin/env python3
"""Generate OpenAPI schema without running the server."""
import json
import os
import sys
from pathlib import Path
from typing import Dict, Any

# Add the src directory to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from ark_api.main import app
from ark_api.auth.constants import AuthMode
from ark_api.auth.config import get_public_routes
from ark_api.openapi.security import add_security_to_openapi

# Generate base OpenAPI schema
openapi_schema: Dict[str, Any] = app.openapi()

# Inject security based on AUTH_MODE (same logic as /openapi.json) via helper
auth_mode = os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN
openapi_schema = add_security_to_openapi(
    openapi_schema,
    auth_mode=auth_mode,
    public_routes=get_public_routes(),
)

# Safety net: Detect non-deterministic schema names (#656)
# Pydantic auto-generates names like "ark_api__models__agents__Header-Input" when
# multiple models share the same class name. These names depend on import order,
# causing CI to fail with: "Error: Generated types.ts file has changed"
# Fix: Rename Python classes to be unique (e.g., AgentHeader, MCPServerHeader).
# See: https://github.com/mckinsey/agents-at-scale-ark/issues/656
if "components" in openapi_schema and "schemas" in openapi_schema["components"]:
    collisions = [name for name in openapi_schema["components"]["schemas"] if "__models__" in name]
    if collisions:
        print("ERROR: Non-deterministic schema names detected (#656):")
        for name in sorted(collisions):
            print(f"  - {name}")
        print("\nThese cause CI failures: 'Error: Generated types.ts file has changed'")
        print("Fix: Rename Python classes to be unique (e.g., AgentHeader, MCPServerHeader).")
        print("See: https://github.com/mckinsey/agents-at-scale-ark/issues/656")
        sys.exit(1)
# Write to file with sorted keys for deterministic JSON
with open("openapi.json", "w") as f:
    json.dump(openapi_schema, f, indent=2, sort_keys=True)

print("OpenAPI schema written to openapi.json")
