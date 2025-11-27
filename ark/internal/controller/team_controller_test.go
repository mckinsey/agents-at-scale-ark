/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

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
				Recorder: record.NewFakeRecorder(10),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
		})
	})

	Context("When checking team members", func() {
		ctx := context.Background()

		It("should return false when team has no members", func() {
			reconciler := &TeamReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Recorder: record.NewFakeRecorder(10),
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
				Recorder: record.NewFakeRecorder(10),
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
				Recorder: record.NewFakeRecorder(10),
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
				Recorder: record.NewFakeRecorder(10),
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
				Recorder: record.NewFakeRecorder(10),
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
				Recorder: record.NewFakeRecorder(10),
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
