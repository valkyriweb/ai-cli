# Writing Agent Skills with ai-cli

Use `ai-cli` only for a bounded candidate or critique inside the normal Agent Skill workflow. It is not the authoring authority, validator, installer, projector, or reviewer.

## 1. Load the authoring doctrine

Load the installed equivalents of:

- `open-knowledge-write-skill` for overlap, scope, description, eval, and install gates;
- `matt-pocock/write-a-skill` for concise structure and bundled resources;
- `context-engineering/instruction-refiner` and progressive disclosure;
- any repo-specific skill validator.

If another skill already owns the trigger, extend it or add one focused reference. Do not create a competing global skill.

## 2. Define a bounded input manifest

Create a temporary input directory and copy only:

1. the named requirement;
2. the current target `SKILL.md`, if one exists;
3. explicitly named relevant references.

Keep an untouched copy of every input. Record file names and hashes before generation. Do not include the full skill catalog, secrets, transcripts, issue bodies, unrelated workspace files, or private context. If required context is ambiguous, stop and ask which file is authoritative.

Run existing deterministic validators before generation. For a discipline or guardrail skill, capture a RED baseline without the candidate and preserve the agent's rationalization.

## 3. Fail closed onto ClawRouter

Require every variable; never let an unset value select the default Gateway provider.

Local ClawRouter preset:

```bash
: "${CLAWROUTER_BASE_URL:?set the reviewed ClawRouter URL}"
: "${CLAWROUTER_PROXY_KEY:?ClawRouter key is not set}"
export AI_CLI_PROVIDER=openai-responses
export AI_CLI_BASE_URL="${CLAWROUTER_BASE_URL%/}/v1"
export AI_CLI_API_KEY_ENV=CLAWROUTER_PROXY_KEY
export AI_CLI_TEXT_MODEL="${AI_CLI_TEXT_MODEL:-gpt-5.6-luna}"
```

Paperclip runtime preset:

```bash
: "${CLAWROUTER_PROXY_KEY:?ClawRouter key is not projected}"
export AI_CLI_PROVIDER=openai-responses
export AI_CLI_BASE_URL=http://clawrouter.clawrouter.svc.cluster.local:8789/v1
export AI_CLI_API_KEY_ENV=CLAWROUTER_PROXY_KEY
export AI_CLI_TEXT_MODEL="${AI_CLI_TEXT_MODEL:-gpt-5.6-luna}"
```

The runtime automatically forwards non-empty `PAPERCLIP_AGENT_ID` and `PAPERCLIP_RUN_ID` through a fixed attribution-header allowlist. Do not construct authorization headers yourself.

## 4. Generate one candidate

Use a cheap ClawRouter text model first. Build a short prompt that names the output contract and input files; ask for the candidate only, not hidden reasoning.

```bash
ai text \
  --provider openai-responses \
  --model "$AI_CLI_TEXT_MODEL" \
  --system "Draft the requested Agent Skill from only the supplied files. Preserve requirements. Return the candidate artifact, not commentary." \
  --output ./candidate/SKILL.md \
  --json \
  < ./input/bounded-prompt.txt \
  > ./candidate/run.json
```

Inspect `run.json`, then run deterministic validators against the candidate. If it fails, provide only the validator findings and relevant source lines for one refinement. Allow at most two refinement rounds total; after that, stop and hand the evidence to a human reviewer.

## 5. Evaluate the candidate

Check mechanically and with fresh-agent examples:

- frontmatter name and trigger-rich description;
- should-trigger phrases and adjacent near-misses;
- overlap with installed skills;
- concise common reader path and one-level references;
- concrete commands/examples and reviewed scripts;
- no secret, transcript, catalog, or workspace leakage;
- retrieval: a fresh agent loads the skill and follows the intended path.

For discipline/guardrail skills, run GREEN after the RED baseline, then combine at least two pressures—time, authority, and sunk cost—and force a concrete choice. Patch only a demonstrated loophole and re-run.

## 6. Review before installation

Produce a candidate file or diff against the untouched original. Require independent review and the normal human/project gate before projection or installation. `ai-cli` must never run the installer, write directly into editor projection directories, merge, or declare its own output approved.

Report input hashes, model, provider mode, rounds used, candidate path, validators, trigger/near-miss results, pressure result when applicable, and reviewer status. Redact credentials and omit private inputs from the report.
