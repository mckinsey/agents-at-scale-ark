package validation

import (
	"context"
	"testing"

	admissionv1 "k8s.io/api/admission/v1"
	authnv1 "k8s.io/api/authentication/v1"
	authzv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
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

func ctxWithUser(user string) context.Context {
	req := admission.Request{AdmissionRequest: admissionv1.AdmissionRequest{
		UserInfo: authnv1.UserInfo{Username: user, Groups: []string{"system:authenticated"}},
	}}
	return admission.NewContextWithRequest(context.Background(), req)
}

func queryWithSA(sa string) *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "tenant-a"},
		Spec:       arkv1alpha1.QuerySpec{ServiceAccount: sa},
	}
}

func TestAuthorizeQueryServiceAccount(t *testing.T) {
	t.Run("empty service account skips authorization", func(t *testing.T) {
		c, counts := sarClient(t, true, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if counts.ssar != 0 || counts.sar != 0 {
			t.Fatalf("expected no reviews, got ssar=%d sar=%d", counts.ssar, counts.sar)
		}
	})

	t.Run("no admission request skips authorization", func(t *testing.T) {
		c, counts := sarClient(t, true, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(context.Background(), queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if counts.ssar != 0 || counts.sar != 0 {
			t.Fatalf("expected no reviews, got ssar=%d sar=%d", counts.ssar, counts.sar)
		}
	})

	t.Run("impersonation disabled for the account is rejected before requester check", func(t *testing.T) {
		c, counts := sarClient(t, false, true)
		a := &ServiceAccountAuthorizer{Client: c}
		err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("runner"))
		if err == nil {
			t.Fatal("expected capability error")
		}
		if counts.ssar != 1 {
			t.Fatalf("expected 1 SelfSubjectAccessReview, got %d", counts.ssar)
		}
		if counts.sar != 0 {
			t.Fatalf("requester check must not run when capability is denied, got sar=%d", counts.sar)
		}
	})

	t.Run("authorized requester with capability is accepted", func(t *testing.T) {
		c, counts := sarClient(t, true, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if counts.ssar != 1 || counts.sar != 1 {
			t.Fatalf("expected ssar=1 sar=1, got ssar=%d sar=%d", counts.ssar, counts.sar)
		}
	})

	t.Run("unauthorized requester with capability is rejected", func(t *testing.T) {
		c, counts := sarClient(t, true, false)
		a := &ServiceAccountAuthorizer{Client: c}
		err := a.AuthorizeQueryServiceAccount(ctxWithUser("mallory"), queryWithSA("runner"))
		if err == nil {
			t.Fatal("expected authorization error")
		}
		if counts.ssar != 1 || counts.sar != 1 {
			t.Fatalf("expected ssar=1 sar=1, got ssar=%d sar=%d", counts.ssar, counts.sar)
		}
	})
}
