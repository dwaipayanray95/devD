# Gemini AI Integration Guide - devD

`devD` integrates Gemini AI to provide context-aware developer automation features directly in your console.

## Active AI Features
1. **AI Commit Message Suggestion**: Reads the staged `git diff` and drafts a professional, single-line Conventional Commit message suggestion.
2. **AI Assistant Console**: An interactive chat terminal (`devD > ai` or typing `ai`) allowing you to query Gemini for quick Git explanations, regex patterns, or coding questions.

---

## Configuration & Credentials
The integration uses the standard Google Gemini REST API and requires the `GEMINI_API_KEY` environment variable.
```bash
export GEMINI_API_KEY="your-api-key"
```

---

## Technical Details

The Gemini client is implemented under `src/ui.js` in the `askGemini()` function using the native `fetch` API to avoid heavy SDK dependencies. The AI Conventional Commit wizard triggers this call from `src/gitControl.js`.

* **API Version**: `v1beta`
* **Model Used**: `gemini-2.5-flash`
* **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
* **Request Format**:
  ```json
  {
    "contents": [
      {
        "parts": [{ "text": "prompt text" }]
      }
    ]
  }
  ```

---

## Guidelines for Modifying AI Prompts
* **Truncate Payloads**: Always truncate large inputs (e.g., `git diff` streams) before sending them to the API. Currently, `devD` caps the diff size at `8,000` characters to prevent API response delays.
* **Strict Format Enforcement**: Gemini output formats must be locked down using clear instructions in the system/user prompts (e.g., "Do not output code blocks, quotes, markdown formatting, or any introductory text. Just output the commit message itself.").
