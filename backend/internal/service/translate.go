package service

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/its-rory/translate/backend/internal/model"
	"github.com/its-rory/translate/backend/internal/repository"
)

type TranslateService struct {
	providerRepo *repository.ProviderRepository
	promptRepo   *repository.PromptRepository
}

func NewTranslateService() *TranslateService {
	return &TranslateService{
		providerRepo: repository.NewProviderRepository(),
		promptRepo:   repository.NewPromptRepository(),
	}
}

type TranslateRequest struct {
	ProviderID int64  `json:"provider_id" binding:"required"`
	ModelName  string `json:"model_name" binding:"required"`
	PromptID   int64  `json:"prompt_id"`
	SourceText string `json:"source_text" binding:"required"`
	TargetLang string `json:"target_lang" binding:"required"`
	SourceLang string `json:"source_lang"`
}

type TranslateResponse struct {
	TranslatedText string `json:"translated_text"`
}

func (s *TranslateService) Translate(req TranslateRequest) (*TranslateResponse, error) {
	provider, err := s.providerRepo.GetByID(req.ProviderID)
	if err != nil {
		return nil, fmt.Errorf("failed to get provider: %w", err)
	}
	if provider == nil {
		return nil, fmt.Errorf("provider not found")
	}

	var promptContent string
	if req.PromptID > 0 {
		prompt, err := s.promptRepo.GetByID(req.PromptID)
		if err != nil {
			return nil, fmt.Errorf("failed to get prompt: %w", err)
		}
		if prompt != nil {
			promptContent = prompt.Content
		}
	}

	if promptContent == "" {
		promptContent = "Translate the following text to " + req.TargetLang + ". Output only the translated text."
	}

	userMessage := req.SourceText
	if req.SourceLang != "" && req.SourceLang != "auto" {
		userMessage = fmt.Sprintf("[Source language: %s]\n\n%s", req.SourceLang, req.SourceText)
	}

	switch provider.APIStyle {
	case "openai_completions":
		return s.translateOpenAICompletions(provider, req.ModelName, promptContent, userMessage)
	case "openai_responses":
		return s.translateOpenAIResponses(provider, req.ModelName, promptContent, userMessage)
	case "anthropic_messages":
		return s.translateAnthropicMessages(provider, req.ModelName, promptContent, userMessage)
	case "google_gemini_content":
		return s.translateGeminiContent(provider, req.ModelName, promptContent, userMessage)
	default:
		return nil, fmt.Errorf("unsupported API style: %s", provider.APIStyle)
	}
}

func (s *TranslateService) translateOpenAICompletions(provider *model.Provider, modelName, systemPrompt, userMessage string) (*TranslateResponse, error) {
	url := strings.TrimRight(provider.BaseURL, "/") + "/v1/chat/completions"
	body := map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
		"stream": false,
	}
	result, err := s.doHTTPPost(url, provider.APIKey, body)
	if err != nil {
		return nil, err
	}
	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}
	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid choice format")
	}
	message, ok := choice["message"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid message format")
	}
	content, _ := message["content"].(string)
	return &TranslateResponse{TranslatedText: content}, nil
}

func (s *TranslateService) translateOpenAIResponses(provider *model.Provider, modelName, systemPrompt, userMessage string) (*TranslateResponse, error) {
	url := strings.TrimRight(provider.BaseURL, "/") + "/v1/responses"
	body := map[string]interface{}{
		"model":       modelName,
		"instructions": systemPrompt,
		"input":       userMessage,
		"stream":      false,
	}
	result, err := s.doHTTPPost(url, provider.APIKey, body)
	if err != nil {
		return nil, err
	}
	output, ok := result["output"].([]interface{})
	if !ok || len(output) == 0 {
		return nil, fmt.Errorf("no output in response")
	}
	for _, item := range output {
		if m, ok := item.(map[string]interface{}); ok {
			if m["type"] == "message" {
				if content, ok := m["content"].([]interface{}); ok && len(content) > 0 {
					if textPart, ok := content[0].(map[string]interface{}); ok {
						if text, ok := textPart["text"].(string); ok {
							return &TranslateResponse{TranslatedText: text}, nil
						}
					}
				}
			}
		}
	}
	return nil, fmt.Errorf("no text content in response")
}

func (s *TranslateService) translateAnthropicMessages(provider *model.Provider, modelName, systemPrompt, userMessage string) (*TranslateResponse, error) {
	url := strings.TrimRight(provider.BaseURL, "/") + "/v1/messages"
	body := map[string]interface{}{
		"model":      modelName,
		"max_tokens": 4096,
		"system":     systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": userMessage},
		},
	}
	reqBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", provider.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(respBody))
	}
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	content, ok := result["content"].([]interface{})
	if !ok || len(content) == 0 {
		return nil, fmt.Errorf("no content in response")
	}
	if textBlock, ok := content[0].(map[string]interface{}); ok {
		if text, ok := textBlock["text"].(string); ok {
			return &TranslateResponse{TranslatedText: text}, nil
		}
	}
	return nil, fmt.Errorf("no text content in response")
}

func (s *TranslateService) translateGeminiContent(provider *model.Provider, modelName, systemPrompt, userMessage string) (*TranslateResponse, error) {
	url := fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s",
		strings.TrimRight(provider.BaseURL, "/"), modelName, provider.APIKey)
	body := map[string]interface{}{
		"system_instruction": map[string]interface{}{
			"parts": []map[string]string{
				{"text": systemPrompt},
			},
		},
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]string{
					{"text": userMessage},
				},
			},
		},
	}
	result, err := s.doHTTPPostNoAuth(url, body)
	if err != nil {
		return nil, err
	}
	candidates, ok := result["candidates"].([]interface{})
	if !ok || len(candidates) == 0 {
		return nil, fmt.Errorf("no candidates in response")
	}
	candidate, ok := candidates[0].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid candidate format")
	}
	content, ok := candidate["content"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid content format")
	}
	parts, ok := content["parts"].([]interface{})
	if !ok || len(parts) == 0 {
		return nil, fmt.Errorf("no parts in content")
	}
	if part, ok := parts[0].(map[string]interface{}); ok {
		if text, ok := part["text"].(string); ok {
			return &TranslateResponse{TranslatedText: text}, nil
		}
	}
	return nil, fmt.Errorf("no text content in response")
}

func (s *TranslateService) doHTTPPost(url, apiKey string, body interface{}) (map[string]interface{}, error) {
	reqBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	return s.doHTTPRequest(httpReq)
}

func (s *TranslateService) doHTTPPostNoAuth(url string, body interface{}) (map[string]interface{}, error) {
	reqBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	return s.doHTTPRequest(httpReq)
}

func (s *TranslateService) doHTTPRequest(httpReq *http.Request) (map[string]interface{}, error) {
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(respBody))
	}
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	return result, nil
}

type StreamTranslateRequest struct {
	ProviderID int64  `json:"provider_id" binding:"required"`
	ModelName  string `json:"model_name" binding:"required"`
	PromptID   int64  `json:"prompt_id"`
	SourceText string `json:"source_text" binding:"required"`
	TargetLang string `json:"target_lang" binding:"required"`
	SourceLang string `json:"source_lang"`
}

func (s *TranslateService) StreamTranslate(req StreamTranslateRequest, writer *bufio.Writer, flusher http.Flusher) error {
	provider, err := s.providerRepo.GetByID(req.ProviderID)
	if err != nil {
		return fmt.Errorf("failed to get provider: %w", err)
	}
	if provider == nil {
		return fmt.Errorf("provider not found")
	}

	var promptContent string
	if req.PromptID > 0 {
		prompt, err := s.promptRepo.GetByID(req.PromptID)
		if err != nil {
			return fmt.Errorf("failed to get prompt: %w", err)
		}
		if prompt != nil {
			promptContent = prompt.Content
		}
	}
	if promptContent == "" {
		promptContent = "Translate the following text to " + req.TargetLang + ". Output only the translated text."
	}
	userMessage := req.SourceText
	if req.SourceLang != "" && req.SourceLang != "auto" {
		userMessage = fmt.Sprintf("[Source language: %s]\n\n%s", req.SourceLang, req.SourceText)
	}

	switch provider.APIStyle {
	case "openai_completions":
		return s.streamOpenAICompletions(provider, req.ModelName, promptContent, userMessage, writer, flusher)
	default:
		return fmt.Errorf("streaming not supported for API style: %s", provider.APIStyle)
	}
}

func (s *TranslateService) streamOpenAICompletions(provider *model.Provider, modelName, systemPrompt, userMessage string, writer *bufio.Writer, flusher http.Flusher) error {
	url := strings.TrimRight(provider.BaseURL, "/") + "/v1/chat/completions"
	body := map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
		"stream": true,
	}
	reqBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			fmt.Fprintf(writer, "data: [DONE]\n\n")
			writer.Flush()
			flusher.Flush()
			break
		}
		var chunk map[string]interface{}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		choices, ok := chunk["choices"].([]interface{})
		if !ok || len(choices) == 0 {
			continue
		}
		choice, ok := choices[0].(map[string]interface{})
		if !ok {
			continue
		}
		delta, ok := choice["delta"].(map[string]interface{})
		if !ok {
			continue
		}
		content, _ := delta["content"].(string)
		sseData, _ := json.Marshal(map[string]string{"content": content})
		fmt.Fprintf(writer, "data: %s\n\n", sseData)
		writer.Flush()
		flusher.Flush()
	}
	return nil
}
