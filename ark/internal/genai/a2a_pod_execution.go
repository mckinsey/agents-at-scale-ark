/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"fmt"
	"net/http"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
)

type A2APodExecutionEngine struct {
	client   client.Client
	recorder eventing.A2aRecorder
}

func NewA2APodExecutionEngine(k8sClient client.Client, recorder eventing.A2aRecorder) *A2APodExecutionEngine {
	return &A2APodExecutionEngine{
		client:   k8sClient,
		recorder: recorder,
	}
}

func (e *A2APodExecutionEngine) Execute(
	ctx context.Context,
	agent *arkv1alpha1.Agent,
	userInput Message,
	history []Message,
	eventStream EventStreamInterface,
) (*ExecutionResult, error) {
	log := logf.FromContext(ctx)
	log.Info("executing A2A pod agent", "agent", agent.Name)

	if agent.Spec.Pod == nil || agent.Spec.Pod.Template == nil {
		return nil, fmt.Errorf("agent %s/%s missing pod template", agent.Namespace, agent.Name)
	}

	pod, err := e.createPod(ctx, agent)
	if err != nil {
		return nil, fmt.Errorf("failed to create pod: %w", err)
	}
	defer e.cleanup(ctx, pod)

	podAddress, err := e.waitForA2AReadiness(ctx, pod, agent.Spec.A2APod)
	if err != nil {
		return nil, fmt.Errorf("A2A pod not ready: %w", err)
	}

	queryName := getQueryName(ctx)
	contextID := GetA2AContextID(ctx)

	response, err := ExecuteA2AAgentWithHistory(
		ctx,
		e.client,
		podAddress,
		nil,
		agent.Namespace,
		userInput,
		history,
		agent.Name,
		queryName,
		contextID,
		e.recorder,
	)
	if err != nil {
		return nil, err
	}

	return &ExecutionResult{
		Messages:    []Message{NewAssistantMessage(response.Content)},
		A2AResponse: response,
	}, nil
}

func (e *A2APodExecutionEngine) createPod(ctx context.Context, agent *arkv1alpha1.Agent) (*corev1.Pod, error) {
	queryID := getQueryID(ctx)
	podName := fmt.Sprintf("a2a-pod-%s-%s", agent.Name, queryID[:8])

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      podName,
			Namespace: agent.Namespace,
			Labels: map[string]string{
				"ark.mckinsey.com/agent":    agent.Name,
				"ark.mckinsey.com/query":    queryID,
				"ark.mckinsey.com/pod-type": "a2a-ephemeral",
			},
		},
		Spec: agent.Spec.Pod.Template.Spec,
	}

	pod.Spec.RestartPolicy = corev1.RestartPolicyNever

	if err := e.client.Create(ctx, pod); err != nil {
		return nil, err
	}

	return pod, nil
}

func (e *A2APodExecutionEngine) waitForA2AReadiness(ctx context.Context, pod *corev1.Pod, config *arkv1alpha1.A2APodConfig) (string, error) {
	port := int32(8080)
	agentCardPath := AgentCardPathVersion3
	readinessTimeout := 60 * time.Second

	if config != nil {
		if config.Port > 0 {
			port = config.Port
		}
		if config.AgentCardPath != "" {
			agentCardPath = config.AgentCardPath
		}
		if config.ReadinessTimeout != nil {
			readinessTimeout = config.ReadinessTimeout.Duration
		}
	}

	var podIP string
	err := wait.PollUntilContextTimeout(ctx, time.Second, readinessTimeout, true, func(ctx context.Context) (bool, error) {
		var currentPod corev1.Pod
		if err := e.client.Get(ctx, client.ObjectKeyFromObject(pod), &currentPod); err != nil {
			return false, err
		}

		if currentPod.Status.Phase == corev1.PodFailed {
			return false, fmt.Errorf("pod failed")
		}

		if currentPod.Status.PodIP != "" {
			podIP = currentPod.Status.PodIP
			return true, nil
		}
		return false, nil
	})
	if err != nil {
		return "", fmt.Errorf("pod did not get IP: %w", err)
	}

	podAddress := fmt.Sprintf("http://%s:%d", podIP, port)
	agentCardURL := podAddress + agentCardPath

	httpClient := &http.Client{Timeout: 5 * time.Second}
	err = wait.PollUntilContextTimeout(ctx, time.Second, readinessTimeout, true, func(ctx context.Context) (bool, error) {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, agentCardURL, nil)
		resp, err := httpClient.Do(req)
		if err != nil {
			return false, nil
		}
		defer resp.Body.Close()
		return resp.StatusCode == http.StatusOK, nil
	})
	if err != nil {
		return "", fmt.Errorf("A2A endpoint not ready: %w", err)
	}

	return podAddress, nil
}

func (e *A2APodExecutionEngine) cleanup(ctx context.Context, pod *corev1.Pod) {
	log := logf.FromContext(ctx)
	if err := e.client.Delete(ctx, pod); err != nil {
		log.Error(err, "failed to cleanup pod", "pod", pod.Name)
	}
}
