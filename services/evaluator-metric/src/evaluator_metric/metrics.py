"""
Metrics calculation logic
"""
import logging
from typing import Dict, Any, List, Tuple

logger = logging.getLogger(__name__)


class MetricsCalculator:
    def __init__(self, parameters: Dict[str, Any]):
        self.parameters = parameters
        
        # Default model pricing (USD per 1K tokens)
        self.model_pricing = {
            "gpt-4": {"input": 0.03, "output": 0.06},
            "gpt-4-turbo": {"input": 0.01, "output": 0.03},
            "gpt-3.5-turbo": {"input": 0.0015, "output": 0.002},
            "claude-3-sonnet": {"input": 0.003, "output": 0.015},
            "claude-3-haiku": {"input": 0.00025, "output": 0.00125}
        }
    
    async def calculate_overall_score(self, metrics: Dict[str, Any]) -> float:
        """Calculate weighted overall score"""
        try:
            logger.info(f"Calculating overall score from metrics: {metrics}")
            
            # Calculate individual metric scores
            token_score = self._calculate_token_score(metrics)
            cost_score = self._calculate_cost_score(metrics)
            performance_score = self._calculate_performance_score(metrics)
            quality_score = self._calculate_quality_score(metrics)
            
            # Weight the scores based on parameters or defaults
            weights = self._get_score_weights()
            
            overall_score = (
                token_score * weights["token"] +
                cost_score * weights["cost"] +
                performance_score * weights["performance"] +
                quality_score * weights["quality"]
            )
            
            # Update metrics with individual scores and violations
            self._update_metrics_with_scores(metrics, {
                "tokenScore": token_score,
                "costScore": cost_score,
                "performanceScore": performance_score,
                "qualityScore": quality_score
            })
            
            logger.info(f"Calculated overall score: {overall_score:.2f}")
            return overall_score
            
        except Exception as e:
            logger.error(f"Failed to calculate overall score: {e}")
            return 0.0
    
    def _calculate_token_score(self, metrics: Dict[str, Any]) -> float:
        """Calculate token usage score (0.0-1.0)"""
        try:
            total_tokens = metrics.get("totalTokens", 0)
            max_tokens = self._get_threshold("maxTokens", 5000)
            
            if total_tokens == 0:
                return 1.0  # Perfect score if no tokens used
                
            if total_tokens > max_tokens:
                # Add to violations
                metrics.setdefault("threshold_violations", []).append("maxTokens")
                # Return low score but not zero
                return max(0.1, 1.0 - (total_tokens - max_tokens) / max_tokens)
            
            # Score based on how close to limit
            score = 1.0 - (total_tokens / max_tokens)
            metrics.setdefault("passed_thresholds", []).append("maxTokens")
            
            # Bonus for token efficiency
            token_efficiency = metrics.get("tokenEfficiency", 0)
            efficiency_threshold = self._get_threshold("tokenEfficiencyThreshold", 0.3)
            
            if token_efficiency >= efficiency_threshold:
                score = min(1.0, score + 0.1)  # Bonus for efficiency
                metrics.setdefault("passed_thresholds", []).append("tokenEfficiency")
            
            return max(0.0, min(1.0, score))
            
        except Exception as e:
            logger.warning(f"Failed to calculate token score: {e}")
            return 0.5
    
    def _calculate_cost_score(self, metrics: Dict[str, Any]) -> float:
        """Calculate cost efficiency score"""
        try:
            # Calculate actual cost if not already calculated
            if "totalCost" not in metrics:
                self._calculate_query_cost(metrics)
            
            total_cost = metrics.get("totalCost", 0)
            max_cost = self._get_threshold("maxCostPerQuery", 0.10)
            
            if total_cost == 0:
                return 1.0  # Perfect score if no cost
                
            if total_cost > max_cost:
                metrics.setdefault("threshold_violations", []).append("maxCostPerQuery")
                # Penalty for exceeding cost but not zero
                return max(0.1, 1.0 - (total_cost - max_cost) / max_cost)
            
            # Score based on cost efficiency
            score = 1.0 - (total_cost / max_cost)
            metrics.setdefault("passed_thresholds", []).append("maxCostPerQuery")
            
            # Check cost efficiency threshold
            cost_efficiency = metrics.get("costEfficiency", 0)
            efficiency_threshold = self._get_threshold("costEfficiencyThreshold", 0.8)
            
            if cost_efficiency >= efficiency_threshold:
                score = min(1.0, score + 0.1)  # Bonus for efficiency
                metrics.setdefault("passed_thresholds", []).append("costEfficiency")
            
            return max(0.0, min(1.0, score))
            
        except Exception as e:
            logger.warning(f"Failed to calculate cost score: {e}")
            return 0.5
    
    def _calculate_performance_score(self, metrics: Dict[str, Any]) -> float:
        """Calculate execution performance score"""
        try:
            score = 1.0
            
            # Check execution duration
            duration_seconds = metrics.get("executionDurationSeconds", 0)
            max_duration = self._parse_duration(self._get_threshold("maxDuration", "30s"))
            
            if duration_seconds > 0:
                if duration_seconds > max_duration:
                    metrics.setdefault("threshold_violations", []).append("maxDuration")
                    score *= max(0.1, 1.0 - ((duration_seconds - max_duration) / max_duration))
                else:
                    metrics.setdefault("passed_thresholds", []).append("maxDuration")
                    # Bonus for fast execution
                    if duration_seconds < max_duration * 0.5:
                        score = min(1.0, score + 0.1)
            
            # Check tokens per second (throughput)
            tokens_per_second = metrics.get("tokensPerSecond", 0)
            min_throughput = self._get_threshold("minTokensPerSecond", 10.0)
            
            if tokens_per_second > 0:
                if tokens_per_second < min_throughput:
                    score *= 0.8  # Penalty for low throughput
                else:
                    score = min(1.0, score + 0.1)  # Bonus for good throughput
            
            return max(0.0, min(1.0, score))
            
        except Exception as e:
            logger.warning(f"Failed to calculate performance score: {e}")
            return 0.5
    
    def _calculate_quality_score(self, metrics: Dict[str, Any]) -> float:
        """Calculate response quality score"""
        try:
            score = 1.0
            
            # Check response length
            total_response_length = metrics.get("totalResponseLength", 0)
            min_length = self._get_threshold("minResponseLength", 50)
            max_length = self._get_threshold("maxResponseLength", 2000)
            
            if total_response_length > 0:
                if total_response_length < min_length:
                    metrics.setdefault("threshold_violations", []).append("minResponseLength")
                    score *= 0.5  # Significant penalty for too short
                elif total_response_length > max_length:
                    metrics.setdefault("threshold_violations", []).append("maxResponseLength")
                    score *= 0.8  # Minor penalty for too long
                else:
                    metrics.setdefault("passed_thresholds", []).append("responseLength")
            
            # Check response completeness
            completeness = metrics.get("responseCompleteness", 0)
            completeness_threshold = self._get_threshold("responseCompletenessThreshold", 0.8)
            
            if completeness >= completeness_threshold:
                score = min(1.0, score + 0.1)  # Bonus for completeness
                metrics.setdefault("passed_thresholds", []).append("responseCompleteness")
            
            # Penalty for errors
            if metrics.get("hasErrors", False):
                metrics.setdefault("threshold_violations", []).append("errorRate")
                score *= 0.3  # Significant penalty for errors
            else:
                metrics.setdefault("passed_thresholds", []).append("errorRate")
            
            return max(0.0, min(1.0, score))
            
        except Exception as e:
            logger.warning(f"Failed to calculate quality score: {e}")
            return 0.5
    
    def _calculate_query_cost(self, metrics: Dict[str, Any]) -> None:
        """Calculate query cost based on token usage and model pricing"""
        try:
            total_tokens = metrics.get("totalTokens", 0)
            prompt_tokens = metrics.get("promptTokens", 0)
            completion_tokens = metrics.get("completionTokens", 0)
            model_name = metrics.get("modelName", "gpt-4")  # Default fallback
            
            if total_tokens == 0:
                metrics["totalCost"] = 0.0
                metrics["costPerToken"] = 0.0
                return
            
            # Get pricing for the model
            pricing = self._get_model_pricing(model_name)
            
            # Calculate cost components
            input_cost = (prompt_tokens / 1000) * pricing["input"]
            output_cost = (completion_tokens / 1000) * pricing["output"]
            total_cost = input_cost + output_cost
            
            metrics.update({
                "totalCost": round(total_cost, 4),
                "inputCost": round(input_cost, 4),
                "outputCost": round(output_cost, 4),
                "costPerToken": round(total_cost / total_tokens, 6) if total_tokens > 0 else 0
            })
            
            # Calculate cost efficiency (value per dollar)
            response_length = metrics.get("totalResponseLength", 0)
            if response_length > 0 and total_cost > 0:
                metrics["costEfficiency"] = response_length / total_cost
            
        except Exception as e:
            logger.warning(f"Failed to calculate query cost: {e}")
            metrics["totalCost"] = 0.0
    
    def _get_model_pricing(self, model_name: str) -> Dict[str, float]:
        """Get pricing for a specific model"""
        # Clean model name for lookup
        clean_name = model_name.lower().strip()
        
        # Check exact match first
        if clean_name in self.model_pricing:
            return self.model_pricing[clean_name]
        
        # Check partial matches
        for model, pricing in self.model_pricing.items():
            if model in clean_name or clean_name in model:
                return pricing
        
        # Default to GPT-4 pricing if model not found
        logger.warning(f"Unknown model '{model_name}', using GPT-4 pricing")
        return self.model_pricing["gpt-4"]
    
    def _get_score_weights(self) -> Dict[str, float]:
        """Get scoring weights from parameters or defaults"""
        return {
            "token": float(self.parameters.get("tokenWeight", 0.3)),
            "cost": float(self.parameters.get("costWeight", 0.3)),
            "performance": float(self.parameters.get("performanceWeight", 0.2)),
            "quality": float(self.parameters.get("qualityWeight", 0.2))
        }
    
    def _get_threshold(self, param_name: str, default_value) -> Any:
        """Get threshold value from parameters with type conversion"""
        value = self.parameters.get(param_name, default_value)
        
        # Convert string numbers to appropriate types
        if isinstance(value, str) and isinstance(default_value, (int, float)):
            try:
                if isinstance(default_value, int):
                    return int(value)
                else:
                    return float(value)
            except ValueError:
                logger.warning(f"Invalid {param_name} value '{value}', using default {default_value}")
                return default_value
        
        return value
    
    def _parse_duration(self, duration_str: str) -> float:
        """Parse duration string to seconds"""
        if isinstance(duration_str, (int, float)):
            return float(duration_str)
            
        duration_str = str(duration_str).lower().strip()
        
        try:
            if duration_str.endswith('s'):
                return float(duration_str[:-1])
            elif duration_str.endswith('m'):
                return float(duration_str[:-1]) * 60
            elif duration_str.endswith('h'):
                return float(duration_str[:-1]) * 3600
            else:
                # Assume seconds if no unit
                return float(duration_str)
        except ValueError:
            logger.warning(f"Invalid duration '{duration_str}', using 30 seconds")
            return 30.0
    
    def _update_metrics_with_scores(self, metrics: Dict[str, Any], scores: Dict[str, float]) -> None:
        """Update metrics dict with individual scores"""
        metrics.update(scores)
        
        # Ensure lists exist
        metrics.setdefault("threshold_violations", [])
        metrics.setdefault("passed_thresholds", [])