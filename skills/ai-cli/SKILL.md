---
name: ai-cli
description: "Use when the user asks to run, configure, troubleshoot, or pipe the `ai` CLI for text, media, or model listing, or explicitly wants `ai-cli` as a bounded drafting/evaluation aid for an Agent Skill. For ordinary Agent Skill authoring without `ai-cli`, use the installed skill-authoring workflow."
---

# ai-cli

Use `ai` for bounded model generation from the terminal. Treat it as a proposal tool: validate its output independently and never let it install, project, or approve artifacts.

## Route

- Agent Skill drafting or evaluation → read `references/writing-agent-skills.md`.
- Text → `ai text`.
- Image generation or reference-image editing → `ai image`; OpenAI-compatible modes use the configured `/images/generations` or `/images/edits` endpoint.
- Video/speech/transcription → use the matching command only with AI Gateway. Custom modes intentionally reject these modalities.
- Discovery → `ai models`; custom modes read the configured models endpoint, classify advertised image capabilities, and report failures instead of contacting AI Gateway.

## Safe setup

Check identity before use:

```bash
type -a ai
ai --version
```

AI Gateway remains the upstream default. For a custom endpoint, opt into `openai-compatible` (Chat Completions) or `openai-responses` and use key indirection:

```bash
export AI_CLI_PROVIDER=openai-compatible
export AI_CLI_BASE_URL="${OPENAI_COMPATIBLE_BASE_URL:?}/v1"
export AI_CLI_API_KEY_ENV=OPENAI_COMPATIBLE_API_KEY
export AI_CLI_TEXT_MODEL="${AI_CLI_TEXT_MODEL:?set a text model}"
export AI_CLI_IMAGE_MODEL="${AI_CLI_IMAGE_MODEL:-openai/gpt-image-2}"
ai models --type text --json
ai models --type image --json
```

Do not continue if any required custom-provider setting is absent; an Agent Skill workflow must not fall back to Gateway. `--provider`, `--base-url`, `--api-key-env`, and `--models-url` override the equivalent environment variables for one command.

## Commands

```bash
ai text "summarize this" -m provider/model -o result.md --json
ai image "a sunset" -o result.png --json
ai video "a spinning triangle" -o result.mp4 --json
ai audio speak "hello" -o speech.mp3 --json --no-play --no-waveform
ai audio transcribe recording.mp3 -o transcript.txt --json
ai models --type text --json
```

## Context and output safety

- Pass only material named for the task. Do not pipe secrets, private prompts, transcripts, full workspaces, or a skill catalog into a model.
- Use `-o` and `--json` so stdout contains bounded metadata. Without `-o`, non-TTY media commands can write binary data to stdout.
- Keep user input unchanged in a separate file; write generated content to a new candidate path.
- Treat HTTP(S) input URLs as disclosures to the selected provider.
- Disable media previews in automation with `--no-preview`, `--no-play`, or `--no-waveform`.

## Result

Report the provider mode, model, output path, exit code, and deterministic checks. Never report or echo API keys, authorization headers, or private input.
