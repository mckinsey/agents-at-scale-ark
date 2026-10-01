package validation

import (
	"context"
	"testing"

	admissionv1 "k8s.io/api/admission/v1"
	authnv1 "k8s.io/api/authentication/v1"
	authzv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apiserver/pkg/authentication/user"
	apirequest "k8s.io/apiserver/pkg/endpoints/request"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type reviewCounts struct {
	ssar int // controller-capability SelfSubjectAccessReviews
	sar  int // requester SubjectAccessReviews
}

// sarClient returns a fake client whose access reviews resolve to fixed
// decisions: capabilityAllow for the controller SelfSubjectAccessReview and
// requesterAllow for the requester SubjectAccessReview.
func sarClient(t *testing.T, capabilityAllow, requesterAllow bool) (client.Client, *reviewCounts) {
	t.Helper()
	scheme := runtime.NewScheme()
	if err := authzv1.AddToScheme(scheme); err != nil {
		t.Fatalf("add authz scheme: %v", err)
	}
	counts := &reviewCounts{}
	c := fake.NewClientBuilder().WithScheme(scheme).
		WithInterceptorFuncs(interceptor.Funcs{
			Create: func(_ context.Context, _ client.WithWatch, obj client.Object, _ ...client.CreateOption) error {
				switch o := obj.(type) {
				case *authzv1.SelfSubjectAccessReview:
					counts.ssar++
					o.Status.Allowed = capabilityAllow
				case *authzv1.SubjectAccessReview:
					counts.sar++
					o.Status.Allowed = requesterAllow
				default:
					t.Fatalf("expected an access review, got %T", obj)
				}
				return nil
			},
		}).Build()
	return c, counts
}

func ctxWithUser(username string) context.Context {
	req := admission.Request{AdmissionRequest: admissionv1.AdmissionRequest{
		UserInfo: authnv1.UserInfo{Username: username, Groups: []string{"system:authenticated"}},
	}}
	return admission.NewContextWithRequest(context.Background(), req)
}

func ctxWithAPIServerUser(username string) context.Context {
	return apirequest.WithUser(context.Background(), &user.DefaultInfo{
		Name:   username,
		Groups: []string{"system:authenticated"},
	})
}

func queryWithSA(sa string) *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "tenant-a"},
		Spec:       arkv1alpha1.QuerySpec{ServiceAccount: sa},
	}
}

func assertReviewCounts(t *testing.T, counts *reviewCounts, wantSSAR, wantSAR int) {
	t.Helper()
	if counts.ssar != wantSSAR || counts.sar != wantSAR {
		t.Fatalf("expected ssar=%d sar=%d, got ssar=%d sar=%d", wantSSAR, wantSAR, counts.ssar, counts.sar)
	}
}

func TestAuthorizeQueryServiceAccount(t *testing.T) {
	t.Run("empty service account skips authorization", func(t *testing.T) {
		c, counts := sarClient(t, true, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertReviewCounts(t, counts, 0, 0)
	})

	t.Run("no admission request skips authorization", func(t *testing.T) {
		c, counts := sarClient(t, true, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(context.Background(), queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertReviewCounts(t, counts, 0, 0)
	})

	t.Run("impersonation disabled for the account is rejected before requester check", func(t *testing.T) {
		c, counts := sarClient(t, false, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("runner")); err == nil {
			t.Fatal("expected capability error")
		}
		// requester check must not run when the capability precondition denies.
		assertReviewCounts(t, counts, 1, 0)
	})

	t.Run("authorized requester with capability is accepted", func(t *testing.T) {
		c, counts := sarClient(t, true, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertReviewCounts(t, counts, 1, 1)
	})

	t.Run("unauthorized requester with capability is rejected", func(t *testing.T) {
		c, counts := sarClient(t, true, false)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("mallory"), queryWithSA("runner")); err == nil {
			t.Fatal("expected authorization error")
		}
		assertReviewCounts(t, counts, 1, 1)
	})
}

func TestAuthorizeQueryServiceAccountContexts(t *testing.T) {
	t.Run("apiserver requester runs the SAR without the capability precondition", func(t *testing.T) {
		c, counts := sarClient(t, true, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithAPIServerUser("alice"), queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// capability precondition is webhook-only; apiserver path runs the SAR only.
		assertReviewCounts(t, counts, 0, 1)
	})

	t.Run("apiserver requester without impersonate rights is rejected", func(t *testing.T) {
		c, counts := sarClient(t, true, false)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithAPIServerUser("mallory"), queryWithSA("runner")); err == nil {
			t.Fatal("expected authorization error on the apiserver path")
		}
		assertReviewCounts(t, counts, 0, 1)
	})

	t.Run("unchanged service account on update skips authorization", func(t *testing.T) {
		c, counts := sarClient(t, true, false)
		a := &ServiceAccountAuthorizer{Client: c}
		ctx := withServiceAccountAuthzSkipped(ctxWithUser("mallory"))
		if err := a.AuthorizeQueryServiceAccount(ctx, queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		assertReviewCounts(t, counts, 0, 0)
	})
}

func TestServiceAccountAuthzContextForUpdate(t *testing.T) {
	t.Run("unchanged service account skips authorization", func(t *testing.T) {
		ctx := ServiceAccountAuthzContextForUpdate(context.Background(), queryWithSA("runner"), queryWithSA("runner"))
		if !serviceAccountAuthzSkipped(ctx) {
			t.Fatal("expected authorization to be skipped for unchanged service account")
		}
	})

	t.Run("changed service account still authorizes", func(t *testing.T) {
		ctx := ServiceAccountAuthzContextForUpdate(context.Background(), queryWithSA("runner"), queryWithSA("other"))
		if serviceAccountAuthzSkipped(ctx) {
			t.Fatal("expected authorization to run when service account changes")
		}
	})

	t.Run("newly set service account still authorizes", func(t *testing.T) {
		ctx := ServiceAccountAuthzContextForUpdate(context.Background(), queryWithSA(""), queryWithSA("runner"))
		if serviceAccountAuthzSkipped(ctx) {
			t.Fatal("expected authorization to run when service account is newly set")
		}
	})
}
