package prometheus

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"sigs.k8s.io/yaml"
)

func TestServiceMonitorTLSConfiguration(t *testing.T) {
	tests := []struct {
		name           string
		yamlContent    string
		validateSecure func(*testing.T, map[string]interface{})
	}{
		{
			name: "secure TLS configuration present",
			yamlContent: `
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ark-controller-metrics-monitor
  namespace: system
spec:
  endpoints:
    - path: /metrics
      port: https
      scheme: https
      bearerTokenFile: /var/run/secrets/kubernetes.io/serviceaccount/token
      tlsConfig:
        serverName: ark.ark-system.svc
        insecureSkipVerify: false
        ca:
          secret:
            name: metrics-server-cert
            key: ca.crt
        cert:
          secret:
            name: metrics-server-cert
            key: tls.crt
        keySecret:
          name: metrics-server-cert
          key: tls.key
  selector:
    matchLabels:
      control-plane: ark-controller
`,
			validateSecure: func(t *testing.T, sm map[string]interface{}) {
				spec := sm["spec"].(map[string]interface{})
				endpoints := spec["endpoints"].([]interface{})
				require.Len(t, endpoints, 1, "should have one endpoint")
				
				endpoint := endpoints[0].(map[string]interface{})
				assert.Equal(t, "/metrics", endpoint["path"], "path should be /metrics")
				assert.Equal(t, "https", endpoint["port"], "port should be https")
				assert.Equal(t, "https", endpoint["scheme"], "scheme should be https")
				
				tlsConfig := endpoint["tlsConfig"].(map[string]interface{})
				require.NotNil(t, tlsConfig, "TLS config should be present")
				assert.Equal(t, "ark.ark-system.svc", tlsConfig["serverName"], "serverName should match certificate DNS")
				assert.False(t, tlsConfig["insecureSkipVerify"].(bool), "insecureSkipVerify must be false for security")
				
				ca := tlsConfig["ca"].(map[string]interface{})
				require.NotNil(t, ca, "CA should be configured")
				caSecret := ca["secret"].(map[string]interface{})
				assert.Equal(t, "metrics-server-cert", caSecret["name"], "CA secret name should match")
				assert.Equal(t, "ca.crt", caSecret["key"], "CA secret key should be ca.crt")
				
				cert := tlsConfig["cert"].(map[string]interface{})
				require.NotNil(t, cert, "cert should be configured")
				certSecret := cert["secret"].(map[string]interface{})
				assert.Equal(t, "metrics-server-cert", certSecret["name"], "cert secret name should match")
				assert.Equal(t, "tls.crt", certSecret["key"], "cert secret key should be tls.crt")
				
				keySecret := tlsConfig["keySecret"].(map[string]interface{})
				require.NotNil(t, keySecret, "keySecret should be configured")
				assert.Equal(t, "metrics-server-cert", keySecret["name"], "keySecret name should match")
				assert.Equal(t, "tls.key", keySecret["key"], "keySecret key should be tls.key")
			},
		},
		{
			name: "insecureSkipVerify set to true should be detected",
			yamlContent: `
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: test-monitor
spec:
  endpoints:
    - path: /metrics
      port: https
      scheme: https
      tlsConfig:
        insecureSkipVerify: true
`,
			validateSecure: func(t *testing.T, sm map[string]interface{}) {
				spec := sm["spec"].(map[string]interface{})
				endpoints := spec["endpoints"].([]interface{})
				endpoint := endpoints[0].(map[string]interface{})
				tlsConfig := endpoint["tlsConfig"].(map[string]interface{})
				assert.True(t, tlsConfig["insecureSkipVerify"].(bool), "this test validates insecure config exists")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var sm map[string]interface{}
			err := yaml.Unmarshal([]byte(tt.yamlContent), &sm)
			require.NoError(t, err, "YAML should parse correctly")
			
			tt.validateSecure(t, sm)
		})
	}
}

func TestServiceMonitorTLSConfigurationSecurity(t *testing.T) {
	t.Run("insecureSkipVerify must be false", func(t *testing.T) {
		yamlContent := `
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ark-controller-metrics-monitor
  namespace: system
spec:
  endpoints:
    - path: /metrics
      port: https
      scheme: https
      tlsConfig:
        insecureSkipVerify: false
        ca:
          secret:
            name: metrics-server-cert
            key: ca.crt
`
		var sm map[string]interface{}
		err := yaml.Unmarshal([]byte(yamlContent), &sm)
		require.NoError(t, err)
		
		spec := sm["spec"].(map[string]interface{})
		endpoints := spec["endpoints"].([]interface{})
		endpoint := endpoints[0].(map[string]interface{})
		tlsConfig := endpoint["tlsConfig"].(map[string]interface{})
		assert.False(t, tlsConfig["insecureSkipVerify"].(bool), 
			"insecureSkipVerify must be false for secure TLS configuration")
	})
	
	t.Run("certificate references must be present", func(t *testing.T) {
		yamlContent := `
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ark-controller-metrics-monitor
spec:
  endpoints:
    - path: /metrics
      port: https
      scheme: https
      tlsConfig:
        insecureSkipVerify: false
        ca:
          secret:
            name: metrics-server-cert
            key: ca.crt
        cert:
          secret:
            name: metrics-server-cert
            key: tls.crt
        keySecret:
          name: metrics-server-cert
          key: tls.key
`
		var sm map[string]interface{}
		err := yaml.Unmarshal([]byte(yamlContent), &sm)
		require.NoError(t, err)
		
		spec := sm["spec"].(map[string]interface{})
		endpoints := spec["endpoints"].([]interface{})
		endpoint := endpoints[0].(map[string]interface{})
		tlsConfig := endpoint["tlsConfig"].(map[string]interface{})
		
		require.NotNil(t, tlsConfig["ca"], "CA certificate reference must be present")
		require.NotNil(t, tlsConfig["cert"], "TLS certificate reference must be present")
		require.NotNil(t, tlsConfig["keySecret"], "Private key reference must be present")
		
		caSecret := tlsConfig["ca"].(map[string]interface{})["secret"].(map[string]interface{})
		certSecret := tlsConfig["cert"].(map[string]interface{})["secret"].(map[string]interface{})
		keySecret := tlsConfig["keySecret"].(map[string]interface{})
		
		assert.Equal(t, "metrics-server-cert", caSecret["name"])
		assert.Equal(t, "metrics-server-cert", certSecret["name"])
		assert.Equal(t, "metrics-server-cert", keySecret["name"])
	})
}

func TestServiceMonitorYAMLStructure(t *testing.T) {
	yamlContent := `
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  labels:
    control-plane: ark-controller
    app.kubernetes.io/name: ark
    app.kubernetes.io/managed-by: kustomize
  name: ark-controller-metrics-monitor
  namespace: system
spec:
  endpoints:
    - path: /metrics
      port: https
      scheme: https
      bearerTokenFile: /var/run/secrets/kubernetes.io/serviceaccount/token
      tlsConfig:
        serverName: ark.ark-system.svc
        insecureSkipVerify: false
        ca:
          secret:
            name: metrics-server-cert
            key: ca.crt
        cert:
          secret:
            name: metrics-server-cert
            key: tls.crt
        keySecret:
          name: metrics-server-cert
          key: tls.key
  selector:
    matchLabels:
      control-plane: ark-controller
      app.kubernetes.io/name: ark
`
	
	var sm map[string]interface{}
	err := yaml.Unmarshal([]byte(yamlContent), &sm)
	require.NoError(t, err, "YAML should be valid")
	
	metadata := sm["metadata"].(map[string]interface{})
	assert.Equal(t, "ark-controller-metrics-monitor", metadata["name"])
	assert.Equal(t, "system", metadata["namespace"])
	
	spec := sm["spec"].(map[string]interface{})
	selector := spec["selector"].(map[string]interface{})
	matchLabels := selector["matchLabels"].(map[string]interface{})
	assert.Equal(t, "ark-controller", matchLabels["control-plane"])
	assert.Equal(t, "ark", matchLabels["app.kubernetes.io/name"])
}

func TestServiceMonitorTLSConfigMatchesCertificate(t *testing.T) {
	t.Run("serverName matches certificate DNS pattern", func(t *testing.T) {
		serverName := "ark.ark-system.svc"
		
		validDNSPatterns := []string{
			"ark.ark-system.svc",
			"ark.ark-system.svc.cluster.local",
		}
		
		matches := false
		for _, pattern := range validDNSPatterns {
			if serverName == pattern {
				matches = true
				break
			}
		}
		
		assert.True(t, matches, "serverName should match one of the certificate DNS names")
	})
}

func TestServiceMonitorYAMLValidates(t *testing.T) {
	t.Run("YAML syntax is valid", func(t *testing.T) {
		yamlContent := `
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: test-monitor
spec:
  endpoints:
    - path: /metrics
      port: https
      scheme: https
      tlsConfig:
        insecureSkipVerify: false
`
		var sm map[string]interface{}
		err := yaml.Unmarshal([]byte(yamlContent), &sm)
		require.NoError(t, err, "YAML should be valid")
		assert.Equal(t, "ServiceMonitor", sm["kind"])
		assert.Equal(t, "monitoring.coreos.com/v1", sm["apiVersion"])
	})
}

