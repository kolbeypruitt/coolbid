# Prompt Lab

Run N vision-LLM prompt variants against one floor plan in parallel and render a side-by-side HTML report of the resulting polygon overlays. Lets you compare prompt approaches without redeploying Modal.

## Setup

From the repo root:

```bash
cd tools/prompt-lab

# Use the geometry-service venv (same Python deps)
source ../../geometry-service/venv/bin/activate
# Or create a fresh venv: python -m venv venv && source venv/bin/activate && pip install anthropic opencv-python-headless shapely pydantic numpy

export ANTHROPIC_API_KEY=sk-ant-...
```

## Drop a test image

Put a floor plan photo at `fixtures/wright-residence.jpg` (or any path you pass to `--image`).

## Run

```bash
python run.py
```

This:
1. Loads every `variants/*.md` file as a prompt variant.
2. Preprocesses the image via the same `preprocess.py` pipeline production uses.
3. Calls Anthropic (default `claude-sonnet-4-6` + 8k thinking budget) for each variant, in parallel.
4. Postprocesses polygons via the same `postprocess.py` pipeline.
5. Writes `reports/<timestamp>.html` and opens it in your browser.

## Variant files

Each `variants/*.md` is a standalone prompt file with frontmatter:

```markdown
---
name: my-variant
description: One-line description shown in the report header
---

<ANALYZE_PROMPT goes here — the full user-facing prompt>
```

The system prompt is shared across all variants (hardcoded in `run.py`).

Add new variants by dropping more `.md` files in `variants/`. Rerun.

## Options

| Flag | Default | Purpose |
|------|---------|---------|
| `--image PATH` | `fixtures/wright-residence.jpg` | Floor plan photo |
| `--variants GLOB` | `variants/*.md` | Which variants to run |
| `--model NAME` | `claude-sonnet-4-6` | Anthropic model |
| `--thinking-budget N` | `8000` | Extended-thinking budget |
| `--max-tokens N` | `16000` | Max output tokens |
| `--no-open` | off | Don't auto-open the report |

## Cost + time

10 parallel calls on Sonnet 4.6 at 8k thinking + 16k output budget: roughly $0.50–$1 and 30–60 seconds total per run. Opus is ~5× more expensive.
