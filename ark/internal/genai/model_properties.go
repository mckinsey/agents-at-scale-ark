package genai

import (
	"encoding/json"
	"strconv"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/shared"
	"k8s.io/apimachinery/pkg/runtime"
)

func applyPropertiesToParams(properties map[string]string, params *openai.ChatCompletionNewParams) {
	setDefaults := func() {
		params.Temperature = openai.Float(1.0)
		params.N = openai.Int(1)
	}

	if len(properties) == 0 {
		setDefaults()
		return
	}

	paramsJSON, err := json.Marshal(params)
	if err != nil {
		setDefaults()
		return
	}

	var paramsMap map[string]any
	if err := json.Unmarshal(paramsJSON, &paramsMap); err != nil {
		setDefaults()
		return
	}

	for key, value := range properties {
		if value == "" {
			continue
		}
		paramsMap[key] = value
	}

	if _, exists := properties["temperature"]; !exists {
		paramsMap["temperature"] = 1.0
	}
	if _, exists := properties["n"]; !exists {
		paramsMap["n"] = 1
	}

	updatedJSON, err := json.Marshal(paramsMap)
	if err != nil {
		return
	}

	_ = json.Unmarshal(updatedJSON, params)
}

// getFloatProperty extracts a float property with a default value
func getFloatProperty(properties map[string]string, key string, defaultValue float64) float64 {
	if value, exists := properties[key]; exists {
		if parsed, err := strconv.ParseFloat(value, 64); err == nil {
			return parsed
		}
	}
	return defaultValue
}

// getIntProperty extracts an int property with a default value
func getIntProperty(properties map[string]string, key string, defaultValue int) int {
	if value, exists := properties[key]; exists {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}

// applyStructuredOutputToParams applies structured output schema to OpenAI parameters
func applyStructuredOutputToParams(outputSchema *runtime.RawExtension, schemaName string, params *openai.ChatCompletionNewParams) {
	if outputSchema != nil && outputSchema.Raw != nil {
		var schemaObj interface{}
		if err := json.Unmarshal(outputSchema.Raw, &schemaObj); err == nil {
			params.ResponseFormat = openai.ChatCompletionNewParamsResponseFormatUnion{
				OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
					JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
						Name:   schemaName,
						Strict: openai.Bool(true),
						Schema: schemaObj,
					},
				},
			}
		}
	}
}
