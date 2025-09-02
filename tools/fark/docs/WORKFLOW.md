# Fark Agent Management Workflow

This guide demonstrates a complete workflow for creating, using, and managing agents with the fark CLI.

## Complete Workflow Example

### 1. Create a Weather Agent

```bash
./fark create agent my-weather --prompt "Weather assistant" --tools get-coordinates,get-forecast
```

**Output:**
```
agent 'my-weather' created successfully
```

This creates an agent named `my-weather` with:
- A basic weather assistant prompt
- Two tools: `get-coordinates` and `get-forecast`
- Uses default model (no explicit model specified)

### 2. Test the Agent

```bash
./fark agent my-weather "weather in new-york, usa"
```

**Output:**
```
08:15:42    QueryStarted     {"queryID": "query-abc123", "input": "weather in new-york, usa"}
08:15:43    ToolCallStarted  {"type": "Normal", "name": "get-coordinates", "agent": "default/my-weather"}
08:15:44    ToolCallComplete {"type": "Normal", "name": "get-coordinates", "duration": "892ms"}
08:15:44    ToolCallStarted  {"type": "Normal", "name": "get-forecast", "agent": "default/my-weather"}
08:15:45    ToolCallComplete {"type": "Normal", "name": "get-forecast", "duration": "1.2s"}
08:15:45    QueryComplete    

The current weather in New York, USA is partly cloudy with a temperature of 72°F (22°C). 
There's a light breeze from the southwest at 8 mph. Today's forecast shows scattered 
clouds with a high of 78°F and a low of 65°F. No precipitation expected.
```

Query the agent to get weather information for New York. Note that the temperature is reported in both Fahrenheit and Celsius.

### 3. Delete and Recreate with Improved Prompt

```bash
./fark delete agent my-weather
./fark create agent my-weather --prompt "Weather assistant, always report in celsius" --tools get-coordinates,get-forecast
```

**Output:**
```
agent 'my-weather' deleted
agent 'my-weather' created successfully
```

Delete the existing agent and create a new one with a more specific prompt that enforces Celsius temperature reporting.

### 4. Test the Updated Agent

```bash
./fark agent my-weather "weather in new-york, usa"
```

**Output:**
```
08:16:12    QueryStarted     {"queryID": "query-def456", "input": "weather in new-york, usa"}
08:16:13    ToolCallStarted  {"type": "Normal", "name": "get-coordinates", "agent": "default/my-weather"}
08:16:14    ToolCallComplete {"type": "Normal", "name": "get-coordinates", "duration": "743ms"}
08:16:14    ToolCallStarted  {"type": "Normal", "name": "get-forecast", "agent": "default/my-weather"}
08:16:15    ToolCallComplete {"type": "Normal", "name": "get-forecast", "duration": "1.1s"}
08:16:15    QueryComplete    

The current weather in New York, USA is partly cloudy with a temperature of 22°C. 
There's a light breeze from the southwest. Today's forecast shows scattered clouds 
with a high of 26°C and a low of 18°C. No precipitation expected.
```

Query the agent again to see the improved behavior. Notice that now only Celsius temperatures are reported, demonstrating how the refined prompt changed the agent's behavior.

### 5. Inspect Available Tools

```bash
./fark get tool get-forecast
./fark get tool get-coordinates
```

**Output:**
```bash
# ./fark get tool get-forecast
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  creationTimestamp: "2025-07-04T05:49:56Z"
  name: get-forecast
  namespace: default
spec:
  description: Get weather forecast for a specific location and time period
  inputSchema:
    properties:
      gridX:
        description: Grid X coordinate
        type: integer
      gridY:
        description: Grid Y coordinate
        type: integer
      office:
        description: Weather office identifier (e.g., TOP)
        type: string
    required:
    - office
    - gridX
    - gridY
    type: object
  type: fetcher
  fetcher:
    url: https://api.weather.gov/gridpoints/{office}/{gridX},{gridY}/forecast

# ./fark get tool get-coordinates
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  creationTimestamp: "2025-07-04T05:49:55Z"
  name: get-coordinates
  namespace: default
spec:
  description: Returns coordinates for the given city name
  inputSchema:
    properties:
      city:
        description: City name to get coordinates for
        type: string
    required:
    - city
    type: object
  type: fetcher
  fetcher:
    url: https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1
```

Examine the tool configurations to understand what capabilities are available to the agent. This shows how the agent uses `get-coordinates` to find city coordinates, then `get-forecast` to get weather data.

### 6. Test with Different Location

```bash
./fark agent my-weather "weather in chicago"
```

**Output:**
```
08:17:32    QueryStarted     {"queryID": "query-ghi789", "input": "weather in chicago"}
08:17:33    ToolCallStarted  {"type": "Normal", "name": "get-coordinates", "agent": "default/my-weather"}
08:17:34    ToolCallComplete {"type": "Normal", "name": "get-coordinates", "duration": "654ms"}
08:17:34    ToolCallStarted  {"type": "Normal", "name": "get-forecast", "agent": "default/my-weather"}
08:17:35    ToolCallComplete {"type": "Normal", "name": "get-forecast", "duration": "987ms"}
08:17:35    QueryComplete    

The weather in Chicago is currently overcast with a temperature of 19°C. 
Winds are calm from the east. Today's forecast calls for cloudy skies with 
a high of 24°C and a low of 16°C. Light rain possible this evening.
```

Test the agent with a different city to verify it works across locations and consistently reports in Celsius.

### 7. Final Iteration - More Specific Requirements

```bash
./fark delete agent my-weather
./fark create agent my-weather --prompt "Weather assistant, always report temperature in celsius, and weather for today only" --tools get-coordinates,get-forecast
```

**Output:**
```
agent 'my-weather' deleted
agent 'my-weather' created successfully
```

Delete and recreate with an even more specific prompt that limits responses to today's weather only.

### 8. Test Final Version

```bash
./fark agent my-weather "weather in chicago"
./fark agent my-weather "weather in chicago"
```

**Output:**
```bash
# First query
08:18:45    QueryStarted     {"queryID": "query-jkl012", "input": "weather in chicago"}
08:18:46    ToolCallStarted  {"type": "Normal", "name": "get-coordinates", "agent": "default/my-weather"}
08:18:47    ToolCallComplete {"type": "Normal", "name": "get-coordinates", "duration": "712ms"}
08:18:47    ToolCallStarted  {"type": "Normal", "name": "get-forecast", "agent": "default/my-weather"}
08:18:48    ToolCallComplete {"type": "Normal", "name": "get-forecast", "duration": "1.3s"}
08:18:48    QueryComplete    

Today's weather in Chicago: overcast with a current temperature of 19°C. 
Expect cloudy skies throughout the day with a high of 24°C.

# Second query (same request)
08:19:15    QueryStarted     {"queryID": "query-mno345", "input": "weather in chicago"}
08:19:16    ToolCallStarted  {"type": "Normal", "name": "get-coordinates", "agent": "default/my-weather"}
08:19:17    ToolCallComplete {"type": "Normal", "name": "get-coordinates", "duration": "823ms"}
08:19:17    ToolCallStarted  {"type": "Normal", "name": "get-forecast", "agent": "default/my-weather"}
08:19:18    ToolCallComplete {"type": "Normal", "name": "get-forecast", "duration": "1.1s"}
08:19:18    QueryComplete    

Today's weather in Chicago: overcast conditions with 19°C currently. 
Today's high will reach 24°C with cloudy skies continuing.
```

Test the final version multiple times to ensure consistent behavior. Notice how the refined prompt now focuses responses on "today's weather" and maintains Celsius reporting consistently.

## Creating Custom Tools as URL Wrappers

The weather agent uses two tools that are essentially URL fetch wrappers. Here's how to create your own custom tools:

### Example: Creating a News API Tool with Secret

First, create a secret for the API key:
```bash
# Create a secret containing the API key
kubectl create secret generic newsapi-secret --from-literal=api-key="your-actual-api-key-here"
```

Then create the tool that references the secret:
```bash
# Create a tool that fetches news headlines using secret for API key
./fark create tool get-news -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: get-news
  namespace: default
spec:
  type: http
  description: Get latest news headlines for a specific topic
  inputSchema:
    type: object
    properties:
      topic:
        type: string
        description: News topic or keyword to search for
      country:
        type: string
        description: Country code (e.g., us, uk, ca)
        default: us
    required:
      - topic
  http:
    url: https://newsapi.org/v2/everything?q={topic}&country={country}&sortBy=publishedAt&pageSize=5
    headers:
      - name: "X-API-Key"
        value:
          valueFrom:
            secretKeyRef:
              name: newsapi-secret
              key: api-key
      - name: "Content-Type"
        value:
          value: "application/json"
    timeout: 10s
EOF
```

**Output:**
```
tool 'get-news' created successfully
```

### Example: Creating a Simple REST API Tool

```bash
# Create a tool that fetches random quotes (no authentication needed)
./fark create tool get-quote -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: get-quote
  namespace: default
spec:
  type: http
  description: Get inspirational quotes by category
  inputSchema:
    type: object
    properties:
      category:
        type: string
        description: Quote category (inspirational, motivational, success)
        default: inspirational
  http:
    url: https://api.quotable.io/random?tags={category}
    method: GET
    headers:
      - name: "Content-Type"
        value:
          value: "application/json"
    timeout: 5s
EOF
```

**Output:**
```
tool 'get-quote' created successfully
```

### Creating an Agent with Custom Tools

```bash
# Create an agent that uses both weather and news tools
./fark create agent news-weather --prompt "You are a helpful assistant that provides weather and news updates. Always be concise and informative." --tools get-coordinates,get-forecast,get-news,get-quote
```

**Output:**
```
agent 'news-weather' created successfully
```

### Testing the Enhanced Agent

```bash
./fark agent news-weather "Give me weather for Seattle and latest tech news"
```

**Output:**
```
08:20:15    QueryStarted     {"queryID": "query-pqr678", "input": "Give me weather for Seattle and latest tech news"}
08:20:16    ToolCallStarted  {"type": "Normal", "name": "get-coordinates", "agent": "default/news-weather"}
08:20:17    ToolCallComplete {"type": "Normal", "name": "get-coordinates", "duration": "654ms"}
08:20:17    ToolCallStarted  {"type": "Normal", "name": "get-forecast", "agent": "default/news-weather"}
08:20:18    ToolCallComplete {"type": "Normal", "name": "get-forecast", "duration": "987ms"}
08:20:18    ToolCallStarted  {"type": "Normal", "name": "get-news", "agent": "default/news-weather"}
08:20:19    ToolCallComplete {"type": "Normal", "name": "get-news", "duration": "1.2s"}
08:20:19    QueryComplete    

**Seattle Weather:**
Currently 16°C with partly cloudy skies. Today's high: 21°C, low: 12°C.

**Latest Tech News:**
• Apple announces new AI features for iOS 18
• Microsoft Azure expands cloud services in Europe  
• Tesla reports record quarterly deliveries
• Google launches improved search algorithms
• Meta invests $2B in VR technology development
```

### Understanding Tool Patterns

#### Basic HTTP Tool Structure
```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: your-tool-name
spec:
  type: http                       # Tool type - http for HTTP calls
  description: "Tool description"   # What the tool does
  inputSchema:                     # JSON schema for parameters
    type: object
    properties:
      param1:
        type: string
        description: "Parameter description"
    required: ["param1"]
  http:
    url: "https://api.example.com/{param1}"    # URL with parameter substitution
    method: GET                               # HTTP method (default: GET)
    headers:                                  # Optional headers (array format)
      - name: "Authorization"
        value:
          valueFrom:                          # Reference to secret
            secretKeyRef:
              name: api-secret
              key: token
      - name: "Content-Type"
        value:
          value: "application/json"           # Static value
    timeout: 10s                              # Request timeout
```

#### Parameter Substitution
- Use `{paramName}` in URLs for parameter substitution
- Parameters are URL-encoded automatically
- Support for query parameters, path parameters, and headers

#### Common API Patterns
```yaml
# REST API with path parameters
fetcher:
  url: "https://api.example.com/users/{userId}/posts/{postId}"

# REST API with query parameters  
fetcher:
  url: "https://api.example.com/search?q={query}&limit={limit}"

# API with authentication headers using secrets
fetcher:
  url: "https://api.example.com/data"
  headers:
    - name: "Authorization"
      value:
        valueFrom:
          secretKeyRef:
            name: api-secret
            key: bearer-token
    - name: "X-API-Key"
      value:
        valueFrom:
          secretKeyRef:
            name: api-secret
            key: api-key

# POST requests with form data
fetcher:
  method: POST
  headers:
    - name: "Content-Type"
      value:
        value: "application/x-www-form-urlencoded"
```

### Secret Management for API Keys

For tools that require API keys or other sensitive data:

1. **Create Kubernetes Secrets**:
```bash
# Create secret with API key
kubectl create secret generic my-api-secret --from-literal=api-key="sk-your-key-here"

# Create secret with multiple keys
kubectl create secret generic service-creds \
  --from-literal=api-key="your-api-key" \
  --from-literal=bearer-token="Bearer your-token"
```

2. **Reference Secrets in Tools**:
```yaml
fetcher:
  headers:
    - name: "Authorization"
      value:
        valueFrom:
          secretKeyRef:
            name: service-creds
            key: bearer-token
```

3. **Verify Secret References**:
```bash
# Check if secret exists
kubectl get secret my-api-secret

# View secret keys (not values)
kubectl describe secret my-api-secret
```

### Tool Development Best Practices

1. **Clear Descriptions**: Make tool purposes obvious to the AI
2. **Proper Schema**: Define input parameters with clear descriptions  
3. **Parameter Validation**: Use required fields and type constraints
4. **Reasonable Timeouts**: Set appropriate timeout values
5. **Error Handling**: APIs should return meaningful error messages
6. **Rate Limiting**: Consider API rate limits in tool design
7. **Secure API Keys**: Always use secrets for authentication, never hardcode keys

### Inspecting Custom Tools

```bash
./fark get tool get-news
./fark get tool get-quote
```

This shows the complete tool configuration, helping debug issues or understand capabilities.

## Key Workflow Patterns

### Iterative Development
1. **Create** → **Test** → **Delete** → **Recreate** cycle
2. Refine prompts based on testing results
3. Maintain consistent tool configuration across iterations

### Agent Lifecycle Management
- **Create**: Define agent with prompt and tools
- **Test**: Query agent with various inputs
- **Inspect**: Check tool configurations when needed
- **Iterate**: Delete and recreate with improvements
- **Validate**: Test multiple times for consistency

### Best Practices Demonstrated

1. **Incremental Prompt Refinement**:
   - Start simple: "Weather assistant"
   - Add specificity: "always report in celsius"
   - Add constraints: "weather for today only"

2. **Tool Consistency**:
   - Keep the same tools (`get-coordinates,get-forecast`) across iterations
   - Tools provide the core capabilities while prompts control behavior

3. **Testing Strategy**:
   - Test immediately after creation
   - Use different locations (New York, Chicago)
   - Run multiple queries to verify consistency

4. **Resource Management**:
   - Clean up by deleting before recreating
   - Use same agent name for easy iteration
   - Inspect tools when debugging issues

## Command Reference

| Command | Purpose | Usage Pattern |
|---------|---------|---------------|
| `create agent` | Create new agent | Define prompt and tools |
| `agent <name>` | Query agent | Test functionality |
| `delete agent` | Remove agent | Clean up before iteration |
| `get tool` | Inspect tools | Understand capabilities |

## Output Options

### Verbosity Levels
- **Default (Verbose)**: Shows events, spinner, and results
- **`--quiet`**: Shows spinner and results, suppresses events  
- **`--verbose`**: Explicitly enable verbose mode (same as default)

### Output Formats
- **`--output text`**: Human-readable with colors and timestamps (default)
- **`--output json`**: Structured JSON format

### Usage Examples
```bash
# Default: verbose text output with events
./fark agent my-weather "weather in Seattle"

# Clean output: just spinner and results
./fark agent my-weather "weather in Seattle" --quiet

# JSON format with events
./fark agent my-weather "weather in Seattle" --output json

# Clean JSON output
./fark agent my-weather "weather in Seattle" --quiet --output json
```

## Tips

- **Model is Optional**: No need to specify `--model` unless you need a specific one
- **Tools are Key**: Choose tools that match your agent's purpose
- **Prompt Iteration**: Start simple, add specificity based on testing
- **Clean State**: Delete before recreating to avoid conflicts
- **Test Thoroughly**: Query multiple times with different inputs
- **Use `--quiet` for scripts**: Clean output without losing progress indication
- **Use `--output json` for automation**: Structured data for processing