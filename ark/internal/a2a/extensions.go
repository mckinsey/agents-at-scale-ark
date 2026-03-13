/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"encoding/json"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func SetExtension(m *protocol.Message, uri string, payload any) {
	if m.Metadata == nil {
		m.Metadata = map[string]any{}
	}
	m.Metadata[uri] = payload

	if m.Extensions == nil {
		m.Extensions = []string{uri}
		return
	}
	for _, existing := range m.Extensions {
		if existing == uri {
			return
		}
	}
	m.Extensions = append(m.Extensions, uri)
}

func SetMetadata(m *protocol.Message, key string, value any) {
	if m.Metadata == nil {
		m.Metadata = map[string]any{}
	}
	m.Metadata[key] = value
}

func GetExtension(m protocol.Message, uri string) (any, bool) {
	if m.Metadata == nil {
		return nil, false
	}
	v, ok := m.Metadata[uri]
	return v, ok
}

func GetExtensionAs[T any](m protocol.Message, uri string) (T, error) {
	var zero T
	raw, ok := GetExtension(m, uri)
	if !ok {
		return zero, fmt.Errorf("extension %s not found in message metadata", uri)
	}

	b, err := json.Marshal(raw)
	if err != nil {
		return zero, fmt.Errorf("failed to marshal extension %s: %w", uri, err)
	}

	var result T
	if err := json.Unmarshal(b, &result); err != nil {
		return zero, fmt.Errorf("failed to unmarshal extension %s: %w", uri, err)
	}
	return result, nil
}

func HasExtension(m protocol.Message, uri string) bool {
	for _, ext := range m.Extensions {
		if ext == uri {
			return true
		}
	}
	return false
}

func GetMetadata(m protocol.Message, key string) (any, bool) {
	if m.Metadata == nil {
		return nil, false
	}
	v, ok := m.Metadata[key]
	return v, ok
}

func SetExecutionContextExtension(m *protocol.Message, payload ExecutionResponsePayload) {
	SetExtension(m, ExecutionContextExtensionURI, payload)
}

func GetExecutionContextExtension(m protocol.Message) (*ExecutionResponsePayload, error) {
	result, err := GetExtensionAs[ExecutionResponsePayload](m, ExecutionContextExtensionURI)
	if err != nil {
		return nil, err
	}
	return &result, nil
}
