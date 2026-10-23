"""API key management service."""

import asyncio
import os
import secrets
import bcrypt
import base64
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any
from kubernetes_asyncio import client

from ark_sdk.k8s import get_context, create_api_client

from ..models.auth import (
    APIKeyCreateRequest,
    APIKeyResponse,
    APIKeyCreateResponse,
    APIKeyListResponse
)
from ..constants.annotations import ARK_PREFIX
from ..utils.helpers import parse_iso_timestamp

logger = logging.getLogger(__name__)

# Constants for API key storage
API_KEY_TYPE = ARK_PREFIX + "api-key"  # Used for both secret type and label key
API_KEY_ANNOTATION = ARK_PREFIX + "api-key-metadata"  # JSON annotation with all API key metadata

# API Key generation constants
# These values determine the length of the random token portion of API keys
# 32 bytes = 43 characters in base64url encoding (pk-ark- prefix adds 7 chars = 50 total)
# 48 bytes = 64 characters in base64url encoding (sk-ark- prefix adds 7 chars = 71 total)
# These lengths provide sufficient entropy for security while keeping keys manageable
PUBLIC_KEY_TOKEN_LENGTH = 32  # bytes for public key token generation
SECRET_KEY_TOKEN_LENGTH = 48  # bytes for secret key token generation

BCRYPT_MAX_INPUT_BYTES = 72

DEFAULT_API_KEY_RETENTION_SECONDS = 90 * 24 * 60 * 60
DEFAULT_API_KEY_REAPER_INTERVAL_SECONDS = 60 * 60


def _is_active(data: Dict[str, str]) -> bool:
    if not data.get("is_active"):
        return True
    return base64.b64decode(data["is_active"]).decode('utf-8') == "true"


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name, str(default))
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"{name} must be a whole number of seconds, got {value!r}") from None


def _parse_utc_timestamp(value: Any) -> Optional[datetime]:
    parsed = parse_iso_timestamp(value)
    if parsed is not None and parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


class APIKeyService:
    """Service for managing API keys stored as Kubernetes secrets."""
    
    def __init__(self):
        """Initialize API key service.
        
        API keys are always stored in the current context namespace for security.
        """
        self.namespace = get_context()["namespace"]
    
    def _generate_key_pair(self) -> Tuple[str, str]:
        """Generate a public/secret key pair.
        
        Returns:
            Tuple of (public_key, secret_key)
        """
        public_key = f"pk-ark-{secrets.token_urlsafe(PUBLIC_KEY_TOKEN_LENGTH)}"
        secret_key = f"sk-ark-{secrets.token_urlsafe(SECRET_KEY_TOKEN_LENGTH)}"
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
        secret_bytes = secret_key.encode('utf-8')
        if len(secret_bytes) > BCRYPT_MAX_INPUT_BYTES:
            return False

        try:
            hashed_bytes = base64.b64decode(hashed_secret.encode('utf-8'))
            return bcrypt.checkpw(secret_bytes, hashed_bytes)
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
    
    def _format_datetime(self, dt: Optional[datetime]) -> Optional[str]:
        """Format datetime for storage in annotations.
        
        Args:
            dt: Datetime to format
            
        Returns:
            ISO format string or None
        """
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    
    def _create_api_key_annotation(
        self,
        name: str,
        created_at: datetime,
        expires_at: Optional[datetime] = None,
        last_used_at: Optional[datetime] = None,
        deleted_at: Optional[datetime] = None,
        created_by: Optional[str] = None
    ) -> str:
        """Create JSON annotation for API key metadata.

        Args:
            name: API key name
            created_at: Creation timestamp
            expires_at: Optional expiration timestamp
            last_used_at: Optional last used timestamp
            deleted_at: Optional deletion timestamp
            created_by: Optional identity of the user who created the key

        Returns:
            JSON string with API key metadata
        """
        metadata = {
            "name": name,
            "createdAt": self._format_datetime(created_at)
        }

        if expires_at:
            metadata["expiresAt"] = self._format_datetime(expires_at)
        if last_used_at:
            metadata["lastUsedAt"] = self._format_datetime(last_used_at)
        if deleted_at:
            metadata["deletedAt"] = self._format_datetime(deleted_at)
        if created_by is not None:
            metadata["createdBy"] = created_by

        return json.dumps(metadata)
    
    def _parse_api_key_annotation(self, annotation_json: str) -> Dict[str, Any]:
        """Parse JSON annotation to extract API key metadata.
        
        Args:
            annotation_json: JSON string from annotation
            
        Returns:
            Dictionary with parsed metadata
        """
        try:
            metadata = json.loads(annotation_json)
            raw_expires_at = parse_iso_timestamp(metadata.get("expiresAt"))
            return {
                "name": metadata.get("name", "Unknown"),
                "created_at": _parse_utc_timestamp(metadata.get("createdAt")),
                "expires_at": _parse_utc_timestamp(metadata.get("expiresAt")),
                "last_used_at": _parse_utc_timestamp(metadata.get("lastUsedAt")),
                "deleted_at": _parse_utc_timestamp(metadata.get("deletedAt")),
                "created_by": metadata.get("createdBy"),
                "expires_at_without_timezone": raw_expires_at is not None and raw_expires_at.tzinfo is None
            }
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Error parsing API key annotation: {e}")
            return {
                "name": "Unknown",
                "created_at": None,
                "expires_at": None,
                "last_used_at": None,
                "deleted_at": None,
                "created_by": None,
                "expires_at_without_timezone": False
            }
    
    async def create_api_key(
        self, request: APIKeyCreateRequest, created_by: Optional[str] = None
    ) -> APIKeyCreateResponse:
        """Create a new API key.

        Args:
            request: API key creation request
            created_by: Optional identity of the user creating the key

        Returns:
            API key creation response with secret key
        """
        # Generate key pair
        public_key, secret_key = self._generate_key_pair()
        secret_key_hash = self._hash_secret_key(secret_key)

        # Prepare metadata
        now = datetime.now(timezone.utc)

        api_key_json = self._create_api_key_annotation(
            name=request.name,
            created_at=now,
            expires_at=request.expires_at,
            created_by=created_by
        )
        
        annotations = {
            API_KEY_ANNOTATION: api_key_json
        }
        
        labels = {
            API_KEY_TYPE: "true",
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
            type=API_KEY_TYPE,
            string_data={
                "public_key": public_key,
                "secret_key_hash": secret_key_hash,
                "is_active": "true"
            }
        )
        
        async with create_api_client() as api:
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
    
    async def list_api_keys(self, created_by: Optional[str] = None) -> APIKeyListResponse:
        """List all active API keys (without secret keys).

        Args:
            created_by: When given, only keys created by this identity are returned

        Returns:
            List of API key responses
        """
        async with create_api_client() as api:
            v1 = client.CoreV1Api(api)
            
            # List secrets with our API key label
            secrets = await v1.list_namespaced_secret(
                namespace=self.namespace,
                label_selector=f"{API_KEY_TYPE}=true"
            )
        
        api_keys = []
        for secret in secrets.items:
            try:
                # Parse JSON annotation
                annotations = secret.metadata.annotations or {}
                api_key_json = annotations.get(API_KEY_ANNOTATION, "{}")
                metadata = self._parse_api_key_annotation(api_key_json)
                
                name = metadata["name"]
                created_at = metadata["created_at"]
                expires_at = metadata["expires_at"]
                last_used_at = metadata["last_used_at"]
                deleted_at = metadata["deleted_at"]
                
                # Get data from secret
                data = secret.data or {}
                public_key = base64.b64decode(data.get("public_key", "")).decode('utf-8') if data.get("public_key") else ""
                is_active = _is_active(data)
                
                # Skip soft-deleted keys
                if deleted_at is not None or not is_active:
                    continue

                # Skip keys owned by someone else when scoping is requested
                if created_by is not None and metadata.get("created_by") != created_by:
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
    
    async def get_api_key_by_public_key(
        self, public_key: str, created_by: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Get API key data by public key for authentication.

        Args:
            public_key: The public key to look up
            created_by: When given, the key must have been created by this identity

        Returns:
            Dictionary with API key data or None if not found
        """
        secret_name = self._secret_name_from_public_key(public_key)
        
        try:
            async with create_api_client() as api:
                v1 = client.CoreV1Api(api)
                secret = await v1.read_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace
                )
            
            # Check if it's an API key secret
            if secret.type != API_KEY_TYPE:
                return None
            
            # Parse data
            data = secret.data or {}
            annotations = secret.metadata.annotations or {}
            
            stored_public_key = base64.b64decode(data.get("public_key", "")).decode('utf-8') if data.get("public_key") else ""
            secret_key_hash = base64.b64decode(data.get("secret_key_hash", "")).decode('utf-8') if data.get("secret_key_hash") else ""
            is_active = _is_active(data)
            
            # Parse JSON annotation
            api_key_json = annotations.get(API_KEY_ANNOTATION, "{}")
            metadata = self._parse_api_key_annotation(api_key_json)
            
            # Verify public key matches
            if stored_public_key != public_key:
                return None
            
            # Check if key is active (not soft-deleted)
            deleted_at = metadata["deleted_at"]
            if not is_active or deleted_at is not None:
                return None

            # Check expiration
            expires_at = metadata["expires_at"]
            if expires_at and expires_at < datetime.now(timezone.utc):
                return None

            if metadata["expires_at_without_timezone"]:
                logger.warning(f"Rejecting API key {public_key}: its expiry was stored without a timezone")
                return None

            if created_by is not None and metadata.get("created_by") != created_by:
                return None

            return {
                "id": str(secret.metadata.uid),
                "name": metadata["name"],
                "public_key": public_key,
                "secret_key_hash": secret_key_hash,
                "is_active": is_active,
                "expires_at": expires_at,
                "secret_name": secret_name,
                "created_by": metadata.get("created_by")
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
            
            async with create_api_client() as api:
                v1 = client.CoreV1Api(api)
                
                # Get current secret
                secret = await v1.read_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace
                )
                
                # Parse existing JSON annotation
                annotations = secret.metadata.annotations or {}
                api_key_json = annotations.get(API_KEY_ANNOTATION, "{}")
                metadata = self._parse_api_key_annotation(api_key_json)
                
                # Update last used timestamp
                updated_json = self._create_api_key_annotation(
                    name=metadata["name"],
                    created_at=metadata["created_at"] or now,
                    expires_at=metadata["expires_at"],
                    last_used_at=now,
                    deleted_at=metadata["deleted_at"],
                    created_by=metadata.get("created_by")
                )
                
                # Update annotations
                if not secret.metadata.annotations:
                    secret.metadata.annotations = {}
                
                secret.metadata.annotations[API_KEY_ANNOTATION] = updated_json
                
                # Patch the secret
                await v1.patch_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace,
                    body=secret
                )
                
        except Exception as e:
            logger.error(f"Error updating last used timestamp for {secret_name}: {e}")
    
    async def delete_api_key(
        self, public_key: str, created_by: Optional[str] = None
    ) -> bool:
        """Soft delete an API key by marking it as inactive.

        Args:
            public_key: The public key of the API key to delete
            created_by: When given, the key must have been created by this identity

        Returns:
            True if deleted successfully, False otherwise
        """
        secret_name = self._secret_name_from_public_key(public_key)
        
        try:
            now = datetime.now(timezone.utc)
            
            async with create_api_client() as api:
                v1 = client.CoreV1Api(api)
                
                # Get current secret
                secret = await v1.read_namespaced_secret(
                    name=secret_name,
                    namespace=self.namespace
                )
                
                # Parse existing JSON annotation
                annotations = secret.metadata.annotations or {}
                api_key_json = annotations.get(API_KEY_ANNOTATION, "{}")
                metadata = self._parse_api_key_annotation(api_key_json)

                if created_by is not None and metadata.get("created_by") != created_by:
                    return False

                # Update deleted timestamp
                updated_json = self._create_api_key_annotation(
                    name=metadata["name"],
                    created_at=metadata["created_at"] or now,
                    expires_at=metadata["expires_at"],
                    last_used_at=metadata["last_used_at"],
                    deleted_at=metadata["deleted_at"] or now,
                    created_by=metadata.get("created_by")
                )
                
                # Update to mark as deleted (soft delete)
                if not secret.metadata.annotations:
                    secret.metadata.annotations = {}
                
                secret.metadata.annotations[API_KEY_ANNOTATION] = updated_json
                
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

    async def purge_inactive_api_keys(self, retention_seconds: int) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=retention_seconds)
        purged = 0
        failed: list[str] = []
        first_error: Optional[Exception] = None

        async with create_api_client() as api:
            v1 = client.CoreV1Api(api)
            api_key_secrets = await v1.list_namespaced_secret(
                namespace=self.namespace,
                label_selector=f"{API_KEY_TYPE}=true",
                field_selector=f"type={API_KEY_TYPE}"
            )

            for secret in api_key_secrets.items:
                try:
                    if await self._purge_if_past_retention(v1, secret, cutoff):
                        purged += 1
                except Exception as e:
                    failed.append(secret.metadata.name)
                    first_error = first_error or e

        if purged:
            logger.info(f"Purged {purged} revoked or expired API keys that ended more than {retention_seconds}s ago")
        if failed:
            raise RuntimeError(f"Failed to purge API key Secrets: {', '.join(failed)}") from first_error
        return purged

    async def _purge_if_past_retention(self, v1: client.CoreV1Api, secret: Any, cutoff: datetime) -> bool:
        annotations = secret.metadata.annotations or {}
        metadata = self._parse_api_key_annotation(annotations.get(API_KEY_ANNOTATION, "{}"))
        expired_at = metadata["expires_at"]
        if expired_at is not None and metadata["created_at"] is not None:
            expired_at = max(expired_at, metadata["created_at"])
        ended = [t for t in (metadata["deleted_at"], expired_at) if t is not None]
        if not ended:
            if not _is_active(secret.data or {}):
                logger.warning(
                    f"API key Secret {secret.metadata.name} is inactive but has no revocation time; not purging"
                )
            return False
        if min(ended) > cutoff:
            return False

        try:
            await v1.delete_namespaced_secret(
                name=secret.metadata.name,
                namespace=self.namespace,
                body=client.V1DeleteOptions(
                    preconditions=client.V1Preconditions(
                        uid=secret.metadata.uid,
                        resource_version=secret.metadata.resource_version
                    )
                )
            )
        except client.rest.ApiException as e:
            if e.status in (404, 409):
                return False
            raise
        return True


async def run_api_key_reaper(retention_seconds: int, interval_seconds: int) -> None:
    while True:
        try:
            await APIKeyService().purge_inactive_api_keys(retention_seconds)
        except Exception:
            logger.exception("API key reaper run failed; retrying next interval")
        await asyncio.sleep(interval_seconds)


def start_api_key_reaper() -> Optional[asyncio.Task]:
    if os.getenv("READ_ONLY_MODE", "false").lower() == "true":
        logger.info("API key reaper disabled in read-only mode")
        return None

    retention_seconds = _int_env("API_KEY_RETENTION_SECONDS", DEFAULT_API_KEY_RETENTION_SECONDS)
    if retention_seconds < 0:
        raise ValueError("API_KEY_RETENTION_SECONDS must be 0 or greater")
    if retention_seconds == 0:
        logger.info("API key retention disabled; revoked and expired API keys are kept indefinitely")
        return None

    interval_seconds = _int_env("API_KEY_REAPER_INTERVAL_SECONDS", DEFAULT_API_KEY_REAPER_INTERVAL_SECONDS)
    if interval_seconds <= 0:
        raise ValueError("API_KEY_REAPER_INTERVAL_SECONDS must be greater than 0")

    logger.info(f"API key reaper started: retention {retention_seconds}s, interval {interval_seconds}s")
    return asyncio.create_task(run_api_key_reaper(retention_seconds, interval_seconds))
