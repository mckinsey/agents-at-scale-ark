/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	a2aclient "trpc.group/trpc-go/trpc-a2a-go/client"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/resolution"
)

const defaultA2ADiscoveryTimeoutSeconds = 30

func getA2ADiscoveryTimeout() time.Duration {
	if timeoutStr := os.Getenv("ARK_A2A_DISCOVERY_TIMEOUT"); timeoutStr != "" {
		if timeoutSec, err := strconv.Atoi(timeoutStr); err == nil && timeoutSec > 0 {
			logf.Log.V(1).Info("Using custom A2A discovery timeout", "seconds", timeoutSec)
			return time.Duration(timeoutSec) * time.Second
		}
	}
	return defaultA2ADiscoveryTimeoutSeconds * time.Second
}

// Query extension spec: ark/api/extensions/query/v1/
const (
	QueryExtensionURI         = "https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1"
	QueryExtensionMetadataKey = QueryExtensionURI + "/ref"
)

const (
	AgentCardPathVersion2 = "/.well-known/agent.json"
	AgentCardPathVersion3 = "/.well-known/agent-card.json"
)

type A2AResponse struct {
	Content   string
	ContextID string
	TaskID    string
}

func DiscoverA2AAgents(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace string) (*A2AAgentCard, error) {
	return DiscoverA2AAgentsWithRecorder(ctx, k8sClient, address, headers, namespace, nil, nil)
}

func DiscoverA2AAgentsWithRecorder(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace string, a2aRecorder eventing.A2aRecorder, obj client.Object) (*A2AAgentCard, error) {
	baseURL := strings.TrimSuffix(address, "/")

	if err := validateA2AClient(address, headers, ctx, k8sClient, namespace); err != nil {
		return nil, err
	}

	endpoints := []struct {
		url     string
		version string
	}{
		{baseURL + AgentCardPathVersion3, "protocol version 0.3.x"},
		{baseURL + AgentCardPathVersion2, "protocol version 0.2.x"},
	}

	var lastErr error
	for _, endpoint := range endpoints {
		req, err := createA2ARequest(ctx, endpoint.url, headers, k8sClient, namespace)
		if err != nil {
			lastErr = err
			continue
		}

		agentCard, err := executeA2ARequest(ctx, req, a2aRecorder)
		if err == nil {
			return agentCard, nil
		}

		lastErr = err
	}

	return nil, fmt.Errorf("failed to discover agent from all endpoints (%s, %s): %w",
		AgentCardPathVersion3, AgentCardPathVersion2, lastErr)
}

func ExecuteA2AAgent(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace, input, agentName, queryName, contextID string, a2aRecorder eventing.A2aRecorder, obj client.Object) (*A2AResponse, error) {
	rpcURL := strings.TrimSuffix(address, "/")

	a2aClient, err := CreateA2AClient(ctx, k8sClient, rpcURL, headers, namespace, agentName, a2aRecorder)
	if err != nil {
		return nil, err
	}

	return executeA2AAgentMessage(ctx, k8sClient, a2aClient, input, agentName, namespace, queryName, contextID, obj, a2aRecorder)
}

func CreateA2AClient(ctx context.Context, k8sClient client.Client, rpcURL string, headers []arkv1prealpha1.Header, namespace, agentName string, a2aRecorder eventing.A2aRecorder) (*a2aclient.A2AClient, error) {
	timeout := 5 * time.Minute
	if deadline, ok := ctx.Deadline(); ok {
		timeout = time.Until(deadline)
	}

	httpClient := &http.Client{
		Timeout: timeout,
		Transport: otelhttp.NewTransport(http.DefaultTransport,
			otelhttp.WithSpanNameFormatter(func(_ string, _ *http.Request) string {
				return "a2a.send"
			}),
		),
	}

	var clientOptions []a2aclient.Option
	clientOptions = append(clientOptions, a2aclient.WithHTTPClient(httpClient))

	if len(headers) > 0 {
		resolvedHeaders, err := resolveA2AHeaders(ctx, k8sClient, headers, namespace)
		if err != nil {
			if a2aRecorder != nil {
				a2aRecorder.A2AHeaderResolutionFailed(ctx, fmt.Sprintf("failed to resolve A2A headers: %v", err))
			}
			return nil, err
		}

		clientOptions = append(clientOptions, a2aclient.WithHTTPReqHandler(&customA2ARequestHandler{
			headers: resolvedHeaders,
		}))
	}

	a2aClient, err := a2aclient.NewA2AClient(rpcURL, clientOptions...)
	if err != nil {
		return nil, fmt.Errorf("failed to create A2A client: %w", err)
	}
	return a2aClient, nil
}

func executeA2AAgentMessage(ctx context.Context, k8sClient client.Client, a2aClient *a2aclient.A2AClient, input, agentName, namespace, queryName, contextID string, obj client.Object, a2aRecorder eventing.A2aRecorder) (*A2AResponse, error) {
	var message protocol.Message
	if contextID != "" {
		message = protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(input),
		}, nil, &contextID)
	} else {
		message = protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(input),
		})
	}

	blocking := true
	params := protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	}

	result, err := a2aClient.SendMessage(ctx, params)
	if err != nil {
		if a2aRecorder != nil {
			a2aRecorder.A2AMessageFailed(ctx, fmt.Sprintf("A2A SendMessage failed: %v", err))
		}
		return nil, fmt.Errorf("A2A server call failed: %w", err)
	}

	response, err := extractResponseFromMessageResult(ctx, k8sClient, result, agentName, namespace, queryName, obj)
	if err != nil {
		if a2aRecorder != nil {
			a2aRecorder.A2AResponseParseError(ctx, fmt.Sprintf("Failed to parse A2A response: %v", err))
		}
		return nil, err
	}

	return response, nil
}

type customA2ARequestHandler struct {
	headers map[string]string
}

func (h *customA2ARequestHandler) Handle(ctx context.Context, httpClient *http.Client, req *http.Request) (*http.Response, error) {
	for name, value := range h.headers {
		req.Header.Set(name, value)
	}
	return httpClient.Do(req)
}

func extractResponseFromMessageResult(ctx context.Context, k8sClient client.Client, result *protocol.MessageResult, agentName, namespace, queryName string, obj client.Object) (*A2AResponse, error) {
	log := logf.FromContext(ctx)
	if result == nil {
		return nil, fmt.Errorf("result is nil")
	}

	switch r := result.Result.(type) {
	case *protocol.Message:
		text := ExtractTextFromParts(r.Parts)
		response := &A2AResponse{
			Content: text,
		}
		if r.ContextID != nil && *r.ContextID != "" {
			response.ContextID = *r.ContextID
		}
		return response, nil
	case *protocol.Task:
		text, err := ExtractTextFromTask(r)
		if err != nil {
			log.Error(err, "failed to extract text from task", "taskId", r.ID, "state", r.Status.State)
			return nil, err
		}

		err = HandleA2ATaskResponse(ctx, k8sClient, r, agentName, namespace, queryName, obj)
		if err != nil {
			log.Error(err, "failed to create A2ATask resource", "taskId", r.ID, "agent", agentName)
			return nil, fmt.Errorf("failed to handle A2A task response: %w", err)
		}

		response := &A2AResponse{
			Content:   text,
			ContextID: r.ContextID,
			TaskID:    r.ID,
		}
		return response, nil
	default:
		log.Error(nil, "unexpected A2A result type", "type", fmt.Sprintf("%T", result.Result), "agent", agentName)
		return nil, fmt.Errorf("unexpected result type: %T", result.Result)
	}
}

func ExtractTextFromTask(task *protocol.Task) (string, error) {
	if task.Status.State == "" {
		return "", fmt.Errorf("task has no status state")
	}

	switch task.Status.State {
	case TaskStateCompleted:
		return extractAgentTextFromHistory(task.History), nil

	case TaskStateFailed:
		errorMsg := "task failed"
		if task.Status.Message != nil && len(task.Status.Message.Parts) > 0 {
			errorMsg = ExtractTextFromParts(task.Status.Message.Parts)
		}
		return "", fmt.Errorf("%s", errorMsg)

	default:
		return "", fmt.Errorf("task in state '%s' (expected %s or %s)", task.Status.State, TaskStateCompleted, TaskStateFailed)
	}
}

func extractAgentTextFromHistory(history []protocol.Message) string {
	var text strings.Builder
	for _, msg := range history {
		if msg.Role == protocol.MessageRoleAgent && len(msg.Parts) > 0 {
			msgText := ExtractTextFromParts(msg.Parts)
			if msgText != "" {
				if text.Len() > 0 {
					text.WriteString("\n")
				}
				text.WriteString(msgText)
			}
		}
	}
	return text.String()
}

func ExtractTextFromParts(parts []protocol.Part) string {
	var text strings.Builder
	for _, part := range parts {
		if textPart, ok := part.(protocol.TextPart); ok {
			text.WriteString(textPart.Text)
		} else if textPartPtr, ok := part.(*protocol.TextPart); ok {
			text.WriteString(textPartPtr.Text)
		}
	}
	return text.String()
}

func validateA2AClient(address string, headers []arkv1prealpha1.Header, ctx context.Context, k8sClient client.Client, namespace string) error {
	var clientOptions []a2aclient.Option
	clientOptions = append(clientOptions, a2aclient.WithTimeout(getA2ADiscoveryTimeout()))

	if len(headers) > 0 {
		resolvedHeaders, err := resolveA2AHeaders(ctx, k8sClient, headers, namespace)
		if err != nil {
			return err
		}
		clientOptions = append(clientOptions, a2aclient.WithHTTPReqHandler(&customA2ARequestHandler{
			headers: resolvedHeaders,
		}))
	}

	_, err := a2aclient.NewA2AClient(address, clientOptions...)
	if err != nil {
		return fmt.Errorf("failed to create A2A client: %w", err)
	}
	return nil
}

func createA2ARequest(ctx context.Context, agentCardURL string, headers []arkv1prealpha1.Header, k8sClient client.Client, namespace string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, agentCardURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if len(headers) > 0 {
		resolvedHeaders, err := resolveA2AHeaders(ctx, k8sClient, headers, namespace)
		if err != nil {
			return nil, err
		}
		for name, value := range resolvedHeaders {
			req.Header.Set(name, value)
		}
	}

	return req, nil
}

func executeA2ARequest(ctx context.Context, req *http.Request, a2aRecorder eventing.A2aRecorder) (*A2AAgentCard, error) {
	httpClient := &http.Client{
		Timeout: getA2ADiscoveryTimeout(),
		Transport: otelhttp.NewTransport(http.DefaultTransport,
			otelhttp.WithSpanNameFormatter(func(_ string, _ *http.Request) string {
				return "a2a.discover"
			}),
		),
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		if a2aRecorder != nil {
			a2aRecorder.A2AConnectionFailed(ctx, fmt.Sprintf("failed to connect to A2A server: %v", err))
		}
		return nil, fmt.Errorf("failed to connect to A2A server: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.FromContext(ctx).Error(closeErr, "failed to close response body")
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("A2A server returned status %d", resp.StatusCode)
	}

	var agentCard A2AAgentCard
	if err := json.NewDecoder(resp.Body).Decode(&agentCard); err != nil {
		return nil, fmt.Errorf("failed to parse agent card: %w", err)
	}

	return &agentCard, nil
}

func resolveA2AHeaders(ctx context.Context, k8sClient client.Client, headers []arkv1prealpha1.Header, namespace string) (map[string]string, error) {
	resolvedHeaders := make(map[string]string)
	for _, header := range headers {
		headerValue, err := resolution.ResolveHeaderValueV1PreAlpha1(ctx, k8sClient, header, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve header %s: %v", header.Name, err)
		}
		resolvedHeaders[header.Name] = headerValue
	}
	logf.FromContext(ctx).Info("a2a headers resolved", "headers_count", len(resolvedHeaders))
	return resolvedHeaders, nil
}

func HandleA2ATaskResponse(ctx context.Context, k8sClient client.Client, task *protocol.Task, agentName, namespace, queryName string, obj client.Object) error {
	log := logf.FromContext(ctx)

	if queryName == "" {
		return fmt.Errorf("unable to determine A2A Task originating query")
	}

	var a2aServerName string
	if a2aServer, ok := obj.(*arkv1prealpha1.A2AServer); ok {
		a2aServerName = a2aServer.Name
	}

	a2aTask := &arkv1alpha1.A2ATask{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("a2a-task-%s", task.ID),
			Namespace: namespace,
		},
		Spec: arkv1alpha1.A2ATaskSpec{
			TaskID:    task.ID,
			ContextID: task.ContextID,
			QueryRef: arkv1alpha1.QueryRef{
				Name:      queryName,
				Namespace: namespace,
			},
			A2AServerRef: arkv1alpha1.A2AServerRef{
				Name:      a2aServerName,
				Namespace: namespace,
			},
			AgentRef: arkv1alpha1.AgentRef{
				Name:      agentName,
				Namespace: namespace,
			},
		},
		Status: arkv1alpha1.A2ATaskStatus{
			Phase: ConvertA2AStateToPhase(string(task.Status.State)),
		},
	}

	PopulateA2ATaskStatusFromProtocol(&a2aTask.Status, task)

	now := metav1.NewTime(time.Now())
	a2aTask.Status.StartTime = &now

	if err := k8sClient.Create(ctx, a2aTask); err != nil {
		log.Error(err, "failed to create A2ATask resource", "taskId", task.ID)
		return fmt.Errorf("failed to create A2ATask resource: %w", err)
	}

	return nil
}
