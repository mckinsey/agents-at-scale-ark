/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"regexp"
	"strings"
	"testing"
)

var validSlotName = regexp.MustCompile(`^[a-z0-9_]{1,63}$`)

func TestReplicaSlotName_IsValidPostgresIdentifier(t *testing.T) {
	cases := []string{
		"ark-apiserver-7d9f8b6c5-x2x4k",
		"Host.Example.COM",
		"",
		strings.Repeat("a", 200),
	}
	for _, host := range cases {
		name := replicaSlotName(host)
		if !validSlotName.MatchString(name) {
			t.Errorf("replicaSlotName(%q) = %q, not a valid slot name", host, name)
		}
		if !strings.HasPrefix(name, walSlotName+"_") {
			t.Errorf("replicaSlotName(%q) = %q, want prefix %q", host, name, walSlotName+"_")
		}
	}
}

func TestReplicaSlotName_UniquePerCall(t *testing.T) {
	if a, b := replicaSlotName("pod-a"), replicaSlotName("pod-a"); a == b {
		t.Errorf("two calls returned the same slot name %q", a)
	}
}
