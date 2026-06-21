package gemini

import (
	"context"
	"errors"
	"os"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

func AskGemini(prompt string) (string, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return "", errors.New("GEMINI_API_KEY is not configured in your environment. Set it with: export GEMINI_API_KEY=\"...\"")
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", err
	}
	defer client.Close()

	// Default to gemini-2.5-flash for speed/efficiency
	model := client.GenerativeModel("gemini-2.5-flash")
	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", err
	}

	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil || len(resp.Candidates[0].Content.Parts) == 0 {
		return "No response candidate generated.", nil
	}

	part := resp.Candidates[0].Content.Parts[0]
	if textPart, ok := part.(genai.Text); ok {
		return string(textPart), nil
	}

	return "Non-text response candidate generated.", nil
}
