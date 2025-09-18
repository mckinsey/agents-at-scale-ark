"""API key management service."""

import secrets
import bcrypt
import base64
import logging
import re
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Dict, Any
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient

from ..models.auth import (
    APIKeyCreateRequest,
    APIKeyResponse,
    APIKeyCreateResponse,
    APIKeyListResponse
)

logger = logging.getLogger(__name__)

# Constants for API key storage
API_KEY_SECRET_TYPE = "ark.mckinsey.com/api-key"
API_KEY_LABEL = "ark.mckinsey.com/api-key"
API_KEY_NAME_ANNOTATION = "ark.mckinsey.com/api-key-name"
API_KEY_CREATED_AT_ANNOTATION = "ark.mckinsey.com/created-at"
API_KEY_EXPIRES_AT_ANNOTATION = "ark.mckinsey.com/expires-at"
API_KEY_LAST_USED_ANNOTATION = "ark.mckinsey.com/last-used-at"
API_KEY_DELETED_AT_ANNOTATION = "ark.mckinsey.com/deleted-at"


class APIKeyService:
    """Service for managing API keys stored as Kubernetes secrets."""
    
    def __init__(self, namespace: str = "ark-system"):
        """Initialize API key service.
        
        Args:
            namespace: Kubernetes namespace to store API keys in
        """
        self.namespace = namespace
    
    def _generate_key_pair(self) -> Tuple[str, str]:
        """Generate a public/secret key pair.
        
        Returns:
            Tuple of (public_key, secret_key)
        """
        public_key = f"pk-ark-{secrets.token_urlsafe(32)}"
        secret_key = f"sk-ark-{secrets.token_urlsafe(48)}"
        return public_key, secret_key
    
    def _hash_secret_key(self, secret_key: str) -> str:
        """Hash the secret key for storage.
        
        Args:
            secret_key: The secret key to hash
            
        Returns:
            Base64-encoded bcrypt hash
        """
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(secret_key.encode('utf-8'), salt)
        return base64.b64encode(hashed).decode('utf-8')
    
    def _verify_secret_key(self, secret_key: str, hashed_secret: str) -> bool:
        """Verify a secret key against its hash.
        
        Args:
            secret_key: The secret key to verify
            hashed_secret: The base64-encoded hash to verify against
            
        Returns:
            True if the secret key is valid
        """
        try:
            hashed_bytes = base64.b64decode(hashed_secret.encode('utf-8'))
            return bcrypt.checkpw(secret_key.encode('utf-8'), hashed_bytes)
        except Exception as e:
            logger.error(f"Error verifying secret key: {e}")
            return False
    
    def _secret_name_from_public_key(self, public_key: str) -> str:
        """Generate a Kubernetes secret name from a public key.
        
        Args:
            public_key: The public key (e.g., pk-ark-xxxxx)
            
        Returns:
            A valid Kubernetes secret name (lowercase, RFC 1123 compliant)
        """
        # Remove the pk-ark- prefix and make it DNS-safe
        key_part = public_key.replace("pk-ark-", "")
        
        # Sanitize for RFC 1123 compliance:
        # - Replace underscores with hyphens
        # - Replace multiple consecutive hyphens with single hyphen
        # - Convert to lowercase
        # - Ensure starts and ends with alphanumeric
        sanitized = key_part.replace("_", "-").lower()
        
        # Replace multiple consecutive hyphens with single hyphen
        sanitized = re.sub(r'-+', '-', sanitized)
        
        # Ensure starts and ends with alphanumeric (strip leading/trailing hyphens)
        sanitized = sanitized.strip('-')
        
        return f"api-key-{sanitized}"
    
    def _parse_datetime(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse datetime string from annotations.
        
        Args:
            dt_str: ISO format datetime string
            
        Returns:
            Datetime object or None if parsing fails
        """
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        except Exception:
            return None
    
    def _format_datetime(self, dt: Optional[datetime]) -> Optional[str]:
        """Format datetime for storage in annotations.
        
        Args:
            dt: Datetime to format
            
        Returns:
            ISO format string or None
        """
        if not dt:
            return None
        return dt.isoformat()
    
    async def create_api_key(self, request: APIKeyCreateRequest, user_id: Optional[str] = None) -> APIKeyCreateResponse:
        """Create a new API key.
        
        Args:
            request: API key creation request
            user_id: Optional user ID who created the key
            
        Returns:
            API key creation response with secret key
        """
        # Generate key pair
        public_key, secret_key = self._generate_key_pair()
        secret_key_hash = self._hash_secret_key(secret_key)
        
        # Prepare metadata
        now = datetime.now(timezone.utc)
        annotations = {
            API_KEY_NAME_ANNOTATION: request.name,
            API_KEY_CREATED_AT_ANNOTATION: self._format_datetime(now),
        }
        
        if request.expires_at:
            annotations[API_KEY_EXPIRES_AT_ANNOTATION] = self._format_datetime(request.expires_at)
        
        if user_id:
            annotations["ark.mckinsey.com/created-by"] = user_id
        
        labels = {
            API_KEY_LABEL: "true",
        }
        
        # Create Kubernetes secret
        secret_name = self._secret_name_from_public_key(public_key)
        
        secret = client.V1Secret(
            api_version="v1",
            kind="Secret",
            metadata=client.V1ObjectMeta(
                name=secret_name,
                labels=labels,
                annotations=annotations
            ),
            type=API_KEY_SECRET_TYPE,
            string_data={
                "public_key": public_key,
                "secret_key_hash": secret_key_hash,
                "is_active": "true"
            }
        )
        
        async with ApiClient() as api:
            v1 = client.CoreV1Api(api)
            created_secret = await v1.create_namespaced_secret(
                namespace=self.namespace,
                body=secret
            )
        
        logger.info(f"Created API key {public_key} with name '{request.name}'")
        
        return APIKeyCreateResponse(
            id=str(created_secret.metadata.uid),
            name=request.name,
            public_key=public_key,
            secret_key=secret_key,  # Only returned on creation
            created_at=now,
            expires_at=request.expires_at
        )
    
    async def list_api_keys(self) -> APIKeyListResponse:
        """List all active API keys (without secret keys).
        
        Returns:
            List of API key responses
        """
        async with ApiClient() as api:
            v1 = client.CoreV1Api(api)
            
            # List secrets with our API key label
            secrets = await v1.list_namespaced_secret(
                namespace=self.namespace,
                label_selector=f"{API_KEY_LABEL}=true"
            )
        
        api_keys = []
        for secret in secrets.items:
            try:
                # Parse metadata
                annotations = secret.metadata.annotations or {}
                
                name = annotations.get(API_KEY_NAME_ANNOTATION, "Unknown")
                created_at = self._parse_datetime(annotations.get(API_KEY_CREATED_AT_ANNOTATION))
                expires_at = self._parse_datetime(annotations.get(API_KEY_EXPIRES_AT_ANNOTATION))
                last_used_at = self._parse_datetime(annotations.get(API_KEY_LAST_USED_ANNOTATION))
                deleted_at = self._parse_datetime(annotations.get(API_KEY_DELETED_AT_ANNOTATION))
                
                # Get data from secret
                data = secret.data or {}
                public_key = base64.b64decode(data.get("public_key", "")).decode('utf-8') if data.get("public_key") else ""
                is_active = base64.b64decode(data.get("is_active", "")).decode('utf-8') == "true" if data.get("is_active") else True
                
                # Skip soft-deleted keys
                if deleted_at is not None or not is_active:
                    continue
                
                api_keys.append(APIKeyResponse(
                    id=str(secret.metadata.uid),
                    name=name,
                    public_key=public_key,
                    created_at=created_at or datetime.now(timezone.utc),
                    last_used_at=last_used_at,
                    expires_at=expires_at,
                    is_active=is_active
                ))
            except Exception as e:
                logger.error(f"Error parsing API key secret {secret.metadata.name}: {e}")
                continue
        
        return APIKeyListResponse(
            items=api_keys,
            count=len(api_keys)
        )
    
    async def get_api_key_by_public_key(self, public_key: str) -> Optional[Dict[str, Any]]:
        """Get API key data by public key for authentication.
        
        Args:
            public_key: The public key to look up
            
        Returns:
            Dictionary with API key data or None if not found
        """
        secret_name = self._secret_name_from_public_key(public_key)
        
        try:
            async with ApiClient() as api:
                v1 = client.CoreV1Api(api)
                secret = await v1.read_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace
                )
            
            # Check if it's an API key secret
            if secret.type != API_KEY_SECRET_TYPE:
                return None
            
            # Parse data
            data = secret.data or {}
            annotations = secret.metadata.annotations or {}
            
            stored_public_key = base64.b64decode(data.get("public_key", "")).decode('utf-8') if data.get("public_key") else ""
            secret_key_hash = base64.b64decode(data.get("secret_key_hash", "")).decode('utf-8') if data.get("secret_key_hash") else ""
            is_active = base64.b64decode(data.get("is_active", "")).decode('utf-8') == "true" if data.get("is_active") else True
            
            # Verify public key matches
            if stored_public_key != public_key:
                return None
            
            # Check if key is active (not soft-deleted)
            deleted_at = self._parse_datetime(annotations.get(API_KEY_DELETED_AT_ANNOTATION))
            if not is_active or deleted_at is not None:
                return None
            
            # Check expiration
            expires_at = self._parse_datetime(annotations.get(API_KEY_EXPIRES_AT_ANNOTATION))
            if expires_at and expires_at < datetime.now(timezone.utc):
                return None
            
            return {
                "id": str(secret.metadata.uid),
                "name": annotations.get(API_KEY_NAME_ANNOTATION, "Unknown"),
                "public_key": public_key,
                "secret_key_hash": secret_key_hash,
                "is_active": is_active,
                "expires_at": expires_at,
                "secret_name": secret_name
            }
            
        except client.rest.ApiException as e:
            if e.status == 404:
                return None
            logger.error(f"Error getting API key {public_key}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error getting API key {public_key}: {e}")
            return None
    
    async def verify_api_key(self, public_key: str, secret_key: str) -> Optional[Dict[str, Any]]:
        """Verify API key credentials.
        
        Args:
            public_key: The public key
            secret_key: The secret key
            
        Returns:
            API key data if valid, None otherwise
        """
        api_key_data = await self.get_api_key_by_public_key(public_key)
        if not api_key_data:
            return None
        
        # Verify secret key
        if not self._verify_secret_key(secret_key, api_key_data["secret_key_hash"]):
            return None
        
        # Update last used timestamp
        await self._update_last_used(api_key_data["secret_name"])
        
        return api_key_data
    
    async def _update_last_used(self, secret_name: str) -> None:
        """Update the last used timestamp for an API key.
        
        Args:
            secret_name: The Kubernetes secret name
        """
        try:
            now = datetime.now(timezone.utc)
            
            async with ApiClient() as api:
                v1 = client.CoreV1Api(api)
                
                # Get current secret
                secret = await v1.read_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace
                )
                
                # Update annotations
                if not secret.metadata.annotations:
                    secret.metadata.annotations = {}
                
                secret.metadata.annotations[API_KEY_LAST_USED_ANNOTATION] = self._format_datetime(now)
                
                # Patch the secret
                await v1.patch_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace,
                    body=secret
                )
                
        except Exception as e:
            logger.error(f"Error updating last used timestamp for {secret_name}: {e}")
    
    async def delete_api_key(self, public_key: str) -> bool:
        """Soft delete an API key by marking it as inactive.
        
        Args:
            public_key: The public key of the API key to delete
            
        Returns:
            True if deleted successfully, False otherwise
        """
        secret_name = self._secret_name_from_public_key(public_key)
        
        try:
            now = datetime.now(timezone.utc)
            
            async with ApiClient() as api:
                v1 = client.CoreV1Api(api)
                
                # Get current secret
                secret = await v1.read_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace
                )
                
                # Update to mark as deleted (soft delete)
                if not secret.metadata.annotations:
                    secret.metadata.annotations = {}
                
                secret.metadata.annotations[API_KEY_DELETED_AT_ANNOTATION] = self._format_datetime(now)
                
                # Update secret data to mark as inactive
                if not secret.string_data:
                    secret.string_data = {}
                secret.string_data["is_active"] = "false"
                
                # Patch the secret
                await v1.patch_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace,
                    body=secret
                )
            
            logger.info(f"Soft deleted API key {public_key}")
            return True
            
        except client.rest.ApiException as e:
            if e.status == 404:
                return False
            logger.error(f"Error deleting API key {public_key}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error deleting API key {public_key}: {e}")
            return False
