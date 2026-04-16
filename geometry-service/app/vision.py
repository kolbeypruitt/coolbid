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

MODEL = "claude-sonnet-4-6"
# max_tokens is the TOTAL output budget (including extended-thinking tokens).
# At 8k/min Sonnet 4.6 tier, we can reserve up to 8000 per call. We give
# 2000 to thinking and leave ~6000 for the actual JSON — enough for a plan
# with ~20 rooms. Bump both (e.g. 16000 / 4000) on higher-tier orgs.
MAX_TOKENS = 8000
THINKING_BUDGET = 2000


class VisionError(Exception):
    """Raised when the vision LLM call fails or returns unparseable output."""


def _encode_jpeg(img: np.ndarray, quality: int = 90) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise VisionError("Failed to JPEG-encode preprocessed image")
    return buf.tobytes()


def _extract_json(text: str) -> str:
    """Extract the first top-level JSON object from a string.

    If the model's response is truncated mid-JSON (e.g. hit max_tokens while
    streaming the last room), make a best-effort repair: close any open
    brackets/braces in the same order they were opened. Better to salvage a
    plan with one partial room than reject everything.
    """
    # Strip common code-fence wrappers Claude occasionally emits despite being told not to.
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    if start == -1:
        raise VisionError("No JSON object found in model response")

    # Walk the text tracking brace/bracket depth. Stay aware of strings so a
    # `{` inside a JSON string doesn't count toward depth.
    stack: list[str] = []
    in_string = False
    escape = False
    for i in range(start, len(text)):
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                in_string = False
            continue
        if c == '"':
            in_string = True
        elif c == "{":
            stack.append("}")
        elif c == "[":
            stack.append("]")
        elif c == "}" or c == "]":
            if stack and stack[-1] == c:
                stack.pop()
                if not stack:
                    return text[start : i + 1]

    # Fell off the end with unclosed structures — truncated response. Attempt
    # a repair by appending the missing closers. If the truncation cut in the
    # middle of a key or value, the parse will still fail downstream and the
    # caller will see a clean VisionError, but this rescues many cases.
    if stack:
        tail = text.rstrip().rstrip(",")
        # Drop a trailing partial string literal so json.loads doesn't see
        # an unterminated quote (common when max_tokens hits mid-string).
        if in_string:
            last_quote = tail.rfind('"')
            if last_quote > start:
                tail = tail[:last_quote]
                tail = tail.rstrip().rstrip(",")
        repaired = tail + "".join(reversed(stack))
        logger.warning(
            "Response appears truncated; attempting repair by closing %d open bracket(s)",
            len(stack),
        )
        return repaired

    raise VisionError("Unbalanced JSON braces in model response")


async def analyze_floor_plan(img: np.ndarray) -> dict[str, Any]:
    """Send the preprocessed image to Claude and return the parsed JSON analysis."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise VisionError("ANTHROPIC_API_KEY is not set")

    client = AsyncAnthropic(api_key=api_key)
    image_bytes = _encode_jpeg(img)
    image_b64 = base64.standard_b64encode(image_bytes).decode("ascii")

    try:
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
    except Exception as exc:
        # Rate limits, auth failures, network errors — all become VisionError
        # so the FastAPI route can map them to 502 instead of a generic 500.
        logger.error("Anthropic API call failed: %s", exc)
        raise VisionError(f"Anthropic API call failed: {exc}") from exc

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
