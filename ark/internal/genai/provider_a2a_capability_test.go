package genai

import "testing"

func TestOnlyBedrockImplementsA2ANativeTurnProvider(t *testing.T) {
	if _, ok := any(&BedrockModel{}).(A2ANativeTurnProvider); !ok {
		t.Fatal("BedrockModel must implement A2ANativeTurnProvider")
	}
	if _, ok := any(&OpenAIProvider{}).(A2ANativeTurnProvider); ok {
		t.Fatal("OpenAIProvider must NOT implement A2ANativeTurnProvider")
	}
	if _, ok := any(&AzureProvider{}).(A2ANativeTurnProvider); ok {
		t.Fatal("AzureProvider must NOT implement A2ANativeTurnProvider")
	}
}
