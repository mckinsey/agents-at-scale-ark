"""Template variable resolution for hooks and prompts."""

import logging
import operator
import re
from typing import Any, Callable, Dict, Optional, TYPE_CHECKING

from jinja2 import Template, Environment, Undefined

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
        self._env = Environment(undefined=Undefined)
        # Register custom filters
        self._env.filters["truncate"] = self._truncate
        self._env.filters["slugify"] = self._slugify
        self._env.filters["printf"] = self._printf

    @staticmethod
    def _truncate(value: Any, length: int = 50) -> str:
        """Truncate string to specified length.
        
        Args:
            value: Value to truncate (will be converted to string)
            length: Maximum length (default 50)
            
        Returns:
            Truncated string
        """
        if not value:
            return ""
        value = str(value)
        if len(value) <= length:
            return value
        return value[:length]

    @staticmethod
    def _slugify(value: Any) -> str:
        """Convert string to URL-safe slug.
        
        Args:
            value: Value to slugify (will be converted to string)
            
        Returns:
            URL-safe slug
        """
        value = str(value).lower()
        value = re.sub(r'[^\w\s-]', '', value)
        value = re.sub(r'[-\s]+', '-', value).strip('-')
        return value

    @staticmethod
    def _printf(value: Any, fmt: str) -> str:
        """Format value using printf-style format string.
        
        Args:
            value: Value to format
            fmt: Printf-style format string (e.g., "%.0f%%")
            
        Returns:
            Formatted string
        """
        try:
            # Handle percentage format specially
            if fmt.endswith("%%"):
                # Convert 0.92 to 92%
                fmt_clean = fmt[:-2]  # Remove trailing %%
                if isinstance(value, (int, float)):
                    result = fmt_clean % (value * 100)
                    return f"{result}%"
            return fmt % value
        except Exception:
            return str(value)

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
        import json
        
        agent_output = getattr(state, "agent_output", "")
        self._variables["AgentOutput"] = agent_output
        self._variables["Diff"] = getattr(state, "diff", "")
        self._variables["DiffSummary"] = getattr(state, "diff_summary", "")
        self._variables["HasChanges"] = getattr(state, "has_changes", False)
        self._variables["PRUrl"] = getattr(state, "pr_url", "")
        self._variables["CriticScore"] = getattr(state, "critic_score", 0.0)
        self._variables["CriticFeedback"] = getattr(state, "critic_feedback", "")
        self._variables["CriticApproved"] = getattr(state, "critic_score", 0.0) >= 1.0
        
        # Parse structured output - check telemetry first (preferred source)
        structured_output = None
        telemetry = getattr(state, "telemetry", None)
        logger.info(f"update_results: telemetry={telemetry is not None}, telemetry.structured_output={getattr(telemetry, 'structured_output', None) if telemetry else None}")
        if telemetry:
            structured_output = getattr(telemetry, "structured_output", None)
        if not structured_output:
            structured_output = getattr(state, "structured_output", None)
        
        logger.info(f"update_results: structured_output={structured_output is not None}")
        if structured_output:
            self._variables["StructuredOutput"] = structured_output
            logger.info(f"StructuredOutput set from telemetry: {list(structured_output.keys()) if isinstance(structured_output, dict) else type(structured_output)}")
        elif agent_output:
            # Try to parse agent output as JSON for structured output access
            logger.info(f"Attempting to parse agent_output as JSON (len={len(agent_output)})")
            logger.info(f"Agent output first 200 chars: {agent_output[:200]}")
            
            # Try to extract JSON from the output (it might be wrapped in markdown or text)
            json_str = agent_output.strip()
            
            # Check if wrapped in markdown code block
            if json_str.startswith("```"):
                # Extract content between first ``` and last ```
                lines = json_str.split('\n')
                if len(lines) > 2:
                    # Skip first line (```json) and last line (```)
                    start_idx = 1
                    end_idx = len(lines) - 1
                    # Find the closing ```
                    for i in range(len(lines) - 1, 0, -1):
                        if lines[i].strip().startswith("```"):
                            end_idx = i
                            break
                    json_str = '\n'.join(lines[start_idx:end_idx])
                    logger.info(f"Extracted JSON from markdown code block")
            
            try:
                parsed = json.loads(json_str)
                if isinstance(parsed, dict):
                    self._variables["StructuredOutput"] = parsed
                    logger.info(f"Parsed structured output with keys: {list(parsed.keys())}")
                else:
                    logger.warning(f"Agent output is JSON but not a dict: {type(parsed)}")
            except json.JSONDecodeError as e:
                logger.warning(f"Agent output is not valid JSON: {e}")
                logger.info(f"Agent output (first 500 chars): {agent_output[:500]}")

    def update_error(self, error: str) -> None:
        """Update context with error information.
        
        Args:
            error: Error message
        """
        self._variables["Error"] = error

    def resolve(self, template_str: str) -> str:
        """Resolve template variables in a string.
        
        Supports both Go-style {{.VarName}} and Jinja2-style {{ VarName }}.
        Also supports Go-style filters: {{.VarName | filter arg}}
        Also supports nested access: {{.StructuredOutput.verdict}}
        Also supports Go-style control structures: {{range}}, {{if}}, {{end}}
        
        Args:
            template_str: String with template variables
            
        Returns:
            String with variables resolved
        """
        if not template_str:
            return template_str
        
        jinja_template = template_str
        
        # IMPORTANT: Convert {{end}} tags FIRST before other conversions
        # This tracks the context (range vs if) to use correct closing tag
        jinja_template = self._convert_go_end_tags(jinja_template)
        
        # Convert Go-style control structures to Jinja2
        # {{range .Items}} -> {% for item in Items %}
        jinja_template = re.sub(
            r'\{\{range\s+\.(\w+(?:\.\w+)*)\}\}',
            r'{% for item in \1 %}',
            jinja_template
        )
        
        # {{if .Condition}} -> {% if Condition %} or {% if item.Condition %} inside loops
        def convert_if_var(match):
            var = match.group(1)
            if '.' not in var and '{% for item in' in jinja_template[:match.start()]:
                return f'{{% if item.{var} %}}'
            return f'{{% if {var} %}}'
        
        jinja_template = re.sub(
            r'\{\{if\s+\.(\w+(?:\.\w+)*)\}\}',
            convert_if_var,
            jinja_template
        )
        # {{if not .Condition}} -> {% if not Condition %}
        jinja_template = re.sub(
            r'\{\{if\s+not\s+\.(\w+(?:\.\w+)*)\}\}',
            r'{% if not \1 %}',
            jinja_template
        )
        # {{if eq .var "value"}} -> {% if var == "value" %} or {% if item.var == "value" %} inside loops
        # We'll add item. prefix for single-word vars when inside a for loop
        def convert_if_eq(match):
            var = match.group(1)
            value = match.group(2)
            # Single word var inside a loop should use item. prefix
            if '.' not in var and '{% for item in' in jinja_template[:match.start()]:
                return f'{{% if item.{var} == "{value}" %}}'
            return f'{{% if {var} == "{value}" %}}'
        
        jinja_template = re.sub(
            r'\{\{if\s+eq\s+\.(\w+(?:\.\w+)*)\s+"([^"]+)"\}\}',
            convert_if_eq,
            jinja_template
        )
        # {{else if eq .var "value"}} -> {% elif var == "value" %} or {% elif item.var == "value" %}
        def convert_elif_eq(match):
            var = match.group(1)
            value = match.group(2)
            if '.' not in var and '{% for item in' in jinja_template[:match.start()]:
                return f'{{% elif item.{var} == "{value}" %}}'
            return f'{{% elif {var} == "{value}" %}}'
        
        jinja_template = re.sub(
            r'\{\{else\s+if\s+eq\s+\.(\w+(?:\.\w+)*)\s+"([^"]+)"\}\}',
            convert_elif_eq,
            jinja_template
        )
        # {{else}} -> {% else %}
        jinja_template = re.sub(r'\{\{else\}\}', r'{% else %}', jinja_template)
        
        # {{ne .var "value"}} function for conditions
        jinja_template = re.sub(
            r'\{\{ne\s+\.(\w+(?:\.\w+)*)\s+"([^"]+)"\}\}',
            r'{{ \1 != "\2" }}',
            jinja_template
        )
        
        # Inside range loops, {{.}} refers to the current item
        jinja_template = re.sub(r'\{\{\.\}\}', r'{{ item }}', jinja_template)
        # Inside range loops, {{.field}} refers to item.field
        jinja_template = re.sub(
            r'\{\{\.(\w+)\}\}(?=.*\{% endfor %\})',
            r'{{ item.\1 }}',
            jinja_template,
            flags=re.DOTALL
        )
        
        # Convert Go-style {{.VarName.nested | filter arg}} to Jinja2 {{ VarName.nested | filter(arg) }}
        jinja_template = re.sub(
            r'\{\{\.(\w+(?:\.\w+)*)\s*\|\s*(\w+)\s+([^}]+)\}\}',
            r'{{ \1 | \2(\3) }}',
            jinja_template
        )
        # Convert Go-style {{.VarName.nested | filter}} (no arg) to Jinja2 {{ VarName.nested | filter }}
        jinja_template = re.sub(
            r'\{\{\.(\w+(?:\.\w+)*)\s*\|\s*(\w+)\}\}',
            r'{{ \1 | \2 }}',
            jinja_template
        )
        # Convert Go-style {{.VarName.nested}} to Jinja2 {{ VarName.nested }}
        jinja_template = re.sub(r'\{\{\.(\w+(?:\.\w+)*)\}\}', r'{{ \1 }}', jinja_template)
        
        # Debug logging
        if 'StructuredOutput' in template_str and len(template_str) < 100:
            logger.info(f"Template conversion: {template_str!r} -> {jinja_template!r}")
            logger.info(f"Available variables: {list(self._variables.keys())}")
        
        try:
            template = self._env.from_string(jinja_template)
            result = template.render(**self._variables)
            if 'StructuredOutput' in template_str and len(template_str) < 100:
                logger.info(f"Template result: {result!r}")
            return result
        except Exception as e:
            logger.warning(f"Template resolution failed: {e}")
            logger.warning(f"Template was: {jinja_template!r}")
            return template_str
    
    def _convert_go_end_tags(self, template: str) -> str:
        """Convert Go-style {{end}} tags to appropriate Jinja2 closing tags.
        
        Tracks the context (range vs if) to use correct closing tag.
        """
        result = []
        end_stack = []
        
        i = 0
        while i < len(template):
            # Check for range start
            if template[i:].startswith('{{range'):
                end_stack.append('for')
                # Find end of tag
                end_idx = template.find('}}', i)
                if end_idx != -1:
                    result.append(template[i:end_idx + 2])
                    i = end_idx + 2
                    continue
            # Check for if start
            elif template[i:].startswith('{{if'):
                end_stack.append('if')
                end_idx = template.find('}}', i)
                if end_idx != -1:
                    result.append(template[i:end_idx + 2])
                    i = end_idx + 2
                    continue
            # Check for end tag
            elif template[i:].startswith('{{end}}'):
                if end_stack:
                    tag_type = end_stack.pop()
                    if tag_type == 'for':
                        result.append('{% endfor %}')
                    else:
                        result.append('{% endif %}')
                else:
                    result.append('{% endif %}')  # Default
                i += 7
                continue
            
            result.append(template[i])
            i += 1
        
        return ''.join(result)

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
