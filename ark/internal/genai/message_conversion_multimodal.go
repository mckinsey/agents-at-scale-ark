package genai

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func A2AToOpenAIMessageMultimodal(msg protocol.Message) (openai.ChatCompletionMessageParamUnion, error) {
	role := resolveA2AMessageRole(msg)
	if role != RoleUser {
		return A2AToOpenAIMessage(msg)
	}

	contentParts := a2aPartsToOpenAIContentParts(msg.Parts)
	if len(contentParts) == 0 {
		return openai.UserMessage(ensureNonEmptyTextContent(extractTextFromParts(msg.Parts))), nil
	}
	if len(contentParts) == 1 && contentParts[0].OfText != nil {
		return openai.UserMessage(ensureNonEmptyTextContent(contentParts[0].OfText.Text)), nil
	}
	return openai.UserMessage(contentParts), nil
}

func a2aPartsToOpenAIContentParts(parts []protocol.Part) []openai.ChatCompletionContentPartUnionParam {
	contentParts := make([]openai.ChatCompletionContentPartUnionParam, 0, len(parts))
	for _, part := range parts {
		if converted := convertA2APartToOpenAIContent(part); converted != nil {
			contentParts = append(contentParts, converted...)
		}
	}
	return contentParts
}

func convertA2APartToOpenAIContent(part protocol.Part) []openai.ChatCompletionContentPartUnionParam {
	switch p := part.(type) {
	case *protocol.TextPart:
		return convertA2APartToOpenAIContent(*p)
	case protocol.TextPart:
		if p.Text != "" {
			return []openai.ChatCompletionContentPartUnionParam{openai.TextContentPart(p.Text)}
		}
	case *protocol.DataPart:
		return convertA2APartToOpenAIContent(*p)
	case protocol.DataPart:
		if p.Data != nil {
			if raw, err := json.Marshal(p.Data); err == nil {
				return []openai.ChatCompletionContentPartUnionParam{openai.TextContentPart(string(raw))}
			}
		}
	case *protocol.FilePart:
		return a2aFileToOpenAIContentPart(p.File)
	case protocol.FilePart:
		return a2aFileToOpenAIContentPart(p.File)
	}
	return nil
}

func OpenAIToA2AMessageMultimodal(msg openai.ChatCompletionMessageParamUnion) (protocol.Message, error) {
	if msg.OfUser == nil {
		return OpenAIToA2AMessage(msg)
	}

	if msg.OfUser.Content.OfString.Value != "" {
		return protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(msg.OfUser.Content.OfString.Value),
		}), nil
	}

	parts := make([]protocol.Part, 0, len(msg.OfUser.Content.OfArrayOfContentParts))
	for _, part := range msg.OfUser.Content.OfArrayOfContentParts {
		switch {
		case part.OfText != nil:
			if part.OfText.Text != "" {
				parts = append(parts, protocol.NewTextPart(part.OfText.Text))
			}
		case part.OfImageURL != nil:
			url := part.OfImageURL.ImageURL.URL
			if url == "" {
				continue
			}
			file := &protocol.FileWithURI{URI: url}
			if mimeType := mimeTypeFromDataURL(url); mimeType != "" {
				file.MimeType = &mimeType
			}
			parts = append(parts, protocol.FilePart{
				Kind: protocol.KindFile,
				File: file,
			})
		}
	}

	if len(parts) == 0 {
		parts = append(parts, protocol.NewTextPart(""))
	}

	return protocol.NewMessage(protocol.MessageRoleUser, parts), nil
}

func a2aFileToOpenAIContentPart(file protocol.FileUnion) []openai.ChatCompletionContentPartUnionParam {
	switch f := file.(type) {
	case *protocol.FileWithURI:
		if f.URI == "" {
			return nil
		}
		if isImageMimeType(f.MimeType) {
			return []openai.ChatCompletionContentPartUnionParam{
				openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
					URL: f.URI,
				}),
			}
		}
		return []openai.ChatCompletionContentPartUnionParam{openai.TextContentPart(f.URI)}
	case *protocol.FileWithBytes:
		if isImageMimeType(f.MimeType) && f.Bytes != "" {
			mimeType := *f.MimeType
			return []openai.ChatCompletionContentPartUnionParam{
				openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
					URL: fmt.Sprintf("data:%s;base64,%s", mimeType, f.Bytes),
				}),
			}
		}
		if f.Name != nil && *f.Name != "" {
			return []openai.ChatCompletionContentPartUnionParam{openai.TextContentPart(*f.Name)}
		}
		return []openai.ChatCompletionContentPartUnionParam{openai.TextContentPart("file-bytes")}
	default:
		return nil
	}
}

func isImageMimeType(mimeType *string) bool {
	return mimeType != nil && strings.HasPrefix(strings.ToLower(*mimeType), "image/")
}

func mimeTypeFromDataURL(value string) string {
	prefix := "data:"
	if !strings.HasPrefix(strings.ToLower(value), prefix) {
		return ""
	}
	semicolon := strings.Index(value, ";")
	comma := strings.Index(value, ",")
	if semicolon <= len(prefix) || comma == -1 || semicolon > comma {
		return ""
	}
	return value[len(prefix):semicolon]
}
