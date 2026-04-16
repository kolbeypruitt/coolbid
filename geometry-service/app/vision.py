"""Anthropic Claude Sonnet 4 vision call for floor-plan analysis."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any

import cv2
import numpy as np
from anthropic import AsyncAnthropic

from .prompts import ANALYZE_PROMPT, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

MODEL = "claude-opus-4-6"
MAX_TOKENS = 16000
THINKING_BUDGET = 8000


class VisionError(Exception):
    """Raised when the vision LLM call fails or returns unparseable output."""


def _encode_jpeg(img: np.ndarray, quality: int = 90) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise VisionError("Failed to JPEG-encode preprocessed image")
    return buf.tobytes()


def _extract_json(text: str) -> str:
    """Extract the first top-level JSON object from a string."""
    # Strip common code-fence wrappers Claude occasionally emits despite being told not to.
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    if start == -1:
        raise VisionError("No JSON object found in model response")
    depth = 0
    for i in range(start, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise VisionError("Unbalanced JSON braces in model response")


async def analyze_floor_plan(img: np.ndarray) -> dict[str, Any]:
    """Send the preprocessed image to Claude and return the parsed JSON analysis."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise VisionError("ANTHROPIC_API_KEY is not set")

    client = AsyncAnthropic(api_key=api_key)
    image_bytes = _encode_jpeg(img)
    image_b64 = base64.standard_b64encode(image_bytes).decode("ascii")

    response = await client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        thinking={"type": "enabled", "budget_tokens": THINKING_BUDGET},
        system=SYSTEM_PROMPT,
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
                    {"type": "text", "text": ANALYZE_PROMPT},
                ],
            }
        ],
    )

    text_parts = [block.text for block in response.content if block.type == "text"]
    raw = "\n".join(text_parts).strip()
    if not raw:
        raise VisionError("Model returned no text content")

    json_text = _extract_json(raw)
    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse error: %s\nRaw text: %s", exc, raw[:2000])
        raise VisionError(f"Could not parse JSON from model response: {exc}") from exc

    if not isinstance(parsed, dict):
        raise VisionError("Model JSON was not an object")
    return parsed
