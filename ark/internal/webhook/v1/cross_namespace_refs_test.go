package v1

import (
	"context"
	"fmt"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/crossns"
)

var _ = Describe("Cross-namespace references through admission", Ordered, func() {
	const (
		source = "xns-source"
		target = "xns-target"
	)

	bg := context.Background()

	createNamespace := func(name string) {
		ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: name}}
		Expect(client.IgnoreAlreadyExists(k8sClient.Create(bg, ns))).To(Succeed())
	}

	createModel := func(name string, annotations map[string]string) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: target, Annotations: annotations},
			Spec: arkv1alpha1.ModelSpec{
				Provider: "openai",
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4.1-mini"},
				Config: arkv1alpha1.ModelConfig{OpenAI: &arkv1alpha1.OpenAIModelConfig{
					BaseURL: arkv1alpha1.ValueSource{Value: "https://api.openai.com/v1"},
					APIKey:  arkv1alpha1.ValueSource{Value: "unused"},
				}},
			},
		}
		Expect(k8sClient.Create(bg, model)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(bg, model) })
	}

	createMemory := func(name string, annotations map[string]string) {
		memory := &arkv1alpha1.Memory{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: target, Annotations: annotations},
			Spec:       arkv1alpha1.MemorySpec{Address: arkv1alpha1.ValueSource{Value: "http://memory.invalid"}},
		}
		Expect(k8sClient.Create(bg, memory)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(bg, memory) })
	}

	agentFor := func(name, modelName string) *arkv1alpha1.Agent {
		return &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: source},
			Spec: arkv1alpha1.AgentSpec{
				Prompt:   "p",
				ModelRef: &arkv1alpha1.AgentModelRef{Name: modelName, Namespace: target},
			},
		}
	}

	queryFor := func(name, memoryName string) *arkv1alpha1.Query {
		q := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: source},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "local-agent"},
				Memory: &arkv1alpha1.MemoryRef{Name: memoryName, Namespace: target},
			},
		}
		Expect(q.Spec.SetInputString("hello")).To(Succeed())
		return q
	}

	expectCreated := func(obj client.Object) {
		Expect(k8sClient.Create(bg, obj)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(bg, obj) })
	}

	expectDenied := func(obj client.Object, kind, name string) {
		err := k8sClient.Create(bg, obj)
		Expect(err).To(HaveOccurred())
		Expect(err.Error()).To(ContainSubstring(crossns.DeniedError(kind, target, name, source).Error()))
	}

	BeforeAll(func() {
		createNamespace(source)
		createNamespace(target)
		createModel("closed", nil)
		createModel("wildcard", map[string]string{crossns.AllowedNamespacesAnnotation: "*"})
		createModel("listed", map[string]string{crossns.AllowedNamespacesAnnotation: fmt.Sprintf("other, %s", source)})
		createMemory("closed", nil)
		createMemory("wildcard", map[string]string{crossns.AllowedNamespacesAnnotation: "*"})
		createMemory("listed", map[string]string{crossns.AllowedNamespacesAnnotation: fmt.Sprintf("other, %s", source)})
		expectCreated(&arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "local-agent", Namespace: source},
			Spec:       arkv1alpha1.AgentSpec{Prompt: "p"},
		})
	})

	Context("Agent modelRef", func() {
		It("rejects a Model without the annotation", func() {
			expectDenied(agentFor("agent-closed", "closed"), "Model", "closed")
		})

		It("rejects a missing Model with the same message", func() {
			expectDenied(agentFor("agent-missing", "missing"), "Model", "missing")
		})

		It("accepts a Model that allows every namespace", func() {
			expectCreated(agentFor("agent-wildcard", "wildcard"))
		})

		It("accepts a Model that lists the agent namespace", func() {
			expectCreated(agentFor("agent-listed", "listed"))
		})

		It("rejects an update that points an existing agent at a closed Model", func() {
			agent := agentFor("agent-retarget", "wildcard")
			expectCreated(agent)
			agent.Spec.ModelRef.Name = "closed"
			err := k8sClient.Update(bg, agent)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring(crossns.DeniedError("Model", target, "closed", source).Error()))
		})
	})

	It("keeps accepting unrelated updates after the Model withdraws the opt-in", func() {
		createModel("revoked", map[string]string{crossns.AllowedNamespacesAnnotation: "*"})
		agent := agentFor("agent-revoked", "revoked")
		expectCreated(agent)

		var model arkv1alpha1.Model
		Expect(k8sClient.Get(bg, client.ObjectKey{Namespace: target, Name: "revoked"}, &model)).To(Succeed())
		delete(model.Annotations, crossns.AllowedNamespacesAnnotation)
		Expect(k8sClient.Update(bg, &model)).To(Succeed())

		Expect(k8sClient.Get(bg, client.ObjectKeyFromObject(agent), agent)).To(Succeed())
		agent.Labels = map[string]string{"touched": "true"}
		Expect(k8sClient.Update(bg, agent)).To(Succeed())
	})

	It("keeps accepting unrelated query updates after the Memory withdraws the opt-in", func() {
		createMemory("revoked", map[string]string{crossns.AllowedNamespacesAnnotation: "*"})
		query := queryFor("query-revoked", "revoked")
		expectCreated(query)

		var memory arkv1alpha1.Memory
		Expect(k8sClient.Get(bg, client.ObjectKey{Namespace: target, Name: "revoked"}, &memory)).To(Succeed())
		delete(memory.Annotations, crossns.AllowedNamespacesAnnotation)
		Expect(k8sClient.Update(bg, &memory)).To(Succeed())

		Expect(k8sClient.Get(bg, client.ObjectKeyFromObject(query), query)).To(Succeed())
		query.Labels = map[string]string{"touched": "true"}
		Expect(k8sClient.Update(bg, query)).To(Succeed())
	})

	Context("Query memory", func() {
		It("rejects a Memory without the annotation", func() {
			expectDenied(queryFor("query-closed", "closed"), "Memory", "closed")
		})

		It("rejects a missing Memory with the same message", func() {
			expectDenied(queryFor("query-missing", "missing"), "Memory", "missing")
		})

		It("accepts a Memory that allows every namespace", func() {
			expectCreated(queryFor("query-wildcard", "wildcard"))
		})

		It("accepts a Memory that lists the query namespace", func() {
			expectCreated(queryFor("query-listed", "listed"))
		})
	})
})
