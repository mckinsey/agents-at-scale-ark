"""
Platform configuration management for OSS providers.
"""

import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PlatformConfiguration:
    """
    Configuration container for OSS platform connections.
    """
    platform: str
    parameters: Dict[str, Any]
    
    @classmethod
    def from_parameters(cls, platform: str, parameters: Dict[str, Any]) -> "PlatformConfiguration":
        """
        Create platform configuration from request parameters.
        
        Args:
            platform: Platform name (e.g., "langfuse", "ragas")
            parameters: Raw parameters dictionary
            
        Returns:
            PlatformConfiguration instance
        """
        # Extract platform-specific parameters
        platform_params = {}
        prefix = f"{platform}."
        
        for key, value in parameters.items():
            if key.startswith(prefix):
                # Remove platform prefix for cleaner access
                clean_key = key[len(prefix):]
                platform_params[clean_key] = value
        
        return cls(platform=platform, parameters=platform_params)
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        Get configuration value.
        
        Args:
            key: Configuration key
            default: Default value if key not found
            
        Returns:
            Configuration value or default
        """
        return self.parameters.get(key, default)
    
    def validate(self, required_keys: List[str]) -> bool:
        """
        Validate that all required keys are present.
        
        Args:
            required_keys: List of required configuration keys
            
        Returns:
            True if all required keys are present
        """
        for key in required_keys:
            if key not in self.parameters:
                logger.warning(f"Missing required configuration: {self.platform}.{key}")
                return False
        return True
    
    def get_connection_params(self) -> Dict[str, Any]:
        """
        Get connection parameters for the platform.
        
        Returns:
            Dictionary of connection parameters
        """
        # Common patterns across platforms
        connection_params = {}
        
        # Handle common parameter names
        param_mappings = {
            "host": ["host", "base_url", "endpoint"],
            "api_key": ["api_key", "key", "token"],
            "public_key": ["public_key", "client_id"],
            "secret_key": ["secret_key", "secret", "client_secret"],
            "project": ["project", "project_name", "workspace"],
            "environment": ["environment", "env"],
        }
        
        for standard_key, possible_keys in param_mappings.items():
            for key in possible_keys:
                if key in self.parameters:
                    connection_params[standard_key] = self.parameters[key]
                    break
        
        # Add any remaining parameters not in standard mappings
        for key, value in self.parameters.items():
            if key not in connection_params.values():
                connection_params[key] = value
        
        return connection_params