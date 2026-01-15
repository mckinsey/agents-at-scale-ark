/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/genai"
)

var _ = Describe("Model Webhook", func() {
	var (
		ctx       context.Context
		model     *arkv1alpha1.Model
		validator *ModelValidator
	)

	BeforeEach(func() {
		ctx = context.Background()

		// Create a fake client with scheme
		scheme := runtime.NewScheme()
		Expect(arkv1alpha1.AddToScheme(scheme)).To(Succeed())
		Expect(corev1.AddToScheme(scheme)).To(Succeed())

		fakeClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		validator = &ModelValidator{
			Client:    fakeClient,
			Resolver:  common.NewValueSourceResolver(fakeClient),
			Validator: &ResourceValidator{Client: fakeClient},
		}

		model = &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-model",
				Namespace: "default",
			},
			Spec: arkv1alpha1.ModelSpec{
				Model: arkv1alpha1.ValueSource{
					Value: "gpt-4o",
				},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{
							Value: "https://api.openai.com",
						},
						APIKey: arkv1alpha1.ValueSource{
							Value: "sk-test-key",
						},
					},
				},
			},
		}
	})

	Context("When validating models with direct values", func() {
		It("Should allow valid OpenAI model with direct values", func() {
			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow valid Azure model with direct values", func() {
			model.Spec.Provider = genai.ProviderAzure
			model.Spec.Config = arkv1alpha1.ModelConfig{
				Azure: &arkv1alpha1.AzureModelConfig{
					BaseURL: arkv1alpha1.ValueSource{
						Value: "https://myazure.openai.azure.com",
					},
					APIKey: arkv1alpha1.ValueSource{
						Value: "azure-key",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow valid Bedrock model with direct values", func() {
			model.Spec.Provider = genai.ProviderBedrock
			model.Spec.Config = arkv1alpha1.ModelConfig{
				Bedrock: &arkv1alpha1.BedrockModelConfig{
					Region: &arkv1alpha1.ValueSource{
						Value: "us-east-1",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When validating models with Secret references", func() {
		It("Should fail when referenced Secret does not exist", func() {
			model.Spec.Config.OpenAI.APIKey = arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{
							Name: "nonexistent-secret",
						},
						Key: "api-key",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("spec.config.openai.apiKey"))
			Expect(err.Error()).To(ContainSubstring("secret 'nonexistent-secret' does not exist"))
			Expect(warnings).To(BeEmpty())
		})

		It("Should fail when referenced Secret key does not exist", func() {
			// Create a Secret without the expected key
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-secret",
					Namespace: "default",
				},
				Data: map[string][]byte{
					"wrong-key": []byte("test-value"),
				},
			}
			Expect(validator.Client.Create(ctx, secret)).To(Succeed())

			model.Spec.Config.OpenAI.APIKey = arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{
							Name: "test-secret",
						},
						Key: "api-key",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("spec.config.openai.apiKey"))
			Expect(err.Error()).To(ContainSubstring("key 'api-key' not found in secret 'test-secret'"))
			Expect(warnings).To(BeEmpty())
		})

		It("Should succeed when referenced Secret and key exist", func() {
			// Create a Secret with the expected key
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-secret",
					Namespace: "default",
				},
				Data: map[string][]byte{
					"api-key": []byte("test-api-key"),
				},
			}
			Expect(validator.Client.Create(ctx, secret)).To(Succeed())

			model.Spec.Config.OpenAI.APIKey = arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{
							Name: "test-secret",
						},
						Key: "api-key",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When validating models with ConfigMap references", func() {
		It("Should fail when referenced ConfigMap does not exist", func() {
			model.Spec.Config.OpenAI.BaseURL = arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{
							Name: "nonexistent-configmap",
						},
						Key: "base-url",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("spec.config.openai.baseUrl"))
			Expect(err.Error()).To(ContainSubstring("configMap 'nonexistent-configmap' does not exist"))
			Expect(warnings).To(BeEmpty())
		})

		It("Should fail when referenced ConfigMap key does not exist", func() {
			// Create a ConfigMap without the expected key
			configMap := &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-configmap",
					Namespace: "default",
				},
				Data: map[string]string{
					"wrong-key": "test-value",
				},
			}
			Expect(validator.Client.Create(ctx, configMap)).To(Succeed())

			model.Spec.Config.OpenAI.BaseURL = arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{
							Name: "test-configmap",
						},
						Key: "base-url",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("spec.config.openai.baseUrl"))
			Expect(err.Error()).To(ContainSubstring("key 'base-url' not found in configMap 'test-configmap'"))
			Expect(warnings).To(BeEmpty())
		})

		It("Should succeed when referenced ConfigMap and key exist", func() {
			// Create a ConfigMap with the expected key
			configMap := &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-configmap",
					Namespace: "default",
				},
				Data: map[string]string{
					"base-url": "https://api.openai.com",
				},
			}
			Expect(validator.Client.Create(ctx, configMap)).To(Succeed())

			model.Spec.Config.OpenAI.BaseURL = arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{
							Name: "test-configmap",
						},
						Key: "base-url",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When validating Bedrock models with multiple ValueSource fields", func() {
		It("Should validate all Bedrock ValueSource fields", func() {
			// Create necessary Secret and ConfigMap
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "aws-secret",
					Namespace: "default",
				},
				Data: map[string][]byte{
					"access-key":    []byte("AKIAIOSFODNN7EXAMPLE"),
					"secret-key":    []byte("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
					"session-token": []byte("session-token-value"),
				},
			}
			Expect(validator.Client.Create(ctx, secret)).To(Succeed())

			configMap := &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "aws-config",
					Namespace: "default",
				},
				Data: map[string]string{
					"region":    "us-west-2",
					"model-arn": "arn:aws:bedrock:us-west-2:123456789012:model/anthropic.claude-3-sonnet-20240229-v1:0",
				},
			}
			Expect(validator.Client.Create(ctx, configMap)).To(Succeed())

			model.Spec.Provider = genai.ProviderBedrock
			model.Spec.Config = arkv1alpha1.ModelConfig{
				Bedrock: &arkv1alpha1.BedrockModelConfig{
					Region: &arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "aws-config",
								},
								Key: "region",
							},
						},
					},
					AccessKeyID: &arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "aws-secret",
								},
								Key: "access-key",
							},
						},
					},
					SecretAccessKey: &arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "aws-secret",
								},
								Key: "secret-key",
							},
						},
					},
					SessionToken: &arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "aws-secret",
								},
								Key: "session-token",
							},
						},
					},
					ModelArn: &arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "aws-config",
								},
								Key: "model-arn",
							},
						},
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When validating model field ValueSource", func() {
		It("Should validate model field with Secret reference", func() {
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "model-secret",
					Namespace: "default",
				},
				Data: map[string][]byte{
					"model-name": []byte("gpt-4o"),
				},
			}
			Expect(validator.Client.Create(ctx, secret)).To(Succeed())

			model.Spec.Model = arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{
							Name: "model-secret",
						},
						Key: "model-name",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When validating updates", func() {
		It("Should validate updates using the same logic as create", func() {
			warnings, err := validator.ValidateUpdate(ctx, model, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When provider field is missing", func() {
		It("Should reject model with empty provider", func() {
			model.Spec.Provider = ""
			model.Spec.Type = genai.ModelTypeCompletions

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("provider is required"))
			Expect(warnings).To(BeEmpty())
		})

		It("Should suggest migration when type has legacy provider value", func() {
			model.Spec.Provider = ""
			model.Spec.Type = genai.ProviderOpenAI

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("update model to migrate 'openai' from spec.type to spec.provider"))
			Expect(warnings).To(BeEmpty())
		})

		It("Should accept model with valid provider", func() {
			model.Spec.Provider = genai.ProviderOpenAI
			model.Spec.Type = genai.ModelTypeCompletions

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When model was migrated by defaulter", func() {
		It("Should return deprecation warning when migration annotation is present", func() {
			model.Annotations = map[string]string{
				annotations.MigrationWarningPrefix + "provider": "spec.type is deprecated for provider values - migrated 'openai' to spec.provider",
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(HaveLen(1))
			Expect(warnings[0]).To(ContainSubstring("spec.type is deprecated"))
			Expect(warnings[0]).To(ContainSubstring("openai"))
		})

		It("Should collect multiple migration warnings", func() {
			model.Annotations = map[string]string{
				annotations.MigrationWarningPrefix + "provider": "warning about provider",
				annotations.MigrationWarningPrefix + "other":    "warning about other thing",
			}

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(HaveLen(2))
		})

		It("Should not return warning for new format models", func() {
			model.Spec.Provider = genai.ProviderOpenAI
			model.Spec.Type = genai.ModelTypeCompletions

			warnings, err := validator.ValidateCreate(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})
})

var _ = Describe("Model Defaulter", func() {
	var (
		ctx       context.Context
		defaulter *ModelCustomDefaulter
	)

	BeforeEach(func() {
		ctx = context.Background()
		defaulter = &ModelCustomDefaulter{}
	})

	Context("When migrating old format models", func() {
		It("Should migrate openai from type to provider and add warning annotation", func() {
			model := &arkv1alpha1.Model{
				Spec: arkv1alpha1.ModelSpec{
					Type: genai.ProviderOpenAI,
				},
			}

			err := defaulter.Default(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(model.Spec.Provider).To(Equal(genai.ProviderOpenAI))
			Expect(model.Spec.Type).To(Equal(genai.ModelTypeCompletions))
			Expect(model.Annotations).To(HaveKey(annotations.MigrationWarningPrefix + "provider"))
			Expect(model.Annotations[annotations.MigrationWarningPrefix+"provider"]).To(ContainSubstring("openai"))
		})

		It("Should migrate azure from type to provider and add warning annotation", func() {
			model := &arkv1alpha1.Model{
				Spec: arkv1alpha1.ModelSpec{
					Type: genai.ProviderAzure,
				},
			}

			err := defaulter.Default(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(model.Spec.Provider).To(Equal(genai.ProviderAzure))
			Expect(model.Spec.Type).To(Equal(genai.ModelTypeCompletions))
			Expect(model.Annotations).To(HaveKey(annotations.MigrationWarningPrefix + "provider"))
			Expect(model.Annotations[annotations.MigrationWarningPrefix+"provider"]).To(ContainSubstring("azure"))
		})

		It("Should migrate bedrock from type to provider and add warning annotation", func() {
			model := &arkv1alpha1.Model{
				Spec: arkv1alpha1.ModelSpec{
					Type: genai.ProviderBedrock,
				},
			}

			err := defaulter.Default(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(model.Spec.Provider).To(Equal(genai.ProviderBedrock))
			Expect(model.Spec.Type).To(Equal(genai.ModelTypeCompletions))
			Expect(model.Annotations).To(HaveKey(annotations.MigrationWarningPrefix + "provider"))
			Expect(model.Annotations[annotations.MigrationWarningPrefix+"provider"]).To(ContainSubstring("bedrock"))
		})
	})

	Context("When handling new format models", func() {
		It("Should not modify model with provider already set", func() {
			model := &arkv1alpha1.Model{
				Spec: arkv1alpha1.ModelSpec{
					Provider: genai.ProviderAzure,
					Type:     genai.ModelTypeCompletions,
				},
			}

			err := defaulter.Default(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(model.Spec.Provider).To(Equal(genai.ProviderAzure))
			Expect(model.Spec.Type).To(Equal(genai.ModelTypeCompletions))
		})

		It("Should not modify model with non-provider type value", func() {
			model := &arkv1alpha1.Model{
				Spec: arkv1alpha1.ModelSpec{
					Provider: genai.ProviderOpenAI,
					Type:     "custom-type",
				},
			}

			err := defaulter.Default(ctx, model)
			Expect(err).NotTo(HaveOccurred())
			Expect(model.Spec.Provider).To(Equal(genai.ProviderOpenAI))
			Expect(model.Spec.Type).To(Equal("custom-type"))
		})
	})

	Context("When handling invalid input", func() {
		It("Should return error for non-Model object", func() {
			err := defaulter.Default(ctx, &corev1.ConfigMap{})
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("expected a Model object"))
		})
	})
})
