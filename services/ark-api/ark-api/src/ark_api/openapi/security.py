from typing import Dict, Any, Set, List
from ..auth.constants import AuthMode


def add_security_to_openapi(
    openapi_schema: Dict[str, Any],
    auth_mode: str,
    public_routes: Set[str],
) -> Dict[str, Any]:
    components: Dict[str, Any] = openapi_schema.setdefault("components", {})
    security_schemes: Dict[str, Any] = {}
    global_security: List[Dict[str, List[str]]] = []

    mode = (auth_mode or "").lower() or AuthMode.OPEN

    if mode in [AuthMode.SSO, AuthMode.HYBRID]:
        security_schemes["bearerAuth"] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Provide a valid OIDC/JWT bearer token.",
        }
        global_security.append({"bearerAuth": []})

    if mode in [AuthMode.BASIC, AuthMode.HYBRID]:
        security_schemes["basicAuth"] = {
            "type": "http",
            "scheme": "basic",
            "description": "Use API key pair as Basic auth: public_key:secret_key.",
        }
        if {"basicAuth": []} not in global_security:
            global_security.append({"basicAuth": []})

    if security_schemes:
        components["securitySchemes"] = security_schemes
        openapi_schema["components"] = components
        openapi_schema["security"] = global_security
    else:
        openapi_schema.pop("security", None)

    paths = openapi_schema.get("paths", {})
    for path, path_item in paths.items():
        if path in public_routes:
            for method, operation in list(path_item.items()):
                if method.lower() in ["get", "post", "put", "patch", "delete", "options", "head"]:
                    operation["security"] = []

    return openapi_schema


