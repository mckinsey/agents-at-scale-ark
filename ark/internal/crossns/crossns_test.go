package crossns

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func target(namespace string, annotations map[string]string) *metav1.ObjectMeta {
	return &metav1.ObjectMeta{Name: "m", Namespace: namespace, Annotations: annotations}
}

func TestAllowed(t *testing.T) {
	cases := []struct {
		name        string
		annotations map[string]string
		from        string
		want        bool
	}{
		{name: "no annotations", annotations: nil, from: "tenant-a", want: false},
		{name: "other annotations only", annotations: map[string]string{"foo": "tenant-a"}, from: "tenant-a", want: false},
		{name: "empty value", annotations: map[string]string{AllowedNamespacesAnnotation: ""}, from: "tenant-a", want: false},
		{name: "only separators and spaces", annotations: map[string]string{AllowedNamespacesAnnotation: " , ,"}, from: "tenant-a", want: false},
		{name: "wildcard", annotations: map[string]string{AllowedNamespacesAnnotation: "*"}, from: "tenant-a", want: true},
		{name: "wildcard with spaces", annotations: map[string]string{AllowedNamespacesAnnotation: " * "}, from: "tenant-a", want: true},
		{name: "wildcard inside list", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant-c,*"}, from: "tenant-a", want: true},
		{name: "exact match", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant-a"}, from: "tenant-a", want: true},
		{name: "match in list with whitespace", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant-c , tenant-a ,tenant-d"}, from: "tenant-a", want: true},
		{name: "not in list", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant-c,tenant-d"}, from: "tenant-a", want: false},
		{name: "no prefix match", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant"}, from: "tenant-a", want: false},
		{name: "no suffix match", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant-a-dev"}, from: "tenant-a", want: false},
		{name: "no glob patterns", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant-*"}, from: "tenant-a", want: false},
		{name: "case sensitive", annotations: map[string]string{AllowedNamespacesAnnotation: "Tenant-A"}, from: "tenant-a", want: false},
		{name: "semicolon is not a separator", annotations: map[string]string{AllowedNamespacesAnnotation: "tenant-c;tenant-a"}, from: "tenant-a", want: false},
		{name: "empty source namespace", annotations: map[string]string{AllowedNamespacesAnnotation: "*"}, from: "", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Allowed(target("tenant-b", tc.annotations), tc.from); got != tc.want {
				t.Fatalf("Allowed() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAllowedSameNamespace(t *testing.T) {
	if !Allowed(target("tenant-a", nil), "tenant-a") {
		t.Fatal("a reference within the same namespace must be allowed without the annotation")
	}
}

func TestAllowedNilTarget(t *testing.T) {
	if Allowed(nil, "tenant-a") {
		t.Fatal("a nil target must not be allowed")
	}
}

func TestAllowedTypedNilTarget(t *testing.T) {
	var target *metav1.ObjectMeta
	if Allowed(target, "tenant-a") {
		t.Fatal("a typed nil target must not be allowed")
	}
}

func TestDeniedError(t *testing.T) {
	got := DeniedError("Model", "tenant-b", "m2", "tenant-a").Error()
	want := "cross-namespace reference to Model tenant-b/m2 is not allowed: the Model must list namespace tenant-a in annotation ark.mckinsey.com/allowed-namespaces"
	if got != want {
		t.Fatalf("DeniedError() = %q, want %q", got, want)
	}
}
