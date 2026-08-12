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

func sarClient(t *testing.T, allow bool) (client.Client, *int) {
	t.Helper()
	scheme := runtime.NewScheme()
	if err := authzv1.AddToScheme(scheme); err != nil {
		t.Fatalf("add authz scheme: %v", err)
	}
	created := 0
	c := fake.NewClientBuilder().WithScheme(scheme).
		WithInterceptorFuncs(interceptor.Funcs{
			Create: func(_ context.Context, _ client.WithWatch, obj client.Object, _ ...client.CreateOption) error {
				sar, ok := obj.(*authzv1.SubjectAccessReview)
				if !ok {
					t.Fatalf("expected SubjectAccessReview, got %T", obj)
				}
				created++
				sar.Status.Allowed = allow
				return nil
			},
		}).Build()
	return c, &created
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
		c, created := sarClient(t, false)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if *created != 0 {
			t.Fatalf("expected no SubjectAccessReview, got %d", *created)
		}
	})

	t.Run("no admission request skips authorization", func(t *testing.T) {
		c, created := sarClient(t, false)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(context.Background(), queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if *created != 0 {
			t.Fatalf("expected no SubjectAccessReview, got %d", *created)
		}
	})

	t.Run("authorized requester is accepted", func(t *testing.T) {
		c, created := sarClient(t, true)
		a := &ServiceAccountAuthorizer{Client: c}
		if err := a.AuthorizeQueryServiceAccount(ctxWithUser("alice"), queryWithSA("runner")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if *created != 1 {
			t.Fatalf("expected 1 SubjectAccessReview, got %d", *created)
		}
	})

	t.Run("unauthorized requester is rejected", func(t *testing.T) {
		c, _ := sarClient(t, false)
		a := &ServiceAccountAuthorizer{Client: c}
		err := a.AuthorizeQueryServiceAccount(ctxWithUser("mallory"), queryWithSA("runner"))
		if err == nil {
			t.Fatal("expected authorization error")
		}
	})
}
