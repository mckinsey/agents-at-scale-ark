package controller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestAgentsToRequests(t *testing.T) {
	agents := []arkv1alpha1.Agent{
		{ObjectMeta: metav1.ObjectMeta{Name: "agent-a", Namespace: "ns1"}},
		{ObjectMeta: metav1.ObjectMeta{Name: "agent-b", Namespace: "ns2"}},
	}
	reqs := agentsToRequests(agents)
	assert.Len(t, reqs, 2)
	assert.Equal(t, "agent-a", reqs[0].Name)
	assert.Equal(t, "ns1", reqs[0].Namespace)
	assert.Equal(t, "agent-b", reqs[1].Name)
	assert.Equal(t, "ns2", reqs[1].Namespace)
}

func TestAgentsToRequests_Empty(t *testing.T) {
	reqs := agentsToRequests(nil)
	assert.Empty(t, reqs)
}

func TestFindAgentsForModel_ReturnsMatchingAgent(t *testing.T) {
	s := newTestScheme()
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "my-agent", Namespace: "default"},
		Spec:       arkv1alpha1.AgentSpec{ModelRef: &arkv1alpha1.AgentModelRef{Name: "gpt-4"}},
	}
	fakeClient := fake.NewClientBuilder().
		WithScheme(s).
		WithIndex(&arkv1alpha1.Agent{}, ".spec.modelRef.name", agentModelRefIndexer).
		WithObjects(agent).
		Build()

	r := &AgentReconciler{Client: fakeClient}
	trigger := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "gpt-4", Namespace: "default"}}

	reqs := r.findAgentsForModel(context.Background(), trigger)

	assert.Len(t, reqs, 1)
	assert.Equal(t, "my-agent", reqs[0].Name)
	assert.Equal(t, "default", reqs[0].Namespace)
}

func TestFindAgentsForTool_ReturnsMatchingAgent(t *testing.T) {
	s := newTestScheme()
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "my-agent", Namespace: "default"},
		Spec: arkv1alpha1.AgentSpec{
			Tools: []arkv1alpha1.AgentTool{{Type: "custom", Name: "weather-api"}},
		},
	}
	fakeClient := fake.NewClientBuilder().
		WithScheme(s).
		WithIndex(&arkv1alpha1.Agent{}, ".spec.tools.name", agentToolNamesIndexer).
		WithObjects(agent).
		Build()

	r := &AgentReconciler{Client: fakeClient}
	trigger := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "weather-api", Namespace: "default"}}

	reqs := r.findAgentsForTool(context.Background(), trigger)

	assert.Len(t, reqs, 1)
	assert.Equal(t, "my-agent", reqs[0].Name)
}

func TestFindAgentsForExecutionEngine_ReturnsMatchingAgent(t *testing.T) {
	s := newTestScheme()
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "my-agent", Namespace: "default"},
		Spec:       arkv1alpha1.AgentSpec{ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "my-engine"}},
	}
	fakeClient := fake.NewClientBuilder().
		WithScheme(s).
		WithIndex(&arkv1alpha1.Agent{}, ".spec.executionEngine.name", agentExecutionEngineIndexer).
		WithObjects(agent).
		Build()

	r := &AgentReconciler{Client: fakeClient}
	trigger := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "my-engine", Namespace: "default"}}

	reqs := r.findAgentsForExecutionEngine(context.Background(), trigger)

	assert.Len(t, reqs, 1)
	assert.Equal(t, "my-agent", reqs[0].Name)
}

func TestFindTeamsForAgent_ReturnsMatchingTeam(t *testing.T) {
	s := newTestScheme()
	team := &arkv1alpha1.Team{
		ObjectMeta: metav1.ObjectMeta{Name: "my-team", Namespace: "default"},
		Spec: arkv1alpha1.TeamSpec{
			Members: []arkv1alpha1.TeamMember{
				{Type: "agent", Name: "my-agent"},
			},
		},
	}
	otherTeam := &arkv1alpha1.Team{
		ObjectMeta: metav1.ObjectMeta{Name: "other-team", Namespace: "default"},
		Spec: arkv1alpha1.TeamSpec{
			Members: []arkv1alpha1.TeamMember{
				{Type: "agent", Name: "other-agent"},
			},
		},
	}
	fakeClient := fake.NewClientBuilder().
		WithScheme(s).
		WithIndex(&arkv1alpha1.Team{}, ".spec.members.agent.name", teamAgentMemberIndexer).
		WithObjects(team, otherTeam).
		Build()

	r := &TeamReconciler{Client: fakeClient}
	trigger := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "my-agent", Namespace: "default"}}

	reqs := r.findTeamsForAgent(context.Background(), trigger)

	assert.Len(t, reqs, 1)
	assert.Equal(t, "my-team", reqs[0].Name)
	assert.Equal(t, "default", reqs[0].Namespace)
}
