package genai

import "testing"

func TestBuiltInProvidersSupportA2ANativeTurns(t *testing.T) {
	providers := []any{
		&OpenAIProvider{},
		&AzureProvider{},
		&BedrockModel{},
	}

	for _, provider := range providers {
		if _, ok := provider.(A2ANativeTurnProvider); !ok {
			t.Fatalf("provider %T must implement A2ANativeTurnProvider", provider)
		}
	}
}
