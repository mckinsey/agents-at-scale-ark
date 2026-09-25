/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	eventmock "mckinsey.com/ark/internal/eventing/mock"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	eventrecorder "mckinsey.com/ark/internal/eventing/recorder"
)

// teamEventProvider is a test eventing.Provider whose TeamRecorder captures
// emitted events in a mock emitter, so specs can assert the controller actually
// emits (the noop provider silently discards). Other recorders are unused here.
type teamEventProvider struct {
	emitter  *eventmock.MockEventEmitter
	recorder eventing.TeamRecorder
}

func newTeamEventProvider() *teamEventProvider {
	e := eventmock.NewMockEventEmitter()
	return &teamEventProvider{emitter: e, recorder: eventrecorder.NewTeamRecorder(e, e)}
}

func (p *teamEventProvider) TeamRecorder() eventing.TeamRecorder { return p.recorder }

func (p *teamEventProvider) ModelRecorder() eventing.ModelRecorder { return nil }

func (p *teamEventProvider) A2aRecorder() eventing.A2aRecorder { return nil }

func (p *teamEventProvider) AgentRecorder() eventing.AgentRecorder { return nil }

func (p *teamEventProvider) ExecutionEngineRecorder() eventing.ExecutionEngineRecorder { return nil }

func (p *teamEventProvider) MCPServerRecorder() eventing.MCPServerRecorder { return nil }

func (p *teamEventProvider) QueryRecorder() eventing.QueryRecorder { return nil }

func (p *teamEventProvider) ToolRecorder() eventing.ToolRecorder { return nil }

func (p *teamEventProvider) MemoryRecorder() eventing.MemoryRecorder { return nil }

var _ = Describe("Team Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		team := &arkv1alpha1.Team{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind Team")
			err := k8sClient.Get(ctx, typeNamespacedName, team)
			if err != nil && errors.IsNotFound(err) {
				resource := &arkv1alpha1.Team{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.TeamSpec{
						Members: []arkv1alpha1.TeamMember{
							{Name: "test-agent", Type: "agent"},
						},
						Strategy: "sequential",
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			// TODO(user): Cleanup logic after each test, like removing the resource instance.
			resource := &arkv1alpha1.Team{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the specific resource instance Team")
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})
		It("should successfully reconcile the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("emits TeamCreated then StatusChanged across reconciles", func() {
			events := newTeamEventProvider()
			controllerReconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: events,
			}

			By("first reconcile initializes conditions and emits TeamCreated")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
			Expect(err).NotTo(HaveOccurred())

			By("second reconcile flips availability for the missing member and emits StatusChanged")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
			Expect(err).NotTo(HaveOccurred())

			updated := &arkv1alpha1.Team{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, updated)).To(Succeed())
			cond := meta.FindStatusCondition(updated.Status.Conditions, TeamAvailable)
			Expect(cond).NotTo(BeNil())
			Expect(cond.Reason).To(Equal("MemberNotFound"))

			By("asserting the controller actually emitted both events (would fail if either emit call is dropped)")
			reasons := make([]string, 0)
			for _, e := range events.emitter.GetEvents() {
				reasons = append(reasons, e.Reason)
			}
			Expect(reasons).To(ContainElements("TeamCreated", "StatusChanged"))
		})
	})

	Context("When checking team members", func() {
		ctx := context.Background()

		It("should return false when team has no members", func() {
			reconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "team-no-members",
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Members:  []arkv1alpha1.TeamMember{},
					Strategy: "sequential",
				},
			}

			available, reason, message := reconciler.checkMembers(ctx, team)

			Expect(available).To(BeFalse())
			Expect(reason).To(Equal("NoMembers"))
			Expect(message).To(Equal("Team has no members configured"))
		})

		//nolint:dupl
		It("should return true when all agent members are available", func() {
			reconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			agentName := "available-agent"
			teamName := "team-with-available-agent"

			agent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      agentName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{Name: "test-model"},
					Prompt:   "test prompt",
				},
			}
			Expect(k8sClient.Create(ctx, agent)).To(Succeed())
			agent.Status.Conditions = []metav1.Condition{
				{
					Type:               AgentAvailable,
					Status:             metav1.ConditionTrue,
					Reason:             "Available",
					LastTransitionTime: metav1.Now(),
				},
			}
			Expect(k8sClient.Status().Update(ctx, agent)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, agent)).To(Succeed())
			}()

			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      teamName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Members: []arkv1alpha1.TeamMember{
						{Name: agentName, Type: "agent"},
					},
					Strategy: "sequential",
				},
			}

			available, reason, message := reconciler.checkMembers(ctx, team)

			Expect(available).To(BeTrue())
			Expect(reason).To(Equal("Available"))
			Expect(message).To(Equal("All team members are available"))
		})

		It("should return false when agent member is not found", func() {
			reconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			teamName := "team-with-missing-agent"

			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      teamName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Members: []arkv1alpha1.TeamMember{
						{Name: "non-existent-agent", Type: "agent"},
					},
					Strategy: "sequential",
				},
			}

			available, reason, message := reconciler.checkMembers(ctx, team)

			Expect(available).To(BeFalse())
			Expect(reason).To(Equal("MemberNotFound"))
			Expect(message).To(Equal("Agent member non-existent-agent not found"))
		})

		It("should return false when agent member has no availability condition", func() {
			reconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			agentName := "agent-no-condition"
			teamName := "team-with-agent-no-condition"

			agent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      agentName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{Name: "test-model"},
					Prompt:   "test prompt",
				},
			}
			Expect(k8sClient.Create(ctx, agent)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, agent)).To(Succeed())
			}()

			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      teamName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Members: []arkv1alpha1.TeamMember{
						{Name: agentName, Type: "agent"},
					},
					Strategy: "sequential",
				},
			}

			available, reason, message := reconciler.checkMembers(ctx, team)

			Expect(available).To(BeFalse())
			Expect(reason).To(Equal("MemberNotAvailable"))
			Expect(message).To(Equal("Agent member agent-no-condition is not available"))
		})

		//nolint:dupl
		It("should return false when agent member is not available", func() {
			reconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			agentName := "unavailable-agent"
			teamName := "team-with-unavailable-agent"

			agent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      agentName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{Name: "test-model"},
					Prompt:   "test prompt",
				},
			}
			Expect(k8sClient.Create(ctx, agent)).To(Succeed())
			agent.Status.Conditions = []metav1.Condition{
				{
					Type:               AgentAvailable,
					Status:             metav1.ConditionFalse,
					Reason:             "ModelNotFound",
					LastTransitionTime: metav1.Now(),
				},
			}
			Expect(k8sClient.Status().Update(ctx, agent)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, agent)).To(Succeed())
			}()

			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      teamName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Members: []arkv1alpha1.TeamMember{
						{Name: agentName, Type: "agent"},
					},
					Strategy: "sequential",
				},
			}

			available, reason, message := reconciler.checkMembers(ctx, team)

			Expect(available).To(BeFalse())
			Expect(reason).To(Equal("MemberNotAvailable"))
			Expect(message).To(Equal("Agent member unavailable-agent is not available"))
		})

		It("should check multiple agent members correctly", func() {
			reconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			agent1Name := "agent-one"
			agent2Name := "agent-two"
			teamName := "team-with-multiple-agents"

			agent1 := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      agent1Name,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{Name: "test-model"},
					Prompt:   "test prompt",
				},
			}
			Expect(k8sClient.Create(ctx, agent1)).To(Succeed())
			agent1.Status.Conditions = []metav1.Condition{
				{
					Type:               AgentAvailable,
					Status:             metav1.ConditionTrue,
					Reason:             "Available",
					LastTransitionTime: metav1.Now(),
				},
			}
			Expect(k8sClient.Status().Update(ctx, agent1)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, agent1)).To(Succeed())
			}()

			agent2 := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      agent2Name,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{Name: "test-model"},
					Prompt:   "test prompt",
				},
			}
			Expect(k8sClient.Create(ctx, agent2)).To(Succeed())
			agent2.Status.Conditions = []metav1.Condition{
				{
					Type:               AgentAvailable,
					Status:             metav1.ConditionFalse,
					Reason:             "ModelNotFound",
					LastTransitionTime: metav1.Now(),
				},
			}
			Expect(k8sClient.Status().Update(ctx, agent2)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, agent2)).To(Succeed())
			}()

			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      teamName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Members: []arkv1alpha1.TeamMember{
						{Name: agent1Name, Type: "agent"},
						{Name: agent2Name, Type: "agent"},
					},
					Strategy: "sequential",
				},
			}

			available, reason, message := reconciler.checkMembers(ctx, team)

			Expect(available).To(BeFalse())
			Expect(reason).To(Equal("MemberNotAvailable"))
			Expect(message).To(Equal("Agent member agent-two is not available"))
		})
	})
})

var _ = Describe("Team Controller IsNotFound", func() {
	ctx := context.Background()

	It("should not error when updating status of a deleted team", func() {
		const deletedTeamName = "test-deleted-status-team"

		deletedTeam := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      deletedTeamName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.TeamSpec{
				Members:  []arkv1alpha1.TeamMember{{Name: "agent-one", Type: "agent"}},
				Strategy: "sequential",
			},
		}
		Expect(k8sClient.Create(ctx, deletedTeam)).To(Succeed())

		controllerReconciler := &TeamReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		By("reconciling to initialize status")
		_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{Name: deletedTeamName, Namespace: "default"},
		})
		Expect(err).NotTo(HaveOccurred())

		By("deleting the team")
		Expect(k8sClient.Delete(ctx, deletedTeam)).To(Succeed())

		By("calling updateStatus on the deleted team should not error")
		Expect(controllerReconciler.updateStatus(ctx, deletedTeam)).To(Succeed())
	})
})
