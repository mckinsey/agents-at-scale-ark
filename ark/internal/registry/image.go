package registry

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	corev1 "k8s.io/api/core/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

const (
	LabelConfigSchema = "ark.mckinsey.com/config-schema"
	LabelDescription  = "ark.mckinsey.com/description"
	LabelIsAgentic    = "ark.mckinsey.com/is-agentic"
)

type ImageMetadata struct {
	ConfigSchema string
	Description  string
	IsAgentic    *bool
	Labels       map[string]string
}

type ImageClient struct {
	k8sClient client.Client
}

func NewImageClient(k8sClient client.Client) *ImageClient {
	return &ImageClient{k8sClient: k8sClient}
}

func (c *ImageClient) GetImageMetadata(ctx context.Context, imageRef, namespace string, imagePullSecrets []corev1.LocalObjectReference) (*ImageMetadata, error) {
	ref, err := name.ParseReference(imageRef)
	if err != nil {
		return nil, fmt.Errorf("failed to parse image reference %q: %w", imageRef, err)
	}

	options := []remote.Option{
		remote.WithContext(ctx),
	}

	keychain, err := c.buildKeychain(ctx, namespace, imagePullSecrets)
	if err != nil {
		return nil, fmt.Errorf("failed to build keychain: %w", err)
	}
	if keychain != nil {
		options = append(options, remote.WithAuthFromKeychain(keychain))
	} else {
		options = append(options, remote.WithAuthFromKeychain(authn.DefaultKeychain))
	}

	desc, err := remote.Get(ref, options...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch image manifest: %w", err)
	}

	img, err := desc.Image()
	if err != nil {
		return nil, fmt.Errorf("failed to get image from descriptor: %w", err)
	}

	configFile, err := img.ConfigFile()
	if err != nil {
		return nil, fmt.Errorf("failed to get image config: %w", err)
	}

	labels := configFile.Config.Labels
	if labels == nil {
		labels = make(map[string]string)
	}

	metadata := &ImageMetadata{
		Labels: labels,
	}

	if schema, ok := labels[LabelConfigSchema]; ok {
		metadata.ConfigSchema = schema
	}

	if desc, ok := labels[LabelDescription]; ok {
		metadata.Description = desc
	}

	if isAgenticStr, ok := labels[LabelIsAgentic]; ok {
		isAgentic := strings.ToLower(isAgenticStr) == "true"
		metadata.IsAgentic = &isAgentic
	}

	return metadata, nil
}

func (c *ImageClient) buildKeychain(ctx context.Context, namespace string, imagePullSecrets []corev1.LocalObjectReference) (authn.Keychain, error) {
	if len(imagePullSecrets) == 0 {
		return nil, nil
	}

	var keychains []authn.Keychain

	for _, secretRef := range imagePullSecrets {
		var secret corev1.Secret
		if err := c.k8sClient.Get(ctx, client.ObjectKey{
			Namespace: namespace,
			Name:      secretRef.Name,
		}, &secret); err != nil {
			return nil, fmt.Errorf("failed to get imagePullSecret %q: %w", secretRef.Name, err)
		}

		keychain, err := keychainFromSecret(&secret)
		if err != nil {
			return nil, fmt.Errorf("failed to create keychain from secret %q: %w", secretRef.Name, err)
		}
		if keychain != nil {
			keychains = append(keychains, keychain)
		}
	}

	if len(keychains) == 0 {
		return nil, nil
	}

	return authn.NewMultiKeychain(keychains...), nil
}

func keychainFromSecret(secret *corev1.Secret) (authn.Keychain, error) {
	switch secret.Type {
	case corev1.SecretTypeDockerConfigJson:
		return keychainFromDockerConfigJson(secret.Data[corev1.DockerConfigJsonKey])
	case corev1.SecretTypeDockercfg:
		return keychainFromDockercfg(secret.Data[corev1.DockerConfigKey])
	default:
		return nil, nil
	}
}

type dockerConfigJSON struct {
	Auths map[string]dockerAuthConfig `json:"auths"`
}

type dockerAuthConfig struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Auth     string `json:"auth"`
}

func keychainFromDockerConfigJson(data []byte) (authn.Keychain, error) {
	var config dockerConfigJSON
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal docker config json: %w", err)
	}

	return &staticKeychain{auths: config.Auths}, nil
}

func keychainFromDockercfg(data []byte) (authn.Keychain, error) {
	var auths map[string]dockerAuthConfig
	if err := json.Unmarshal(data, &auths); err != nil {
		return nil, fmt.Errorf("failed to unmarshal dockercfg: %w", err)
	}

	return &staticKeychain{auths: auths}, nil
}

type staticKeychain struct {
	auths map[string]dockerAuthConfig
}

func (k *staticKeychain) Resolve(resource authn.Resource) (authn.Authenticator, error) {
	registry := resource.RegistryStr()

	for registryURL, auth := range k.auths {
		registryURL = strings.TrimPrefix(registryURL, "https://")
		registryURL = strings.TrimPrefix(registryURL, "http://")
		registryURL = strings.TrimSuffix(registryURL, "/")

		if registryURL == registry || strings.HasPrefix(registry, registryURL) {
			return resolveAuth(auth)
		}
	}

	return authn.Anonymous, nil
}

func resolveAuth(auth dockerAuthConfig) (authn.Authenticator, error) {
	if auth.Auth != "" {
		decoded, err := base64.StdEncoding.DecodeString(auth.Auth)
		if err != nil {
			return nil, fmt.Errorf("failed to decode auth: %w", err)
		}
		parts := strings.SplitN(string(decoded), ":", 2)
		if len(parts) == 2 {
			return authn.FromConfig(authn.AuthConfig{
				Username: parts[0],
				Password: parts[1],
			}), nil
		}
	}

	if auth.Username != "" && auth.Password != "" {
		return authn.FromConfig(authn.AuthConfig{
			Username: auth.Username,
			Password: auth.Password,
		}), nil
	}

	return authn.Anonymous, nil
}
