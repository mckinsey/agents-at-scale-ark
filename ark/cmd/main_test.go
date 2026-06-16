/* Copyright 2025. McKinsey & Company */

package main

import (
	"strings"
	"testing"
)

func TestValidateRole(t *testing.T) {
	cases := []struct {
		role    string
		wantErr string
	}{
		{"apiserver", ""},
		{"controller", ""},
		{"", "is required"},
		{"combined", "is invalid"},
		{"APISERVER", "is invalid"},
		{"api-server", "is invalid"},
	}
	for _, c := range cases {
		err := validateRole(c.role)
		if c.wantErr == "" {
			if err != nil {
				t.Errorf("validateRole(%q) = %v, want nil", c.role, err)
			}
			continue
		}
		if err == nil {
			t.Errorf("validateRole(%q) = nil, want error containing %q", c.role, c.wantErr)
			continue
		}
		if !strings.Contains(err.Error(), c.wantErr) {
			t.Errorf("validateRole(%q) error = %q, want substring %q", c.role, err.Error(), c.wantErr)
		}
	}
}

func TestLeaderElectionID(t *testing.T) {
	cases := []struct {
		role string
		want string
	}{
		{"apiserver", "ark-apiserver-leader"},
		{"controller", "ark-controller-leader"},
	}
	for _, c := range cases {
		got := leaderElectionID(c.role)
		if got != c.want {
			t.Errorf("leaderElectionID(%q) = %q, want %q", c.role, got, c.want)
		}
	}
}
