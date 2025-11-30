# Tool Service

FastMCP-based tool service for creating custom tools that can be used by agents in the Ark framework.

## How to Define New Tools

### Step 1: Basic Tool Structure

All tools follow this pattern in `main.py`:

```python
@mcp.tool
def tool_name(
    param: Annotated[type, "Parameter description"]
) -> return_type:
    """Tool description for the agent"""
    # Implementation
    return result
```

### Step 2: Add Your Tool Function

Edit `main.py` and add your tool after the existing ones:

```python
@mcp.tool
def your_new_tool(
    param1: Annotated[str, "Description of first parameter"],
    param2: Annotated[int, "Description of second parameter"] 
) -> dict:
    """What this tool does - agents will see this description"""
    # Your logic here
    result = {"output": f"Processed {param1} with {param2}"}
    return result
```

### Step 3: Parameter Types and Annotations

Use these common patterns:

```python
# String input
text: Annotated[str, "Text to process"]

# Numbers
count: Annotated[int, "Number of items"]
value: Annotated[float, "Decimal value"]

# Optional parameters
optional_param: Annotated[str | None, "Optional parameter"] = None

# Lists
items: Annotated[list[str], "List of items to process"]
```

### Step 4: Return Types

Return structured data that agents can understand:

```python
# Simple values
return "result string"
return 42
return 3.14

# Dictionaries for complex data
return {
    "status": "success",
    "data": result,
    "count": len(items)
}

# Lists
return ["item1", "item2", "item3"]
```


### Example: Complete New Tool

Here's a complete example of adding a URL checker tool:

```python
import requests
from typing import Annotated

@mcp.tool
def check_url(
    url: Annotated[str, "URL to check"],
    timeout: Annotated[int, "Timeout in seconds"] = 5
) -> dict:
    """Check if a URL is accessible and return status information"""
    try:
        response = requests.get(url, timeout=timeout)
        return {
            "url": url,
            "status_code": response.status_code,
            "accessible": response.status_code == 200,
            "response_time_ms": int(response.elapsed.total_seconds() * 1000)
        }
    except Exception as e:
        return {
            "url": url,
            "accessible": False,
            "error": str(e)
        }
```

## Build and Deploy

### Option 1: Quick Deploy

```bash
./deploy.sh
```

### Option 2: Manual Steps

```bash
# Build Docker image
docker build -t tool:latest .

# Load into local cluster (check your cluster documentation)
# Load into MicroK8s
docker save tool:latest | microk8s ctr images import -

# Deploy to Kubernetes
kubectl apply -k deployment/
```

## Test Your Tools

### Step 1: Create Test Agent

Create `test-agent.yaml`:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: tool-test-agent
spec:
  prompt: You are helpful agent that uses tools to assist users.
  modelRef:
    name: gpt-4-model
  mcpServers:
    - name: tool
      url: http://tool:8000/mcp
```

Apply it:
```bash
kubectl apply -f test-agent.yaml
```

### Step 2: Test with Ark Binary

```bash
# Test basic math
fark agent tool-test-agent "Add 15 and 27"

# Test text analysis  
fark agent tool-test-agent "Count words in: hello world this is a test"

# Test multiplication
fark agent tool-test-agent "What is 8.5 times 12.3?"
```

### Step 3: Direct Tool Testing

```bash
# Port forward to test tools directly
kubectl port-forward service/tool 8000:8000

# Test MCP endpoint
curl http://localhost:8000/mcp
```

## Common Tool Patterns

### File Processing Tool
```python
@mcp.tool
def process_file_content(
    content: Annotated[str, "File content to process"],
    operation: Annotated[str, "Operation: upper, lower, reverse"]
) -> str:
    """Process text content with specified operation"""
    if operation == "upper":
        return content.upper()
    elif operation == "lower":
        return content.lower()
    elif operation == "reverse":
        return content[::-1]
    else:
        return f"Unknown operation: {operation}"
```

### Data Analysis Tool
```python
@mcp.tool
def analyze_numbers(
    numbers: Annotated[list[float], "List of numbers to analyze"]
) -> dict:
    """Analyze a list of numbers and return statistics"""
    if not numbers:
        return {"error": "Empty list provided"}
    
    return {
        "count": len(numbers),
        "sum": sum(numbers),
        "average": sum(numbers) / len(numbers),
        "min": min(numbers),
        "max": max(numbers)
    }
```

### External API Tool
```python
@mcp.tool
def get_weather(
    city: Annotated[str, "City name for weather lookup"]
) -> dict:
    """Get weather information for a city"""
    # Replace with actual weather API
    return {
        "city": city,
        "temperature": "22°C",
        "condition": "Sunny",
        "humidity": "45%"
    }
```

## Resources

- **Deployment**: Tool pod with FastMCP server on port 8000
- **Service**: Exposes tools internally at `http://tool:8000/mcp`
- **MCPServer**: Configured for agent integration
- **Agent Integration**: Reference tools via `mcpServers` in agent specs