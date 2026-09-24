/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"strings"
	"testing"

	clientrest "k8s.io/client-go/rest"

	"mckinsey.com/ark/internal/inlinetools"
)

// The reviewer decides whether inline authoring can be authorized at all, so a
// missing prerequisite has to produce a denying reviewer rather than a skipped
// check.
func TestInlineReviewerDeniesWithoutRequestAuthentication(t *testing.T) {
	s := &Server{config: Config{AuthMode: AuthModeOff, RestConfig: &clientrest.Config{Host: "https://kube"}}}

	allowed, _, err := s.inlineReviewer().Allowed(context.Background(), "team-a", inlinetools.Subject{Username: "alice"})
	if allowed {
		t.Fatal("inline authoring must not be authorized without request authentication")
	}
	if err == nil || !strings.Contains(err.Error(), "requires request authentication") {
		t.Fatalf("err = %v, want an auth-mode explanation", err)
	}
}

func TestInlineReviewerDeniesWithoutHostConfig(t *testing.T) {
	s := &Server{config: Config{AuthMode: AuthModeDelegated}}

	allowed, _, err := s.inlineReviewer().Allowed(context.Background(), "team-a", inlinetools.Subject{Username: "alice"})
	if allowed {
		t.Fatal("inline authoring must not be authorized without a host cluster to ask")
	}
	if err == nil || !strings.Contains(err.Error(), "no host cluster config") {
		t.Fatalf("err = %v, want a missing-host-config explanation", err)
	}
}

func TestInlineReviewerDeniesWhenTheClientCannotBeBuilt(t *testing.T) {
	// An unparseable host is the reachable way to fail client construction.
	s := &Server{config: Config{AuthMode: AuthModeDelegated, RestConfig: &clientrest.Config{Host: "://bad host"}}}

	allowed, _, err := s.inlineReviewer().Allowed(context.Background(), "team-a", inlinetools.Subject{Username: "alice"})
	if allowed {
		t.Fatal("inline authoring must not be authorized when the client cannot be built")
	}
	if err == nil || !strings.Contains(err.Error(), "cannot be authorized") {
		t.Fatalf("err = %v, want a client-construction explanation", err)
	}
}

func TestInlineReviewerAsksTheHostClusterWhenConfigured(t *testing.T) {
	s := &Server{config: Config{AuthMode: AuthModeDelegated, RestConfig: &clientrest.Config{Host: "https://kube.example"}}}

	if _, ok := s.inlineReviewer().(*inlinetools.SARReviewer); !ok {
		t.Fatalf("reviewer = %T, want a SubjectAccessReview reviewer", s.inlineReviewer())
	}
}
