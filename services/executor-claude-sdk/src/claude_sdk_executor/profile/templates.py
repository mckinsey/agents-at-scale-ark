"""Template variable resolution for hooks and prompts."""

import logging
import operator
import re
from typing import Any, Callable, Dict, Optional, TYPE_CHECKING

from jinja2 import Template, Environment, StrictUndefined

if TYPE_CHECKING:
    from ark_sdk import ExecutionEngineRequest

logger = logging.getLogger(__name__)

# Safe comparison operators for condition evaluation
_OPERATORS: Dict[str, Callable[[Any, Any], bool]] = {
    ">=": operator.ge,
    "<=": operator.le,
    "!=": operator.ne,
    "==": operator.eq,
    ">": operator.gt,
    "<": operator.lt,
}


class TemplateContext:
    """Context for resolving template variables in hooks and prompts.
    
    Template variables use Go-style {{.VarName}} syntax for compatibility
    with Kubernetes conventions, but are resolved using Jinja2.
    """

    def __init__(self) -> None:
        self._variables: Dict[str, Any] = {}
        self._env = Environment(undefined=StrictUndefined)

    @classmethod
    def from_request(cls, request: "ExecutionEngineRequest") -> "TemplateContext":
        """Create template context from an execution request.
        
        Extracts query, agent, and annotation information to populate
        template variables.
        
        Args:
            request: The ExecutionEngineRequest from Ark
            
        Returns:
            Populated TemplateContext
        """
        ctx = cls()
        
        # Core identifiers - queryId and queryName from Ark controller
        ctx._variables["QueryID"] = request.queryId or "unknown"
        ctx._variables["QueryName"] = request.queryName or "unknown"
        ctx._variables["AgentName"] = request.agent.name if request.agent else "unknown"
        ctx._variables["AgentNamespace"] = getattr(request.agent, "namespace", "default") if request.agent else "default"
        
        # Task information
        user_input = request.userInput.content if request.userInput else ""
        ctx._variables["TaskDescription"] = user_input
        ctx._variables["TaskSummary"] = user_input.split("\n")[0][:100] if user_input else ""
        
        # Extract from agent parameters (query-level parameters resolved by Ark controller)
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Agent: {request.agent.name if request.agent else 'None'}")
        logger.info(f"Agent has parameters attr: {hasattr(request.agent, 'parameters') if request.agent else 'N/A'}")
        if request.agent and hasattr(request.agent, "parameters"):
            logger.info(f"Agent parameters: {request.agent.parameters}")
        if request.agent and hasattr(request.agent, "parameters") and request.agent.parameters:
            for param in request.agent.parameters:
                # Parameters are available directly by name
                logger.info(f"Setting param {param.name} = {param.value}")
                ctx._variables[param.name] = param.value
        
        # Extract from agent labels (legacy support)
        if request.agent and hasattr(request.agent, "labels") and request.agent.labels:
            labels = request.agent.labels
            # Only set from labels if not already set by parameters
            if not ctx._variables.get("Repo"):
                ctx._variables["Repo"] = labels.get("executor.ark.mckinsey.com/repo", "")
            if not ctx._variables.get("Branch"):
                ctx._variables["Branch"] = labels.get("executor.ark.mckinsey.com/branch", "main")
            if not ctx._variables.get("PRNumber"):
                ctx._variables["PRNumber"] = labels.get("executor.ark.mckinsey.com/pr-number", "")
            if not ctx._variables.get("PRHead"):
                ctx._variables["PRHead"] = labels.get("executor.ark.mckinsey.com/pr-head", "")
            if not ctx._variables.get("PRBase"):
                ctx._variables["PRBase"] = labels.get("executor.ark.mckinsey.com/pr-base", "")
            if not ctx._variables.get("IssueNumber"):
                ctx._variables["IssueNumber"] = labels.get("executor.ark.mckinsey.com/issue-number", "")
            if not ctx._variables.get("JiraTicket"):
                ctx._variables["JiraTicket"] = labels.get("executor.ark.mckinsey.com/jira-ticket", "")
        
        return ctx

    def get(self, key: str, default: Any = "") -> Any:
        """Get a template variable value.
        
        Args:
            key: Variable name
            default: Default value if not found
            
        Returns:
            Variable value or default
        """
        return self._variables.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set a template variable.
        
        Args:
            key: Variable name
            value: Variable value
        """
        self._variables[key] = value

    def update_workspace(self, workspace_path: str) -> None:
        """Update context with workspace information.
        
        Args:
            workspace_path: Path to the workspace directory
        """
        self._variables["WorkspacePath"] = workspace_path

    def update_branch(self, branch_name: str, branch_prefix: str = "") -> None:
        """Update context with branch information.
        
        Args:
            branch_name: Name of the created branch
            branch_prefix: Prefix used for branch naming
        """
        self._variables["BranchName"] = branch_name
        self._variables["BranchPrefix"] = branch_prefix

    def update_results(self, state: Any) -> None:
        """Update context with execution results.
        
        Args:
            state: ExecutionState with agent output and diff info
        """
        self._variables["AgentOutput"] = getattr(state, "agent_output", "")
        self._variables["Diff"] = getattr(state, "diff", "")
        self._variables["DiffSummary"] = getattr(state, "diff_summary", "")
        self._variables["HasChanges"] = getattr(state, "has_changes", False)
        self._variables["PRUrl"] = getattr(state, "pr_url", "")
        self._variables["CriticScore"] = getattr(state, "critic_score", 0.0)
        self._variables["CriticFeedback"] = getattr(state, "critic_feedback", "")
        self._variables["CriticApproved"] = getattr(state, "critic_score", 0.0) >= 1.0

    def update_error(self, error: str) -> None:
        """Update context with error information.
        
        Args:
            error: Error message
        """
        self._variables["Error"] = error

    def resolve(self, template_str: str) -> str:
        """Resolve template variables in a string.
        
        Supports both Go-style {{.VarName}} and Jinja2-style {{ VarName }}.
        
        Args:
            template_str: String with template variables
            
        Returns:
            String with variables resolved
        """
        if not template_str:
            return template_str
        
        # Convert Go-style {{.VarName}} to Jinja2 {{ VarName }}
        jinja_template = re.sub(r'\{\{\.(\w+)\}\}', r'{{ \1 }}', template_str)
        
        try:
            template = self._env.from_string(jinja_template)
            return template.render(**self._variables)
        except Exception as e:
            logger.warning(f"Template resolution failed: {e}")
            return template_str

    def evaluate_condition(self, condition: str) -> bool:
        """Evaluate a condition template safely.
        
        Supports:
        - Boolean variable references: {{.HasChanges}}, {{.CriticApproved}}
        - Comparisons: {{.CriticScore}} >= 0.8, {{.NumChanges}} > 0
        - Boolean strings: true, false, yes, no, 1, 0
        
        Args:
            condition: Condition template string
            
        Returns:
            True if condition evaluates to true, False otherwise
        """
        if not condition:
            return True  # No condition means always run
        
        resolved = self.resolve(condition)
        
        # Handle boolean strings
        resolved_lower = resolved.strip().lower()
        if resolved_lower in ("true", "yes", "1"):
            return True
        if resolved_lower in ("false", "no", "0", ""):
            return False
        
        # Try to evaluate as a safe comparison expression
        return self._safe_evaluate(resolved)

    def _safe_evaluate(self, expr: str) -> bool:
        """Safely evaluate a comparison expression without using eval().
        
        Supports patterns like:
        - "0.8 >= 0.8" -> True
        - "5 > 0" -> True
        - "value" -> bool(value)
        
        Args:
            expr: Expression string to evaluate
            
        Returns:
            Boolean result of the expression
        """
        expr = expr.strip()
        
        # Try each operator (longer ones first to avoid partial matches)
        for op_str, op_func in _OPERATORS.items():
            if op_str in expr:
                parts = expr.split(op_str, 1)
                if len(parts) == 2:
                    left = self._parse_value(parts[0].strip())
                    right = self._parse_value(parts[1].strip())
                    try:
                        return op_func(left, right)
                    except (TypeError, ValueError) as e:
                        logger.warning(f"Comparison failed for '{expr}': {e}")
                        return False
        
        # No operator found - treat as a value and check truthiness
        return bool(self._parse_value(expr))

    def _parse_value(self, value_str: str) -> Any:
        """Parse a string value into its appropriate type.
        
        Args:
            value_str: String representation of a value
            
        Returns:
            Parsed value (float, int, bool, or string)
        """
        value_str = value_str.strip()
        
        # Check if it's a variable reference
        if value_str in self._variables:
            return self._variables[value_str]
        
        # Try to parse as number
        try:
            if "." in value_str:
                return float(value_str)
            return int(value_str)
        except ValueError:
            pass
        
        # Boolean strings
        if value_str.lower() in ("true", "yes"):
            return True
        if value_str.lower() in ("false", "no"):
            return False
        
        # Return as string
        return value_str

    def to_dict(self) -> Dict[str, Any]:
        """Return all variables as a dictionary."""
        return dict(self._variables)
