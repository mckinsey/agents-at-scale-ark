package completions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	arkmcp "mckinsey.com/ark/internal/mcp"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type MCPExecutor struct {
	MCPClient   *arkmcp.MCPClient
	ToolName    string
	ImagePolicy *imagePolicy
}

func (m *MCPExecutor) imagePolicy() *imagePolicy {
	if m.ImagePolicy != nil {
		return m.ImagePolicy
	}
	return defaultImagePolicy()
}

func (m *MCPExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
	log := logf.FromContext(ctx)

	if m.MCPClient == nil {
		err := fmt.Errorf("MCP client not initialized for tool %s", m.ToolName)
		log.Error(err, "MCP client is nil")
		return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, err
	}

	if m.MCPClient.Client == nil {
		err := fmt.Errorf("MCP client connection not initialized for tool %s", m.ToolName)
		log.Error(err, "MCP client connection is nil")
		return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, err
	}

	arguments := make(map[string]any)
	if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
		log.Info("Error parsing tool arguments", "ToolCall", call)
	}

	response, err := m.MCPClient.CallTool(ctx, &mcpsdk.CallToolParams{
		Name:      m.ToolName,
		Arguments: arguments,
	})
	if err != nil {
		if errors.Is(err, arkmcp.ErrToolCallTimeout) {
			log.Error(err, "tool call exceeded toolCallTimeout", "tool", m.ToolName)
			return ToolResult{ID: call.ID, Name: call.Function.Name, Content: "", Error: err.Error()}, err
		}
		log.Info("tool call error", "tool", m.ToolName, "error", err, "errorType", fmt.Sprintf("%T", err))
		return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, err
	}
	log.V(2).Info("tool call response", "tool", m.ToolName, "response", response)
	content, images := m.collectContent(ctx, response.Content)
	return ToolResult{ID: call.ID, Name: call.Function.Name, Content: content, Images: images}, nil
}

func (m *MCPExecutor) collectContent(ctx context.Context, contents []mcpsdk.Content) (string, []ToolResultImage) {
	admitter := m.imagePolicy().NewToolResultAdmitter()
	var result strings.Builder
	var images []ToolResultImage
	for _, content := range contents {
		switch typed := content.(type) {
		case *mcpsdk.TextContent:
			result.WriteString(typed.Text)
		case *mcpsdk.ImageContent:
			image, note, ok := admitter.Admit(ctx, m.ToolName, typed.MIMEType, typed.Data)
			if !ok {
				result.WriteString(note)
				continue
			}
			images = append(images, image)
			result.WriteString(imageReturnedNote(image.MediaType, len(image.Data)))
		default:
			jsonBytes, _ := json.MarshalIndent(content, "", "  ")
			result.WriteString(string(jsonBytes))
		}
	}
	return result.String(), images
}
