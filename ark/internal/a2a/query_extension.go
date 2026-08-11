/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"context"
	"fmt"

	"sigs.k8s.io/controller-runtime/pkg/client"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/eventing"
)

// QueryExtensionRef is the request-side payload carried at
// QueryExtensionMetadataKey. Schema: ark/api/extensions/query/v1/schema.json
type QueryExtensionRef struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	// Target optionally names the resource inside the Query that the engine
	// should execute. It is set when dispatching a single team member, whose
	// Query targets the team rather than the member. When absent, engines fall
	// back to the Query's own target.
	Target *QueryExtensionTarget `json:"target,omitempty"`
}

type QueryExtensionTarget struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

// NewQueryExtensionMessage builds the A2A user message carrying the Ark query
// extension. contextID becomes the A2A context id when non-empty.
func NewQueryExtensionMessage(text, contextID string, ref QueryExtensionRef) protocol.Message {
	parts := []protocol.Part{protocol.NewTextPart(text)}

	var message protocol.Message
	if contextID != "" {
		message = protocol.NewMessageWithContext(protocol.MessageRoleUser, parts, nil, &contextID)
	} else {
		message = protocol.NewMessage(protocol.MessageRoleUser, parts)
	}

	message.Metadata = map[string]any{QueryExtensionMetadataKey: ref}
	message.Extensions = []string{QueryExtensionURI}

	return message
}

// SendQueryExtensionMessage performs a blocking message/send of msg to address.
func SendQueryExtensionMessage(ctx context.Context, k8sClient client.Client, address string, headers []arkv1prealpha1.Header, namespace, agentName string, msg protocol.Message, a2aRecorder eventing.A2aRecorder) (*protocol.MessageResult, error) {
	a2aClient, err := CreateA2AClient(ctx, k8sClient, address, headers, namespace, agentName, a2aRecorder)
	if err != nil {
		return nil, fmt.Errorf("failed to create A2A client: %w", err)
	}

	blocking := true
	params := protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: msg,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	}

	result, err := a2aClient.SendMessage(ctx, params)
	if err != nil {
		if a2aRecorder != nil {
			a2aRecorder.A2AMessageFailed(ctx, fmt.Sprintf("A2A SendMessage failed: %v", err))
		}
		return nil, err
	}

	return result, nil
}
