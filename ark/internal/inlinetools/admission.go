/* Copyright 2025. McKinsey & Company */

// Package inlinetools holds the security admission decision for inline Tool
// authoring, shared by the CRD webhook and the PostgreSQL-backed API server so
// both storage backends reach the same verdict.
package inlinetools

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/apimachinery/pkg/api/equality"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// The dedicated author permission. It is deliberately not any Tool verb: holding
// tools/create must not imply the ability to introduce executable source.
const (
	AuthGroup    = "ark.mckinsey.com"
	AuthResource = "inlinetools"
	AuthVerb     = "use"
)

// EnabledEnvVar gates authoring. Absent or anything but "true" means disabled,
// so a missing value fails closed.
const EnabledEnvVar = "ARK_INLINE_TOOLS_ENABLED"

// ReviewTimeout bounds the SubjectAccessReview. A timeout is a denial.
const ReviewTimeout = 10 * time.Second

func Enabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv(EnabledEnvVar)), "true")
}

// Subject is the authenticated requester, however the calling admission path
// learned about it.
type Subject struct {
	Username string
	UID      string
	Groups   []string
	Extra    map[string]authorizationv1.ExtraValue
}

// Reviewer performs a SubjectAccessReview. Any error is a denial.
type Reviewer interface {
	Allowed(ctx context.Context, namespace string, subject Subject) (bool, string, error)
}

// Now is overridable in tests.
var Now = func() time.Time { return time.Now().UTC() }

// Admit is the single decision both backends run for a Tool write.
//
// oldTool is the stored object on update and nil on create. It matters twice: a
// metadata-only update must not require the author permission, and it must not
// be able to clear the authorship annotations either.
func Admit(ctx context.Context, tool, oldTool *arkv1alpha1.Tool, subject *Subject, reviewer Reviewer) error {
	inlineNow := tool.Spec.Type == arkv1alpha1.ToolTypeInline || tool.Spec.Inline != nil
	inlineBefore := oldTool != nil && (oldTool.Spec.Type == arkv1alpha1.ToolTypeInline || oldTool.Spec.Inline != nil)
	if !inlineNow && !inlineBefore {
		return nil
	}

	// Metadata-only update: ordinary permissions apply, and stored authorship survives.
	if oldTool != nil && equality.Semantic.DeepEqual(oldTool.Spec, tool.Spec) {
		preserveAuthorship(tool, oldTool)
		return nil
	}

	if !Enabled() {
		return fmt.Errorf("inline tool authoring is disabled: an administrator must enable inlineTools before inline tools can be created or changed")
	}
	if subject == nil || subject.Username == "" {
		return fmt.Errorf("inline tool authoring requires an authenticated user identity")
	}
	if reviewer == nil {
		return fmt.Errorf("inline tool authoring cannot be authorized: no authorization backend is available")
	}

	namespace := tool.Namespace
	if namespace == "" {
		return fmt.Errorf("inline tool authoring requires a namespace")
	}

	reviewCtx, cancel := context.WithTimeout(ctx, ReviewTimeout)
	defer cancel()

	allowed, reason, err := reviewer.Allowed(reviewCtx, namespace, *subject)
	if err != nil {
		return fmt.Errorf("inline tool authoring authorization check failed for user %q in namespace %q: %w", subject.Username, namespace, err)
	}
	if !allowed {
		msg := fmt.Sprintf("user %q is not permitted to author inline tools in namespace %q (requires %s %q on %s.%s)",
			subject.Username, namespace, AuthVerb, AuthResource, AuthResource, AuthGroup)
		if reason != "" {
			msg += ": " + reason
		}
		return fmt.Errorf("%s", msg)
	}

	stampAuthorship(tool, subject.Username)
	return nil
}

// stampAuthorship overwrites whatever the requester submitted. Audit logging can
// be switched off on the PostgreSQL backend, so this is the durable record.
func stampAuthorship(tool *arkv1alpha1.Tool, username string) {
	if tool.Annotations == nil {
		tool.Annotations = map[string]string{}
	}
	tool.Annotations[arkv1alpha1.AnnotationInlineAuthoredBy] = username
	tool.Annotations[arkv1alpha1.AnnotationInlineAuthoredAt] = Now().Format(time.RFC3339)
}

func preserveAuthorship(tool, oldTool *arkv1alpha1.Tool) {
	for _, key := range []string{arkv1alpha1.AnnotationInlineAuthoredBy, arkv1alpha1.AnnotationInlineAuthoredAt} {
		stored, ok := oldTool.Annotations[key]
		if !ok {
			continue
		}
		if tool.Annotations == nil {
			tool.Annotations = map[string]string{}
		}
		tool.Annotations[key] = stored
	}
}

// Reject is a Reviewer for installations that cannot evaluate the permission at
// all — authentication disabled, no host config. It denies rather than letting
// the write through unchecked.
func Reject(reason string) Reviewer { return rejectReviewer{reason: reason} }

type rejectReviewer struct{ reason string }

func (r rejectReviewer) Allowed(context.Context, string, Subject) (bool, string, error) {
	return false, "", fmt.Errorf("%s", r.reason)
}

// SARReviewer asks the host cluster.
type SARReviewer struct {
	Create func(ctx context.Context, sar *authorizationv1.SubjectAccessReview, opts metav1.CreateOptions) (*authorizationv1.SubjectAccessReview, error)
}

func (r *SARReviewer) Allowed(ctx context.Context, namespace string, subject Subject) (bool, string, error) {
	sar := &authorizationv1.SubjectAccessReview{
		Spec: authorizationv1.SubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace: namespace,
				Group:     AuthGroup,
				Resource:  AuthResource,
				Verb:      AuthVerb,
			},
			User:   subject.Username,
			UID:    subject.UID,
			Groups: subject.Groups,
			Extra:  subject.Extra,
		},
	}
	result, err := r.Create(ctx, sar, metav1.CreateOptions{})
	if err != nil {
		return false, "", err
	}
	if result.Status.EvaluationError != "" && !result.Status.Allowed {
		return false, result.Status.EvaluationError, nil
	}
	return result.Status.Allowed, result.Status.Reason, nil
}
