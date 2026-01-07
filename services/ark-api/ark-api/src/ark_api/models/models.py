"""Model CRD response models."""
from typing import List, Dict, Optional, Literal, Union, Any

from pydantic import BaseModel, Field

from .common import AvailabilityStatus
from .agents import AgentHeader


class ModelValueSource(BaseModel):
    """ValueSource for model configuration (supports direct value or valueFrom)."""
    value: Optional[str] = None
    value_from: Optional[Dict[str, Dict[str, str]]] = Field(None, alias="valueFrom")


class OpenAIConfig(BaseModel):
    """OpenAI model configuration."""
    api_key: Union[str, ModelValueSource] = Field(..., alias="apiKey")
    base_url: Union[str, ModelValueSource] = Field(..., alias="baseUrl")
    headers: Optional[List[AgentHeader]] = None


class AzureConfig(BaseModel):
    """Azure model configuration."""
    api_key: Union[str, ModelValueSource] = Field(..., alias="apiKey")
    base_url: Union[str, ModelValueSource] = Field(..., alias="baseUrl")
    api_version: Optional[Union[str, ModelValueSource]] = Field(None, alias="apiVersion")
    headers: Optional[List[AgentHeader]] = None


class BedrockConfig(BaseModel):
    """Bedrock model configuration."""
    region: Optional[Union[str, ModelValueSource]] = None
    access_key_id: Optional[Union[str, ModelValueSource]] = Field(None, alias="accessKeyId")
    secret_access_key: Optional[Union[str, ModelValueSource]] = Field(None, alias="secretAccessKey")
    session_token: Optional[Union[str, ModelValueSource]] = Field(None, alias="sessionToken")
    model_arn: Optional[Union[str, ModelValueSource]] = Field(None, alias="modelArn")
    max_tokens: Optional[int] = Field(None, alias="maxTokens", ge=1, le=100000)
    temperature: Optional[str] = Field(None, pattern=r"^(0(\.\d+)?|1(\.0+)?)$")


class ModelConfig(BaseModel):
    """Model configuration container."""
    openai: Optional[OpenAIConfig] = None
    azure: Optional[AzureConfig] = None
    bedrock: Optional[BedrockConfig] = None


class ModelResponse(BaseModel):
    """Model resource response model."""
    name: str
    namespace: str
    type: Literal["openai", "azure", "bedrock"]
    model: str
    available: Optional[AvailabilityStatus] = None
    annotations: Optional[Dict[str, str]] = None


class ModelListResponse(BaseModel):
    """List of models response model."""
    items: List[ModelResponse]
    count: int


class ModelCreateRequest(BaseModel):
    """Request model for creating a model."""
    name: str
    type: Literal["openai", "azure", "bedrock"]
    model: str
    config: ModelConfig


class ModelUpdateRequest(BaseModel):
    """Request model for updating a model."""
    model: Optional[str] = None
    config: Optional[ModelConfig] = None


class ModelDetailResponse(BaseModel):
    """Detailed model response model."""
    name: str
    namespace: str
    type: Literal["openai", "azure", "bedrock"]
    model: str
    config: Dict[str, Dict[str, Union[str, Dict[str, Any], List[Any]]]]
    available: Optional[AvailabilityStatus] = None
    resolved_address: Optional[str] = None
    annotations: Optional[Dict[str, str]] = None
