package resolution

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestResolveQueryInputText(t *testing.T) {
	tests := []struct {
		name    string
		query   arkv1alpha1.Query
		objects []client.Object
		want    string
		wantErr bool
	}{
		{
			name:  "type=user with plain input",
			query: makeQuery("user", jsonStr("hello world"), nil),
			want:  "hello world",
		},
		{
			name:  "type empty defaults to user",
			query: makeQuery("", jsonStr("default user"), nil),
			want:  "default user",
		},
		{
			name: "type=user with parameter substitution",
			query: makeQuery("user", jsonStr("hello {{.name}}"), []arkv1alpha1.Parameter{
				{Name: "name", Value: "Alice"},
			}),
			want: "hello Alice",
		},
		{
			name: "type=user with configmap parameter",
			query: makeQuery("user", jsonStr("key={{.apiKey}}"), []arkv1alpha1.Parameter{
				{Name: "apiKey", ValueFrom: &arkv1alpha1.ValueFromSource{
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "my-cm"},
						Key:                  "key",
					},
				}},
			}),
			objects: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "my-cm", Namespace: "default"},
					Data:       map[string]string{"key": "cm-value"},
				},
			},
			want: "key=cm-value",
		},
		{
			name: "type=user with secret parameter",
			query: makeQuery("user", jsonStr("token={{.secret}}"), []arkv1alpha1.Parameter{
				{Name: "secret", ValueFrom: &arkv1alpha1.ValueFromSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "my-secret"},
						Key:                  "token",
					},
				}},
			}),
			objects: []client.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: "my-secret", Namespace: "default"},
					Data:       map[string][]byte{"token": []byte("s3cret")},
				},
			},
			want: "token=s3cret",
		},
		{
			name:  "type=messages extracts first user text (string content)",
			query: makeQuery("messages", messagesJSON([]msg{{Role: "system", Content: "sys"}, {Role: "user", Content: "the question"}}), nil),
			want:  "the question",
		},
		{
			name:  "type=messages skips non-user messages",
			query: makeQuery("messages", messagesJSON([]msg{{Role: "assistant", Content: "hi"}, {Role: "user", Content: "found it"}}), nil),
			want:  "found it",
		},
		{
			name:  "type=messages empty array",
			query: makeQuery("messages", json.RawMessage(`[]`), nil),
			want:  "",
		},
		{
			name:    "malformed input returns error",
			query:   makeQuery("user", json.RawMessage(`{bad json`), nil),
			wantErr: true,
		},
		{
			name:  "type=messages with no user message",
			query: makeQuery("messages", messagesJSON([]msg{{Role: "assistant", Content: "only me"}}), nil),
			want:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			got, err := ResolveQueryInputText(context.Background(), tt.query, fakeClient)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestExtractFirstUserText(t *testing.T) {
	tests := []struct {
		name string
		raw  []byte
		want string
	}{
		{
			name: "string content",
			raw:  []byte(`[{"role":"user","content":"hello"}]`),
			want: "hello",
		},
		{
			name: "array content parts",
			raw:  []byte(`[{"role":"user","content":[{"type":"text","text":"from parts"}]}]`),
			want: "from parts",
		},
		{
			name: "skips non-user",
			raw:  []byte(`[{"role":"system","content":"sys"},{"role":"user","content":"found"}]`),
			want: "found",
		},
		{
			name: "empty array",
			raw:  []byte(`[]`),
			want: "",
		},
		{
			name: "nil input",
			raw:  nil,
			want: "",
		},
		{
			name: "no user message",
			raw:  []byte(`[{"role":"assistant","content":"only assistant"}]`),
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ExtractFirstUserText(tt.raw)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestResolveParameters(t *testing.T) {
	tests := []struct {
		name    string
		params  []arkv1alpha1.Parameter
		objects []client.Object
		want    map[string]string
		wantErr bool
	}{
		{
			name: "inline values",
			params: []arkv1alpha1.Parameter{
				{Name: "a", Value: "1"},
				{Name: "b", Value: "2"},
			},
			want: map[string]string{"a": "1", "b": "2"},
		},
		{
			name: "configmap value",
			params: []arkv1alpha1.Parameter{
				{Name: "key", ValueFrom: &arkv1alpha1.ValueFromSource{
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "cm"},
						Key:                  "k",
					},
				}},
			},
			objects: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "cm", Namespace: "default"},
					Data:       map[string]string{"k": "v"},
				},
			},
			want: map[string]string{"key": "v"},
		},
		{
			name: "missing valueFrom errors",
			params: []arkv1alpha1.Parameter{
				{Name: "bad"},
			},
			wantErr: true,
		},
		{
			name: "unsupported valueFrom source errors",
			params: []arkv1alpha1.Parameter{
				{Name: "qp", ValueFrom: &arkv1alpha1.ValueFromSource{
					QueryParameterRef: &arkv1alpha1.QueryParameterReference{Name: "x"},
				}},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			got, err := ResolveParameters(context.Background(), fakeClient, "default", tt.params)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestResolveQueryInput(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		params []arkv1alpha1.Parameter
		want   string
	}{
		{
			name:  "no parameters returns input unchanged",
			input: "plain text",
			want:  "plain text",
		},
		{
			name:  "template substitution",
			input: "Hello {{.who}}!",
			params: []arkv1alpha1.Parameter{
				{Name: "who", Value: "World"},
			},
			want: "Hello World!",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(nil)
			got, err := ResolveQueryInput(context.Background(), fakeClient, "default", tt.input, tt.params)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

type msg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func messagesJSON(msgs []msg) json.RawMessage {
	b, _ := json.Marshal(msgs)
	return b
}

func jsonStr(s string) json.RawMessage {
	b, _ := json.Marshal(s)
	return b
}

func makeQuery(queryType string, input json.RawMessage, params []arkv1alpha1.Parameter) arkv1alpha1.Query {
	return arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "default",
		},
		Spec: arkv1alpha1.QuerySpec{
			Type:       queryType,
			Input:      runtime.RawExtension{Raw: input},
			Parameters: params,
		},
	}
}
