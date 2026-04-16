# Prompt Lab

Run N vision-LLM prompt variants against M floor-plan fixtures in parallel and render side-by-side HTML reports of the resulting polygon overlays. Lets you compare prompt approaches — and test consistency across hand-drawn vs CAD plans — without redeploying Modal.

## Setup

From the repo root:

```bash
cd tools/prompt-lab

# Use the geometry-service venv (same Python deps)
source ../../geometry-service/venv/bin/activate

export ANTHROPIC_API_KEY=sk-ant-...
```

## Drop fixtures

Put any `.jpg`, `.jpeg`, `.png`, or `.webp` floor-plan images under `fixtures/`. The runner will auto-discover them — any number, any mix of hand-drawn and CAD.

## Run

```bash
python run.py
```

This:
1. Loads every `variants/*.md` file as a prompt variant.
2. Discovers all image files in `fixtures/`.
3. For each fixture: preprocesses via the same pipeline production uses, calls Anthropic for every variant in parallel (default `claude-sonnet-4-6` + 8k thinking budget), postprocesses polygons.
4. Writes one report per fixture: `reports/<timestamp>_<fixture-stem>.html`.
5. Opens the first report in your browser.

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

Variants we've already tested and discarded live in `variants/archive/` for reference. They're not loaded by default.

## Options

| Flag | Default | Purpose |
|------|---------|---------|
| `--image PATH` | (auto-discover) | Run a single fixture, bypassing auto-discovery |
| `--fixtures-dir DIR` | `fixtures` | Directory to scan for images |
| `--variants GLOB` | `variants/*.md` | Which variants to run |
| `--model NAME` | `claude-sonnet-4-6` | Anthropic model |
| `--thinking-budget N` | `8000` | Extended-thinking budget |
| `--max-tokens N` | `16000` | Max output tokens |
| `--no-open` | off | Don't auto-open the report |

## Running only finalists

To A/B the top 4 variants against every fixture:

```bash
python run.py --variants 'variants/v0[456]*.md' --variants 'variants/v1[16]*.md'
```

Or archive the others (`git mv variants/v14-tri-mesh.md variants/archive/` etc.) so the default `variants/*.md` glob picks up just the active set.

## Cost + time

Per fixture: ~13 parallel Sonnet 4.6 calls at 8k thinking + 16k output ≈ $1-2 and 60-90s. With 4 fixtures that's ~$4-8 total. Opus is ~5× more expensive.

## Troubleshooting

**JSON parse error**: the runner auto-cleans trailing commas. If a variant still fails, check `reports/failed_<variant-name>_<ts>.txt` for the raw model output — that'll show exactly what the model emitted.

**Rate-limit 429**: too many concurrent variants. Archive a few and re-run, or run fewer variants at once.
