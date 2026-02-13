package routing

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func TestDiscoverBrokerEndpoints(t *testing.T) {
	tests := []struct {
		name       string
		configMaps []client.Object
		wantLen    int
		wantNS     []string
	}{
		{
			name:       "nil client returns nil",
			configMaps: nil,
			wantLen:    0,
		},
		{
			name:       "no configmaps returns empty",
			configMaps: []client.Object{},
			wantLen:    0,
		},
		{
			name: "ignores non-matching configmaps",
			configMaps: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "other-config", Namespace: "default"},
				},
			},
			wantLen: 0,
		},
		{
			name: "ignores disabled broker config",
			configMaps: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-a"},
					Data: map[string]string{
						"enabled": "false",
						"serviceRef": `name: "collector"
port: "4318"`,
					},
				},
			},
			wantLen: 0,
		},
		{
			name: "discovers enabled broker endpoint",
			configMaps: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-a"},
					Data: map[string]string{
						"enabled": "true",
						"serviceRef": `name: "collector"
port: "4318"`,
					},
				},
			},
			wantLen: 1,
			wantNS:  []string{"tenant-a"},
		},
		{
			name: "discovers multiple broker endpoints",
			configMaps: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-a"},
					Data: map[string]string{
						"enabled": "true",
						"serviceRef": `name: "collector-a"
port: "4318"`,
					},
				},
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-b"},
					Data: map[string]string{
						"enabled": "true",
						"serviceRef": `name: "collector-b"
port: "4317"`,
					},
				},
			},
			wantLen: 2,
			wantNS:  []string{"tenant-a", "tenant-b"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var k8sClient client.Client
			if tt.configMaps != nil {
				k8sClient = fake.NewClientBuilder().WithObjects(tt.configMaps...).Build()
			}

			endpoints, err := DiscoverBrokerEndpoints(context.Background(), k8sClient)
			if err != nil {
				t.Fatalf("DiscoverBrokerEndpoints() error = %v", err)
			}

			if len(endpoints) != tt.wantLen {
				t.Errorf("got %d endpoints, want %d", len(endpoints), tt.wantLen)
			}

			for i, ns := range tt.wantNS {
				if i < len(endpoints) && endpoints[i].Namespace != ns {
					t.Errorf("endpoint[%d].Namespace = %s, want %s", i, endpoints[i].Namespace, ns)
				}
			}
		})
	}
}

func TestGetBrokerConfig(t *testing.T) {
	tests := []struct {
		name        string
		namespace   string
		configMaps  []client.Object
		wantNil     bool
		wantEnabled string
	}{
		{
			name:      "nil client returns nil",
			namespace: "default",
			wantNil:   true,
		},
		{
			name:       "missing configmap returns nil",
			namespace:  "default",
			configMaps: []client.Object{},
			wantNil:    true,
		},
		{
			name:      "returns config when found",
			namespace: "tenant-a",
			configMaps: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "ark-config-broker", Namespace: "tenant-a"},
					Data: map[string]string{
						"enabled": "true",
						"serviceRef": `name: "collector"
port: "4318"`,
					},
				},
			},
			wantNil:     false,
			wantEnabled: "true",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var k8sClient client.Client
			if tt.configMaps != nil {
				k8sClient = fake.NewClientBuilder().WithObjects(tt.configMaps...).Build()
			}

			config, err := GetBrokerConfig(context.Background(), k8sClient, tt.namespace)
			if err != nil {
				t.Fatalf("GetBrokerConfig() error = %v", err)
			}

			if tt.wantNil && config != nil {
				t.Errorf("expected nil config, got %+v", config)
			}
			if !tt.wantNil && config == nil {
				t.Error("expected non-nil config, got nil")
			}
			if !tt.wantNil && config != nil && config.Enabled != tt.wantEnabled {
				t.Errorf("config.Enabled = %s, want %s", config.Enabled, tt.wantEnabled)
			}
		})
	}
}

func TestParseServiceRef(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantName string
		wantPort string
		wantErr  bool
	}{
		{
			name:     "parses name and port",
			input:    "name: \"collector\"\nport: \"4318\"",
			wantName: "collector",
			wantPort: "4318",
		},
		{
			name:     "parses without quotes",
			input:    "name: collector\nport: 4318",
			wantName: "collector",
			wantPort: "4318",
		},
		{
			name:     "handles extra whitespace",
			input:    "  name:   collector  \n  port:   4318  ",
			wantName: "collector",
			wantPort: "4318",
		},
		{
			name:    "error when name missing",
			input:   "port: 4318",
			wantErr: true,
		},
		{
			name:     "allows missing port",
			input:    "name: collector",
			wantName: "collector",
			wantPort: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ref, err := parseServiceRef(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("parseServiceRef() error = %v", err)
			}
			if ref.Name != tt.wantName {
				t.Errorf("Name = %s, want %s", ref.Name, tt.wantName)
			}
			if ref.Port != tt.wantPort {
				t.Errorf("Port = %s, want %s", ref.Port, tt.wantPort)
			}
		})
	}
}

func TestBuildEndpoint(t *testing.T) {
	tests := []struct {
		name       string
		namespace  string
		serviceRef ServiceRef
		want       string
		wantErr    bool
	}{
		{
			name:       "builds endpoint with port",
			namespace:  "tenant-a",
			serviceRef: ServiceRef{Name: "collector", Port: "4318"},
			want:       "http://collector.tenant-a.svc.cluster.local:4318",
		},
		{
			name:       "defaults empty port to 80",
			namespace:  "tenant-a",
			serviceRef: ServiceRef{Name: "collector", Port: ""},
			want:       "http://collector.tenant-a.svc.cluster.local:80",
		},
		{
			name:       "converts http to 80",
			namespace:  "tenant-a",
			serviceRef: ServiceRef{Name: "collector", Port: "http"},
			want:       "http://collector.tenant-a.svc.cluster.local:80",
		},
		{
			name:       "converts https to 443",
			namespace:  "tenant-a",
			serviceRef: ServiceRef{Name: "collector", Port: "https"},
			want:       "http://collector.tenant-a.svc.cluster.local:443",
		},
		{
			name:       "error when name empty",
			namespace:  "tenant-a",
			serviceRef: ServiceRef{Name: "", Port: "4318"},
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := buildEndpoint(tt.namespace, tt.serviceRef)
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("buildEndpoint() error = %v", err)
			}
			if got != tt.want {
				t.Errorf("got %s, want %s", got, tt.want)
			}
		})
	}
}
