"""Prompt Lab — run N vision-LLM prompt variants against one floor plan, in parallel.

Writes a single self-contained HTML report (`reports/<timestamp>.html`) showing
the preprocessed image with polygon overlays for each variant, side by side.

Usage:
    cd tools/prompt-lab
    export ANTHROPIC_API_KEY=sk-ant-...
    python run.py

Options:
    --image PATH         Floor plan image (default: fixtures/wright-residence.jpg)
    --variants GLOB      Variant file glob (default: variants/*.md)
    --model NAME         Anthropic model (default: claude-sonnet-4-6)
    --thinking-budget N  Extended-thinking budget in tokens (default: 8000)
    --max-tokens N       Max output tokens (default: 16000)
    --no-open            Don't auto-open the report in a browser
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import os
import re
import sys
import time
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2

# Import the real preprocess + postprocess pipeline from the geometry service
_HERE = Path(__file__).resolve().parent
_SERVICE = _HERE.parent.parent / "geometry-service"
sys.path.insert(0, str(_SERVICE))
from app.preprocess import prepare_image_for_vision  # noqa: E402
from app.postprocess import postprocess_analysis  # noqa: E402

from anthropic import AsyncAnthropic  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger("prompt-lab")

SHARED_SYSTEM_PROMPT = """You are an expert HVAC load calculation engineer analyzing architectural floor plans. Your job: identify every room in the plan, trace its polygon boundary, and extract HVAC-relevant attributes (dimensions, windows, exterior walls).

How to read architectural floor plans:
1. WALLS are drawn as THICK solid lines OR pairs of parallel lines with hatching between them. Rooms are bounded by walls.
2. DIMENSION LINES are THIN lines with tick marks, arrows, or dots at each end; the number between them is the measurement (e.g., 12'-6" = 12.5 ft). IGNORE these when tracing polygons.
3. CHAIN DIMENSIONS run along exterior walls in segments. Their individual values must sum to the chain total — use as cross-check.
4. ROOM LABELS are printed inside each room boundary (e.g., "MSTR BDRM", "KITCHEN").
5. WINDOWS appear as parallel lines in a wall with a gap, or as a short arc. Count distinct window symbols per room.
6. EXTERIOR walls are thicker than interior partitions. Count how many sides of each room face an exterior wall."""


@dataclass
class Variant:
    name: str
    description: str
    analyze_prompt: str

    @classmethod
    def from_file(cls, path: Path) -> "Variant":
        text = path.read_text()
        meta = _parse_frontmatter(text)
        body = _strip_frontmatter(text)
        return cls(
            name=meta.get("name", path.stem),
            description=meta.get("description", ""),
            analyze_prompt=body.strip(),
        )


@dataclass
class Result:
    variant: Variant
    ok: bool
    elapsed_s: float
    raw: dict[str, Any] | None = None
    processed: dict[str, Any] | None = None
    error: str | None = None


def _parse_frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return {}
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta


def _strip_frontmatter(text: str) -> str:
    return re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.DOTALL)


def _extract_json(text: str) -> str:
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise ValueError("Unbalanced braces in response")


async def _run_variant(
    client: AsyncAnthropic,
    image_b64: str,
    variant: Variant,
    *,
    model: str,
    max_tokens: int,
    thinking_budget: int,
) -> Result:
    start = time.monotonic()
    logger.info("→ [%s] calling %s", variant.name, model)
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            thinking={"type": "enabled", "budget_tokens": thinking_budget},
            system=SHARED_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": variant.analyze_prompt},
                    ],
                }
            ],
        )
        text_parts = [b.text for b in response.content if b.type == "text"]
        raw_text = "\n".join(text_parts).strip()
        if not raw_text:
            raise ValueError("Model returned no text content")
        json_text = _extract_json(raw_text)
        try:
            parsed = json.loads(json_text)
        except json.JSONDecodeError as first_err:
            # Common Claude mistakes: trailing commas before } or ], or a stray
            # comma after the last value in an array. Try a targeted cleanup
            # and retry once before giving up.
            cleaned = re.sub(r",(\s*[}\]])", r"\1", json_text)
            try:
                parsed = json.loads(cleaned)
                logger.warning(
                    "⚠ [%s] JSON had trailing commas, auto-cleaned and parsed",
                    variant.name,
                )
            except json.JSONDecodeError:
                # Dump the raw response so we can see what the model did.
                dump_path = _HERE / "reports" / f"failed_{variant.name}_{int(time.time())}.txt"
                dump_path.write_text(raw_text)
                logger.error(
                    "✗ [%s] JSON parse failed: %s. Raw response saved to %s",
                    variant.name,
                    first_err,
                    dump_path.name,
                )
                raise first_err
        if not isinstance(parsed, dict):
            raise ValueError("Response JSON was not an object")

        try:
            processed = postprocess_analysis(parsed).model_dump()
        except Exception as post_err:
            logger.warning(
                "✗ [%s] postprocess failed: %s — showing raw polygons",
                variant.name,
                post_err,
            )
            processed = None

        elapsed = time.monotonic() - start
        logger.info("✓ [%s] done in %.1fs (%d rooms)", variant.name, elapsed, len(parsed.get("rooms", [])))
        return Result(variant=variant, ok=True, elapsed_s=elapsed, raw=parsed, processed=processed)
    except Exception as exc:
        elapsed = time.monotonic() - start
        logger.error("✗ [%s] failed in %.1fs: %s", variant.name, elapsed, exc)
        return Result(variant=variant, ok=False, elapsed_s=elapsed, error=str(exc))


async def _run_all(
    image_b64: str,
    variants: list[Variant],
    *,
    model: str,
    max_tokens: int,
    thinking_budget: int,
) -> list[Result]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY is not set")
    async with AsyncAnthropic(api_key=api_key) as client:
        return await asyncio.gather(
            *[
                _run_variant(
                    client,
                    image_b64,
                    v,
                    model=model,
                    max_tokens=max_tokens,
                    thinking_budget=thinking_budget,
                )
                for v in variants
            ]
        )


def _render_report(
    results: list[Result],
    image_b64: str,
    image_name: str,
    model: str,
) -> str:
    # Use processed rooms when available (shapely-validated), else raw.
    cells = []
    for r in results:
        cells.append(_render_cell(r, image_b64))

    grid_html = "\n".join(cells)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Prompt Lab — {image_name}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: #0b1020; color: #e6e9ef; font-family: system-ui, sans-serif; padding: 16px; }}
  header {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }}
  h1 {{ font-size: 18px; margin: 0; }}
  .meta {{ opacity: 0.65; font-size: 13px; }}
  .grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }}
  .cell {{ background: #151a2e; border: 1px solid #22273c; border-radius: 12px; overflow: hidden; }}
  .cell header {{ padding: 10px 14px; border-bottom: 1px solid #22273c; display: block; }}
  .cell h2 {{ font-size: 14px; margin: 0 0 4px 0; }}
  .cell .desc {{ font-size: 12px; opacity: 0.65; line-height: 1.35; }}
  .stats {{ font-size: 11px; opacity: 0.55; margin-top: 6px; }}
  .canvas-wrap {{ position: relative; background: #000; }}
  .canvas-wrap img {{ display: block; width: 100%; }}
  .canvas-wrap svg {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
  .error {{ padding: 24px; color: #ff8b8b; font-family: monospace; font-size: 12px; white-space: pre-wrap; }}
  text.room {{ font-size: 2px; fill: #fff; font-weight: 700; paint-order: stroke; stroke: rgba(0,0,0,0.85); stroke-width: 0.5; stroke-linejoin: round; }}
  @media (max-width: 900px) {{ .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<header>
  <h1>Prompt Lab — {image_name}</h1>
  <div class="meta">{timestamp} · {model} · {len(results)} variants</div>
</header>
<div class="grid">
{grid_html}
</div>
</body>
</html>
"""


ROOM_COLORS = {
    "master_bedroom": "59,130,246",
    "bedroom": "99,102,241",
    "living_room": "34,197,94",
    "family_room": "34,197,94",
    "kitchen": "249,115,22",
    "dining_room": "234,179,8",
    "bathroom": "6,182,212",
    "half_bath": "6,182,212",
    "hallway": "148,163,184",
    "laundry": "168,85,247",
    "office": "236,72,153",
    "foyer": "148,163,184",
    "sunroom": "250,204,21",
    "bonus_room": "139,92,246",
    "basement": "100,116,139",
    "closet": "148,163,184",
    "garage": "107,114,128",
}


def _color_for(room_type: str) -> str:
    return ROOM_COLORS.get(room_type, "148,163,184")


def _render_cell(r: Result, image_b64: str) -> str:
    head = f"""<header>
      <h2>{_html_escape(r.variant.name)}</h2>
      <div class="desc">{_html_escape(r.variant.description)}</div>
      <div class="stats">{'✓' if r.ok else '✗'} {r.elapsed_s:.1f}s · {'rooms: ' + str(len(r.raw.get('rooms', []))) if r.raw else '—'}</div>
    </header>"""

    if not r.ok:
        return f'<div class="cell">{head}<div class="error">{_html_escape(r.error or "unknown error")}</div></div>'

    # Prefer processed (shapely-validated); fall back to raw if postprocess failed.
    source = r.processed if r.processed else r.raw
    rooms = source.get("rooms", []) if source else []

    svg_parts = []
    for room in rooms:
        verts = room.get("vertices", []) or []
        if len(verts) < 3:
            continue
        points = " ".join(
            f"{max(0.0, min(1.0, float(v['x']))) * 100:.2f},"
            f"{max(0.0, min(1.0, float(v['y']))) * 100:.2f}"
            for v in verts
            if "x" in v and "y" in v
        )
        color = _color_for(room.get("type", ""))
        svg_parts.append(
            f'<polygon points="{points}" fill="rgba({color},0.25)" stroke="rgba({color},0.95)" stroke-width="0.3" />'
        )
        # Label at centroid.
        cx = sum(float(v["x"]) for v in verts if "x" in v) / len(verts) * 100
        cy = sum(float(v["y"]) for v in verts if "y" in v) / len(verts) * 100
        svg_parts.append(
            f'<text class="room" x="{cx:.2f}" y="{cy:.2f}" text-anchor="middle">{_html_escape(room.get("name", ""))}</text>'
        )

    svg = (
        f'<svg viewBox="0 0 100 100" preserveAspectRatio="none">{"".join(svg_parts)}</svg>'
    )
    return f'<div class="cell">{head}<div class="canvas-wrap"><img src="data:image/jpeg;base64,{image_b64}" alt=""/>{svg}</div></div>'


def _html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _discover_fixtures(fixtures_dir: Path) -> list[Path]:
    """Return all image files in fixtures_dir (non-recursive, sorted)."""
    if not fixtures_dir.is_dir():
        raise SystemExit(f"Fixtures dir not found: {fixtures_dir}")
    return sorted(
        f for f in fixtures_dir.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTS
    )


def _prepare_fixture(path: Path) -> str:
    """Load, preprocess, JPEG-encode, and base64 a fixture image."""
    img = cv2.imread(str(path))
    if img is None:
        raise SystemExit(f"Could not decode image: {path}")
    prepared = prepare_image_for_vision(img)
    ok, jpeg = cv2.imencode(".jpg", prepared, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ok:
        raise SystemExit(f"Failed to JPEG-encode: {path}")
    return base64.standard_b64encode(jpeg.tobytes()).decode("ascii")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--image",
        default=None,
        help="Run a single fixture (overrides auto-discovery in fixtures/).",
    )
    parser.add_argument(
        "--fixtures-dir",
        default="fixtures",
        help="Directory to scan for fixture images (.jpg, .jpeg, .png, .webp).",
    )
    parser.add_argument("--variants", default="variants/*.md")
    parser.add_argument("--model", default="claude-sonnet-4-6")
    parser.add_argument("--thinking-budget", type=int, default=8000)
    parser.add_argument("--max-tokens", type=int, default=16000)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()

    variant_paths = sorted(_HERE.glob(args.variants))
    if not variant_paths:
        raise SystemExit(f"No variant files matched: {args.variants}")
    variants = [Variant.from_file(p) for p in variant_paths]
    logger.info(
        "Loaded %d variants: %s", len(variants), ", ".join(v.name for v in variants)
    )

    if args.image:
        fixture_paths = [Path(args.image).resolve()]
        if not fixture_paths[0].exists():
            raise SystemExit(f"Image not found: {fixture_paths[0]}")
    else:
        fixture_paths = _discover_fixtures((_HERE / args.fixtures_dir).resolve())
        if not fixture_paths:
            raise SystemExit(f"No images found in {args.fixtures_dir}/")

    logger.info("Running %d variants × %d fixtures", len(variants), len(fixture_paths))

    timestamp = time.strftime("%Y-%m-%d_%H%M%S")
    reports_written: list[Path] = []

    for fixture_path in fixture_paths:
        logger.info("━━━ Fixture: %s ━━━", fixture_path.name)
        image_b64 = _prepare_fixture(fixture_path)

        results = asyncio.run(
            _run_all(
                image_b64,
                variants,
                model=args.model,
                max_tokens=args.max_tokens,
                thinking_budget=args.thinking_budget,
            )
        )

        report_html = _render_report(results, image_b64, fixture_path.name, args.model)
        out_path = _HERE / "reports" / f"{timestamp}_{fixture_path.stem}.html"
        out_path.write_text(report_html)
        reports_written.append(out_path)
        print(f"  → Report: {out_path}")

    print(f"\n{len(reports_written)} report(s) written under {_HERE}/reports/")

    if not args.no_open:
        # Open the first report; user can navigate to others if needed.
        webbrowser.open(reports_written[0].as_uri())


if __name__ == "__main__":
    main()
