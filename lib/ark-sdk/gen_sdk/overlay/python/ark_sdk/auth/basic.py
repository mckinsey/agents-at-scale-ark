"""Basic authentication support for ARK SDK."""

import base64
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class BasicAuthValidator:
    """Validates basic authentication credentials."""
    
    @staticmethod
    def parse_basic_auth_header(auth_header: str) -> Optional[Tuple[str, str]]:
        """Parse basic auth header into username and password.
        
        Args:
            auth_header: Authorization header value (e.g., "Basic dXNlcjpwYXNz")
            
        Returns:
            Tuple of (username, password) or None if invalid
        """
        if not auth_header.startswith("Basic "):
            return None
        
        try:
            # Extract the base64 encoded credentials
            encoded_credentials = auth_header[6:]  # Remove "Basic " prefix
            
            # Decode the credentials
            decoded_bytes = base64.b64decode(encoded_credentials)
            decoded_str = decoded_bytes.decode('utf-8')
            
            # Split on first colon (username:password)
            if ':' not in decoded_str:
                return None
            
            username, password = decoded_str.split(':', 1)
            return username, password
            
        except Exception as e:
            logger.error(f"Error parsing basic auth header: {e}")
            return None
    
    @staticmethod
    def create_basic_auth_header(username: str, password: str) -> str:
        """Create a basic auth header from username and password.
        
        Args:
            username: The username (public key for API keys)
            password: The password (secret key for API keys)
            
        Returns:
            The Authorization header value
        """
        credentials = f"{username}:{password}"
        encoded = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
        return f"Basic {encoded}"
