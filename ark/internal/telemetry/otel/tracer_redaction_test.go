/* Copyright 2025. McKinsey & Company */

package otel

import (
	"strings"
	"testing"

	"mckinsey.com/ark/internal/telemetry"
)

func TestConvertAttributeRedactsStrings(t *testing.T) {
	bareKey := "sk-" + strings.Repeat("A", 48) // built at runtime; never a committed literal
	kv := convertAttribute(telemetry.String(
		telemetry.AttrQueryInput,
		"access_token=secret123 and a bare "+bareKey,
	))
	got := kv.Value.AsString()
	if strings.Contains(got, "secret123") {
		t.Errorf("expected key-anchored credential redacted, got %q", got)
	}
	if strings.Contains(got, bareKey) {
		t.Errorf("expected shape-based credential redacted, got %q", got)
	}
	if !strings.Contains(got, "[REDACTED]") {
		t.Errorf("expected [REDACTED] marker, got %q", got)
	}
}

func TestConvertAttributeNonStringUntouched(t *testing.T) {
	if kv := convertAttribute(telemetry.Int64(telemetry.AttrTokensTotal, 30)); kv.Value.AsInt64() != 30 {
		t.Errorf("expected int64 30, got %v", kv.Value.AsInt64())
	}
}

func TestConvertAttributesRedacts(t *testing.T) {
	kvs := convertAttributes([]telemetry.Attribute{
		telemetry.String(telemetry.AttrQueryInput, "access_token=secret123"),
		telemetry.Int64(telemetry.AttrTokensTotal, 5),
	})
	if strings.Contains(kvs[0].Value.AsString(), "secret123") {
		t.Errorf("expected credential redacted, got %q", kvs[0].Value.AsString())
	}
	if kvs[1].Value.AsInt64() != 5 {
		t.Errorf("expected int64 preserved, got %v", kvs[1].Value.AsInt64())
	}
}

func TestConvertAttributeRedactsStringSlice(t *testing.T) {
	kv := convertAttribute(telemetry.Attr("msgs", []string{"clean", "access_token=secret123"}))
	got := kv.Value.AsStringSlice()
	if len(got) != 2 || got[0] != "clean" {
		t.Errorf("expected clean element preserved, got %v", got)
	}
	if strings.Contains(got[1], "secret123") {
		t.Errorf("expected credential redacted in slice element, got %q", got[1])
	}
}
