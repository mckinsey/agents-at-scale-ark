# services/evaluator-metric/src/evaluator_metric/query_resolver.py

import logging
from typing import Optional, Dict, Any
from kubernetes import client, config
from ark_sdk.models import QueryV1alpha1
from ..types import QueryRef

logger = logging.getLogger(__name__)

class QueryResolver:
    """Resolves Query configurations using ARK SDK and Kubernetes API"""
    
    def __init__(self):
        """Initialize Kubernetes client"""
        try:
            config.load_incluster_config()
            logger.info("Loaded in-cluster Kubernetes configuration")
        except config.ConfigException:
            try:
                config.load_kube_config()
                logger.info("Loaded kubeconfig configuration")
            except config.ConfigException as e:
                logger.error(f"Could not load Kubernetes configuration: {e}")
                raise
        
        self.k8s_client = client.ApiClient()
    
    async def resolve_query(self, query_ref: QueryRef):
        """
        Resolve query configuration from Query CRD
        """
        try:
            logger.info(f"Resolving query {query_ref.name} in namespace {query_ref.namespace}")
            
            # Load Query CRD from Kubernetes
            query_crd = self._load_query_crd(query_ref.name, query_ref.namespace)
            logger.info(f"Loaded query CRD as type: {type(query_crd)}")
            
            # For now, bypass the ARK SDK conversion and work directly with the dict
            # to avoid conversion issues with nested objects
            logger.info(f"Returning query as dict to avoid conversion issues")
            logger.info(f"Successfully resolved query {query_ref.name}")
            return query_crd
            
        except Exception as e:
            logger.error(f"Failed to resolve query {query_ref.name}: {e}")
            raise
    
    def _load_query_crd(self, name: str, namespace: str) -> Dict[str, Any]:
        """Load Query CRD from Kubernetes"""
        custom_api = client.CustomObjectsApi(self.k8s_client)
        
        try:
            query_crd = custom_api.get_namespaced_custom_object(
                group="ark.mckinsey.com",
                version="v1alpha1",
                namespace=namespace,
                plural="queries",
                name=name
            )
            return query_crd
        except client.rest.ApiException as e:
            if e.status == 404:
                raise ValueError(f"Query '{name}' not found in namespace '{namespace}'")
            elif e.status == 403:
                raise ValueError(f"Access denied to query '{name}' in namespace '{namespace}'. Check RBAC permissions.")
            else:
                raise ValueError(f"Error loading query '{name}': {e}")
    
    def extract_metrics_from_query(self, query) -> Dict[str, Any]:
        """Extract performance metrics from Query status"""
        try:
            metrics = {}
            
            # Handle both dict and QueryV1alpha1 object formats
            if isinstance(query, dict):
                status = query.get('status')
                query_name = query.get('metadata', {}).get('name', 'unknown')
                logger.info(f"Processing dict query, name: {query_name}")
                logger.info(f"Query dict keys: {list(query.keys())}")
                if status:
                    logger.info(f"Status dict keys: {list(status.keys())}")
                    logger.info(f"Status content: {status}")
                else:
                    logger.warning(f"No status found in query dict")
            else:
                status = getattr(query, 'status', None) if hasattr(query, 'status') else None
                # Debug: Check what type metadata is
                if hasattr(query, 'metadata'):
                    logger.info(f"query.metadata type: {type(query.metadata)}")
                    if isinstance(query.metadata, dict):
                        query_name = query.metadata.get('name', 'unknown')
                        logger.info(f"Processing QueryV1alpha1 with dict metadata, name: {query_name}")
                    else:
                        query_name = query.metadata.name
                        logger.info(f"Processing QueryV1alpha1 with object metadata, name: {query_name}")
                else:
                    query_name = 'unknown'
                    logger.info(f"Processing QueryV1alpha1 with no metadata")
            
            if not status:
                logger.warning(f"Query {query_name} has no status - may not be completed yet")
                return self._extract_basic_metadata(query, metrics)
            
            # Extract token usage metrics
            self._extract_token_metrics(status, metrics)
            
            # Extract timing metrics from status
            self._extract_timing_metrics(status, metrics)
            
            # Extract response metrics
            self._extract_response_metrics(status, metrics)
            
            # Extract query phase and status
            self._extract_status_metrics(status, metrics)
            
            # Extract metadata for additional context
            self._extract_basic_metadata(query, metrics)

            # Extract model name from agent targets
            self._extract_model_name(query, metrics)

            logger.info(f"Extracted {len(metrics)} metrics from query {query_name}")
            return metrics
            
        except Exception as e:
            logger.error(f"Failed to extract metrics from query: {e}")
            return {}
    
    def _extract_token_metrics(self, status, metrics: Dict[str, Any]) -> None:
        """Extract token usage metrics"""
        logger.info(f"_extract_token_metrics: status type = {type(status)}")
        
        # Handle both camelCase (tokenUsage) and snake_case (token_usage) field names
        token_usage = None
        if isinstance(status, dict):
            # For dict format, check for both camelCase and snake_case keys
            if 'tokenUsage' in status:
                token_usage = status['tokenUsage']
                logger.info(f"Found tokenUsage field in dict, type: {type(token_usage)}")
            elif 'token_usage' in status:
                token_usage = status['token_usage']
                logger.info(f"Found token_usage field in dict, type: {type(token_usage)}")
        else:
            # For object format
            if hasattr(status, 'token_usage') and status.token_usage:
                token_usage = status.token_usage
                logger.info(f"Found token_usage field, type: {type(token_usage)}")
            elif hasattr(status, 'tokenUsage') and status.tokenUsage:
                token_usage = status.tokenUsage
                logger.info(f"Found tokenUsage field, type: {type(token_usage)}")
        
        if token_usage:
            logger.info(f"Processing token_usage: {token_usage}")
            
            # Handle both dict and object formats
            if isinstance(token_usage, dict):
                metrics.update({
                    "totalTokens": token_usage.get('totalTokens', 0),
                    "promptTokens": token_usage.get('promptTokens', 0),
                    "completionTokens": token_usage.get('completionTokens', 0),
                })
            else:
                metrics.update({
                    "totalTokens": getattr(token_usage, 'total_tokens', 0),
                    "promptTokens": getattr(token_usage, 'prompt_tokens', 0),
                    "completionTokens": getattr(token_usage, 'completion_tokens', 0),
                })
            
            # Calculate token efficiency (completion tokens / prompt tokens)
            prompt_tokens = metrics.get("promptTokens", 0)
            completion_tokens = metrics.get("completionTokens", 0)
            if prompt_tokens > 0:
                metrics["tokenEfficiency"] = completion_tokens / prompt_tokens
            else:
                metrics["tokenEfficiency"] = 0
                
            # Calculate tokens per character if responses are available
            total_response_length = metrics.get("totalResponseLength", 0)
            if total_response_length > 0 and completion_tokens > 0:
                metrics["tokensPerCharacter"] = completion_tokens / total_response_length
    
    def _extract_timing_metrics(self, status, metrics: Dict[str, Any]) -> None:
        """Extract timing and performance metrics"""
        import time
        from datetime import datetime
        
        duration_seconds = None
        
        # First, try to extract duration directly from status.duration field
        duration_field = None
        if isinstance(status, dict):
            duration_field = status.get('duration')
        else:
            duration_field = getattr(status, 'duration', None)
            
        if duration_field:
            logger.info(f"Found duration field: {duration_field} (type: {type(duration_field)})")
            try:
                # Parse metav1.Duration format (e.g., "1.581370292s", "2m30s")
                if isinstance(duration_field, str):
                    duration_seconds = self._parse_duration_string(duration_field)
                elif hasattr(duration_field, 'seconds'):
                    # If it's a duration object with seconds attribute
                    duration_seconds = float(duration_field.seconds)
                    if hasattr(duration_field, 'microseconds'):
                        duration_seconds += duration_field.microseconds / 1_000_000
                elif isinstance(duration_field, (int, float)):
                    duration_seconds = float(duration_field)
                    
                logger.info(f"Extracted duration from status.duration field: {duration_seconds}s")
                
            except Exception as e:
                logger.warning(f"Failed to parse duration field: {e}")
        
        # Fallback: Try to extract timestamps from status (for backward compatibility)
        if duration_seconds is None:
            started_at = getattr(status, 'started_at', None) or getattr(status, 'startedAt', None)
            completed_at = getattr(status, 'completed_at', None) or getattr(status, 'completedAt', None)
            
            if started_at and completed_at:
                try:
                    # Parse timestamps and calculate duration
                    if isinstance(started_at, str):
                        started_time = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
                    else:
                        started_time = started_at
                        
                    if isinstance(completed_at, str):
                        completed_time = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))
                    else:
                        completed_time = completed_at
                    
                    duration_seconds = (completed_time - started_time).total_seconds()
                    logger.info(f"Extracted duration from timestamps: {duration_seconds}s")
                        
                except Exception as e:
                    logger.warning(f"Failed to parse timestamps: {e}")
        
        # Set duration metrics if we successfully extracted duration
        if duration_seconds is not None and duration_seconds > 0:
            metrics["executionDuration"] = f"{duration_seconds:.2f}s"
            metrics["executionDurationSeconds"] = duration_seconds
            
            # Calculate tokens per second if available
            total_tokens = metrics.get("totalTokens", 0)
            if total_tokens > 0:
                metrics["tokensPerSecond"] = total_tokens / duration_seconds
        else:
            logger.warning("No duration information available in query status")
        
        # Add evaluation timestamp
        metrics["evaluationTimestamp"] = time.time()
    
    def _extract_response_metrics(self, status, metrics: Dict[str, Any]) -> None:
        """Extract response quality and size metrics"""
        logger.info(f"_extract_response_metrics: status type = {type(status)}")

        response = None
        if isinstance(status, dict):
            response = status.get('response')
            if response:
                logger.info(f"Found response field in dict, type: {type(response)}")
        else:
            if hasattr(status, 'response') and status.response:
                response = status.response
                logger.info(f"Found response field, type: {type(response)}")

        if response:
            content_length = 0

            # Handle both dict and object formats
            if isinstance(response, dict):
                content = response.get('content', '')
                if content:
                    content_length = len(content)
            else:
                if hasattr(response, 'content') and response.content:
                    content_length = len(response.content)

            metrics.update({
                "responseCount": 1,
                "totalResponseLength": content_length,
                "averageResponseLength": content_length,
                "maxResponseLength": content_length,
                "minResponseLength": content_length
            })

            # Response completeness heuristic
            if content_length > 0:
                # Simple heuristic: responses over 50 chars are more likely complete
                completeness_score = min(1.0, content_length / 50)
                metrics["responseCompleteness"] = completeness_score
    
    def _extract_status_metrics(self, status, metrics: Dict[str, Any]) -> None:
        """Extract status and error metrics"""
        if hasattr(status, 'phase'):
            metrics["queryPhase"] = status.phase
            metrics["isCompleted"] = status.phase in ["done", "completed", "success"]
            metrics["hasErrors"] = status.phase in ["error", "failed"]
        
        # Count evaluations if available
        if hasattr(status, 'evaluations') and status.evaluations:
            metrics["evaluationCount"] = len(status.evaluations)
        
        # Extract error information if available
        if hasattr(status, 'error') and status.error:
            metrics["hasErrors"] = True
            metrics["errorMessage"] = str(status.error)
    
    def _extract_basic_metadata(self, query, metrics: Dict[str, Any]) -> Dict[str, Any]:
        """Extract basic metadata regardless of status"""
        # Handle both dict and QueryV1alpha1 object formats
        if isinstance(query, dict):
            metadata = query.get('metadata')
            if metadata:
                metrics["queryName"] = metadata.get('name', 'unknown')
                metrics["queryNamespace"] = metadata.get('namespace', 'default')
                
                labels = metadata.get('labels')
                if labels:
                    metrics["labels"] = dict(labels)
                    
                    # Extract model information from labels if available
                    if "model" in metrics["labels"]:
                        metrics["modelName"] = metrics["labels"]["model"]
                
                # Extract creation timestamp for age calculation
                creation_timestamp = metadata.get('creationTimestamp')
                if creation_timestamp:
                    import time
                    from datetime import datetime
                    
                    try:
                        if isinstance(creation_timestamp, str):
                            created_time = datetime.fromisoformat(creation_timestamp.replace('Z', '+00:00'))
                        else:
                            created_time = creation_timestamp
                        
                        current_time = datetime.now(created_time.tzinfo)
                        age_seconds = (current_time - created_time).total_seconds()
                        metrics["queryAgeSeconds"] = age_seconds
                    except Exception as e:
                        logger.warning(f"Failed to calculate query age: {e}")
        else:
            # QueryV1alpha1 object format
            if hasattr(query, 'metadata') and query.metadata:
                # Handle case where metadata might be a dict in QueryV1alpha1
                if isinstance(query.metadata, dict):
                    metadata = query.metadata
                    metrics["queryName"] = metadata.get('name', 'unknown')
                    metrics["queryNamespace"] = metadata.get('namespace', 'default')
                    
                    labels = metadata.get('labels')
                    if labels:
                        metrics["labels"] = dict(labels)
                        if "model" in metrics["labels"]:
                            metrics["modelName"] = metrics["labels"]["model"]
                    
                    # Extract creation timestamp for age calculation
                    creation_timestamp = metadata.get('creationTimestamp')
                    if creation_timestamp:
                        import time
                        from datetime import datetime
                        
                        try:
                            if isinstance(creation_timestamp, str):
                                created_time = datetime.fromisoformat(creation_timestamp.replace('Z', '+00:00'))
                            else:
                                created_time = creation_timestamp
                            
                            current_time = datetime.now(created_time.tzinfo)
                            age_seconds = (current_time - created_time).total_seconds()
                            metrics["queryAgeSeconds"] = age_seconds
                        except Exception as e:
                            logger.warning(f"Failed to calculate query age: {e}")
                else:
                    # Traditional object access
                    metrics["queryName"] = query.metadata.name
                    metrics["queryNamespace"] = query.metadata.namespace
                    
                    if hasattr(query.metadata, 'labels') and query.metadata.labels:
                        metrics["labels"] = dict(query.metadata.labels)
                        
                        # Extract model information from labels if available
                        if "model" in metrics["labels"]:
                            metrics["modelName"] = metrics["labels"]["model"]
                    
                    # Extract creation timestamp for age calculation
                    if hasattr(query.metadata, 'creation_timestamp'):
                        import time
                        from datetime import datetime
                        
                        try:
                            created_time = query.metadata.creation_timestamp
                            if isinstance(created_time, str):
                                created_time = datetime.fromisoformat(created_time.replace('Z', '+00:00'))
                            
                            current_time = datetime.now(created_time.tzinfo)
                            age_seconds = (current_time - created_time).total_seconds()
                            metrics["queryAgeSeconds"] = age_seconds
                        except Exception as e:
                            logger.warning(f"Failed to calculate query age: {e}")
        
        return metrics
    
    def _parse_duration_string(self, duration_str: str) -> float:
        """Parse duration string to seconds (supports formats like '1.5s', '2m30s', '1h5m30s')"""
        import re
        
        duration_str = duration_str.strip().lower()
        total_seconds = 0.0
        
        # Handle simple decimal seconds format (e.g., "1.581370292s")
        simple_seconds_match = re.match(r'^(\d+\.?\d*)s?$', duration_str)
        if simple_seconds_match:
            return float(simple_seconds_match.group(1))
        
        # Handle complex duration format (e.g., "1h5m30s", "2m30s")
        # Extract hours, minutes, and seconds
        hours_match = re.search(r'(\d+\.?\d*)h', duration_str)
        minutes_match = re.search(r'(\d+\.?\d*)m', duration_str)
        seconds_match = re.search(r'(\d+\.?\d*)s', duration_str)
        
        if hours_match:
            total_seconds += float(hours_match.group(1)) * 3600
        if minutes_match:
            total_seconds += float(minutes_match.group(1)) * 60
        if seconds_match:
            total_seconds += float(seconds_match.group(1))

        if total_seconds == 0:
            # If no match, try to parse as plain number (assume seconds)
            try:
                total_seconds = float(duration_str)
            except ValueError:
                raise ValueError(f"Unable to parse duration string: {duration_str}")

        return total_seconds

    def _extract_model_name(self, query, metrics: Dict[str, Any]) -> None:
        """Extract model name from query's agent targets"""
        try:
            # Handle both dict and QueryV1alpha1 object formats
            targets = None
            query_name = metrics.get("queryName", "unknown")

            if isinstance(query, dict):
                spec = query.get('spec', {})
                targets = spec.get('targets', [])
            else:
                if hasattr(query, 'spec') and query.spec and hasattr(query.spec, 'targets'):
                    targets = query.spec.targets

            if not targets:
                logger.warning(f"Query {query_name} has no targets")
                return

            # Look for agent targets and get model name from first agent
            for target in targets:
                if isinstance(target, dict):
                    target_type = target.get('type')
                    target_name = target.get('name')
                else:
                    target_type = getattr(target, 'type', None)
                    target_name = getattr(target, 'name', None)

                if target_type == 'agent' and target_name:
                    try:
                        # Look up the agent resource to get model reference
                        namespace = metrics.get("queryNamespace", "default")
                        agent_model = self._get_agent_model_name(target_name, namespace)
                        if agent_model:
                            metrics["modelName"] = agent_model
                            logger.info(f"DEBUG: Extracted model name '{agent_model}' from agent '{target_name}'")
                            return
                    except Exception as e:
                        logger.warning(f"Failed to get model name from agent '{target_name}': {e}")

            logger.warning(f"Could not extract model name from query {query_name}")

        except Exception as e:
            logger.error(f"Failed to extract model name: {e}")

    def _get_agent_model_name(self, agent_name: str, namespace: str) -> Optional[str]:
        """Get model name from agent's modelRef"""
        try:
            # Use Custom Objects API to get agent
            custom_api = client.CustomObjectsApi()
            agent = custom_api.get_namespaced_custom_object(
                group="ark.mckinsey.com",
                version="v1alpha1",
                namespace=namespace,
                plural="agents",
                name=agent_name
            )

            # Extract model reference
            spec = agent.get('spec', {})
            model_ref = spec.get('modelRef', {})
            model_name = model_ref.get('name')

            if model_name:
                logger.info(f"Found model reference '{model_name}' in agent '{agent_name}'")
                return model_name
            else:
                logger.warning(f"Agent '{agent_name}' has no modelRef.name")
                return None

        except Exception as e:
            logger.error(f"Failed to lookup agent '{agent_name}' in namespace '{namespace}': {e}")
            return None