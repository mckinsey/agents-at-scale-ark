# Shared Test Resources

This directory contains shared manifests used by multiple chainsaw tests to reduce duplication and improve maintainability.

## Mock Servers

### mock-geocoding-api.yaml
Mock server for geocoding API (geocoding-api.open-meteo.com).

**Returns**: Coordinates for city name queries
**Service URL**: `http://mock-geocoding-api/v1/search?name={city}&count=1`

**Used by**:
- `agent-partial-tool`
- `agent-partial-tool-invalid`
- `query-tool-target`

### mock-weather-api.yaml
Mock server for weather forecast API (api.open-meteo.com).

**Returns**: Current weather data for given coordinates
**Service URL**: `http://mock-weather-api/v1/forecast?latitude={latitude}&longitude={longitude}&current_weather=true`

**Used by**:
- `agent-tools`

## Usage

Reference shared manifests from test directories using relative paths:

```yaml
- apply:
    file: ../../shared/mock-geocoding-api.yaml
```

Always wait for the mock server to be ready before using it:

```yaml
- assert:
    resource:
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: mock-geocoding-api
      status:
        readyReplicas: 1
- assert:
    resource:
      apiVersion: v1
      kind: Endpoints
      metadata:
        name: mock-geocoding-api
```
