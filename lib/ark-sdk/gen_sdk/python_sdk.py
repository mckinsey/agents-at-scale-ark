#!/usr/bin/env python3
"""
Python SDK Generation Module

This module contains functions to generate Python SDK client classes from OpenAPI schemas.
"""

from typing import Dict, List, Any
import re
import os
from pathlib import Path


def to_snake_case(name: str) -> str:
    """Convert CamelCase to snake_case"""
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def generate_base_client() -> str:
    """Generate the base ARK client class"""
    # Get the directory where this module is located
    module_dir = Path(__file__).parent
    template_path = module_dir / "template" / "python" / "base_client.py.template"
    
    # Read the template file
    with open(template_path, 'r') as f:
        return f.read()


def generate_versioned_client(api_version: str, resources: List[Dict[str, Any]]) -> str:
    """Generate a versioned ARK client class"""
    # Convert version to class name (e.g., v1alpha1 -> V1alpha1)
    version_part = api_version.split('/')[-1]
    class_name = f"ARKClient{version_part.capitalize()}"

    to_class = lambda name: f"{name}{version_part.capitalize()}"

    # Generate imports
    imports = set()
    for resource in resources:
        model_class = resource['model_class']
        kind = resource['kind']
        imports.add(f"from .models.{to_snake_case(model_class)} import {to_class(kind)}")
    
    imports_str = '\n'.join(sorted(imports))
    
    # Generate resource client initializations
    resource_inits = []
    for resource in resources:
        kind = resource['kind']
        attr_name = resource['plural']
        resource_init = f'''        self.{attr_name} = ARKResourceClient(
            api_version="{resource['api_version']}",
            kind="{resource['kind']}",
            plural="{resource['plural']}",
            model_class={to_class(kind)},
            namespace=namespace
        )'''
        resource_inits.append(resource_init)
    
    resource_inits_str = '\n\n'.join(resource_inits)
    
    # Generate class
    return f'''

{imports_str}


class {class_name}(_ARKClient):
    """ARK client for API version {api_version}"""

    def __init__(self, namespace: Optional[str] = None):
        super().__init__(namespace)
        
{resource_inits_str}
        
{generate_secret_client_addition()}
'''


def generate_yaml_routing(resources: List[Dict[str, Any]]) -> str:
    """Generate the if-elif chain for YAML routing"""
    conditions = []
    for i, resource in enumerate(resources):
        kind = resource['kind']
        plural = resource['plural']
        model_class = resource['model_class']
        
        if i == 0:
            condition = f"if kind == '{kind}':\n            return self.{plural}.create({model_class}(**data))"
        else:
            condition = f"elif kind == '{kind}':\n            return self.{plural}.create({model_class}(**data))"
        conditions.append(condition)
    
    return '\n        '.join(conditions)


def generate_secret_client_addition() -> str:
    """Generate secret client addition for versioned clients."""
    return '''        # Add secret client
        from .k8s import SecretClient
        self.secrets = SecretClient(namespace)'''
