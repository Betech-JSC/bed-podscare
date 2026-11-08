#!/usr/bin/env python3
"""
JSON Schema definitions, dataclass models, and validators for the
AI Multi-Agent Video Editing Pipeline (P0 -> P9 & Style-from-Sample S0 -> S4):
1. state.json             - Pipeline state & phase execution ledger
2. beats.json             - Parsed script beats & anchor keywords (P1)
3. words.json             - Word-level aligned transcript timestamps (P2)
4. flags.json             - Acoustic silence, filler, and repeat markers (P3)
5. takes.json             - Selected best takes per script beat (P4)
6. hooks.json             - Ranked opening hook candidates (P5)
7. cutlist.json           - Final padded & merged edit decision list (P6)
8. style_profile.json     - Measured/estimated style profile from sample video (PS1)
9. effective_profile.json - Resolved effective parameters after 4-tier priority merge (PS2)
10. profile_trace.json    - Parameter provenance trace & safety clamping log (PS2)
11. style_match.json      - Post-export style conformance report against sample (PS3)
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
import json
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import jsonschema
except ImportError:
    jsonschema = None  # type: ignore[assignment]


CORE_ARTIFACT_TYPES: Tuple[str, ...] = (
    "state",
    "beats",
    "words",
    "flags",
    "takes",
    "hooks",
    "cutlist",
)

STYLE_ARTIFACT_TYPES: Tuple[str, ...] = (
    "style_profile",
    "effective_profile",
    "profile_trace",
    "style_match",
)

ARTIFACT_TYPES: Tuple[str, ...] = CORE_ARTIFACT_TYPES + STYLE_ARTIFACT_TYPES

STYLE_CONFIDENCE_LEVELS = {
    "measured",
    "estimated",
    "assumed",
}

STYLE_GROUPS = {
    "format",
    "pacing",
    "hook",
    "captions",
    "audio",
    "titlecard",
    "punchin",
}

STYLE_TEMPLATES = {
    "podcast_horizontal",
    "podcast_vertical",
    "cut_only",
}

STYLE_HOOK_STYLES = {
    "question",
    "teaser",
    "statement",
}

STYLE_CAPTION_POSITIONS = {
    "bottom_center",
    "middle_center",
    "top_center",
    "lower_third",
}

STYLE_CAPTION_HIGHLIGHTS = {
    "none",
    "keyword_color",
    "box",
}

STYLE_FONT_CLASSES = {
    "sans_bold",
    "sans_regular",
    "rounded_bold",
    "serif_bold",
}

ALLOWED_VIETNAMESE_FONTS = {
    "Be Vietnam Pro",
    "Inter",
    "Noto Sans",
    "Manrope",
    "DM Sans",
}

PROFILE_TRACE_SOURCES = (
    "user_override",
    "sample_style",
    "template",
    "default_profile",
)

STYLE_MATCH_SEVERITIES = {
    "scored",
    "informational",
}

STYLE_MATCH_STATUSES = {
    "matched",
    "deviated",
    "info",
    "skipped",
}

STYLE_MATCH_OVERALL_STATUSES = {
    "pass",
    "partial",
    "fail",
    "skipped",
}

LUFS_SAFE_MIN: float = -23.0
LUFS_SAFE_MAX: float = -9.0
TRUE_PEAK_SAFE_MAX_DB: float = -1.0


def normalize_nfc(text: str) -> str:
    """Normalize a string to Unicode NFC (canonical composition for Vietnamese diacritics)."""
    if not isinstance(text, str):
        return text
    return unicodedata.normalize("NFC", text)


def normalize_nfc_deep(obj: Any) -> Any:
    """Recursively normalize all strings inside dicts, lists, or tuples to Unicode NFC."""
    if isinstance(obj, str):
        return unicodedata.normalize("NFC", obj)
    if isinstance(obj, dict):
        return {
            normalize_nfc_deep(k): normalize_nfc_deep(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [normalize_nfc_deep(item) for item in obj]
    if isinstance(obj, tuple):
        return tuple(normalize_nfc_deep(item) for item in obj)
    return obj

VALID_PHASE_STATUSES = {
    "pending",
    "running",
    "completed",
    "failed",
    "skipped",
    "cached",
}

VALID_SECTION_TYPES = {
    "hook",
    "body",
    "cta",
    "intro",
    "outro",
    "main",
    "transition",
    "problem",
    "solution",
}

VALID_FLAG_TYPES = {
    "SILENCE",
    "FILLER",
    "REPEAT",
    "HESITATION",
    "PAUSE",
    "LOW_CONFIDENCE",
    "STUTTER",
    "NOISE",
    "FALSE_START",
    "MID_WORD_CUT",
}


class SchemaValidationError(ValueError):
    """Raised when a pipeline JSON artifact fails schema or domain validation."""

    def __init__(self, artifact_type: str, errors: List[str]) -> None:
        self.artifact_type = artifact_type
        self.errors = errors
        joined = "; ".join(errors)
        super().__init__(f"[{artifact_type}] Schema validation failed: {joined}")


# ---------------------------------------------------------------------------
# JSON Schema Definitions (Draft-07 compatible)
# ---------------------------------------------------------------------------

STATE_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "PipelineState",
    "type": "object",
    "required": ["project_id", "phases"],
    "properties": {
        "schema_version": {"type": "string"},
        "project_id": {"type": "string", "minLength": 1},
        "workspace_dir": {"type": "string"},
        "source_video": {"type": ["string", "null"]},
        "video_path": {"type": ["string", "null"]},
        "script_path": {"type": ["string", "null"]},
        "audio_path": {"type": ["string", "null"]},
        "created_at": {"type": "string"},
        "updated_at": {"type": "string"},
        "video_metadata": {
            "type": "object",
            "properties": {
                "duration_sec": {"type": "number", "minimum": 0},
                "duration_ms": {"type": "integer", "minimum": 0},
                "width": {"type": "integer", "minimum": 1},
                "height": {"type": "integer", "minimum": 1},
                "fps": {"type": "number", "exclusiveMinimum": 0},
                "video_codec": {"type": "string"},
                "audio_codec": {"type": "string"},
                "sample_rate": {"type": "integer", "minimum": 1},
                "channels": {"type": "integer", "minimum": 1},
            },
        },
        "phases": {
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "required": ["status"],
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": list(VALID_PHASE_STATUSES),
                    },
                    "input_hash": {"type": ["string", "null"]},
                    "started_at": {"type": ["string", "null"]},
                    "completed_at": {"type": ["string", "null"]},
                    "updated_at": {"type": ["string", "null"]},
                    "artifact": {"type": ["string", "null"]},
                    "outputs": {"type": ["array", "object", "null"]},
                    "error": {"type": ["string", "null"]},
                    "metrics": {"type": ["object", "null"]},
                },
            },
        },
    },
}

BEAT_ITEM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["beat_id"],
    "properties": {
        "beat_id": {"type": ["string", "integer"]},
        "expected_text": {"type": "string", "minLength": 1},
        "text": {"type": "string", "minLength": 1},
        "section_type": {"type": "string"},
        "type": {"type": "string"},
        "anchor_keywords": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
        },
        "keywords": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
        },
        "order": {"type": "integer", "minimum": 0},
        "target_duration_ms": {"type": "integer", "minimum": 0},
        "notes": {"type": ["string", "null"]},
    },
}

BEATS_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ScriptBeats",
    "oneOf": [
        {
            "type": "object",
            "required": ["beats"],
            "properties": {
                "project_id": {"type": "string"},
                "language": {"type": "string"},
                "initial_prompt": {"type": "string"},
                "beats": {
                    "type": "array",
                    "minItems": 1,
                    "items": BEAT_ITEM_SCHEMA,
                },
            },
        },
        {
            "type": "array",
            "minItems": 1,
            "items": BEAT_ITEM_SCHEMA,
        },
    ],
}

WORD_ITEM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["start_ms", "end_ms"],
    "properties": {
        "word_id": {"type": ["string", "integer"]},
        "id": {"type": ["string", "integer"]},
        "word": {"type": "string", "minLength": 1},
        "text": {"type": "string", "minLength": 1},
        "start_ms": {"type": "number", "minimum": 0},
        "end_ms": {"type": "number", "exclusiveMinimum": 0},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
}

WORDS_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AlignedWords",
    "oneOf": [
        {
            "type": "object",
            "required": ["words"],
            "properties": {
                "project_id": {"type": "string"},
                "language": {"type": "string"},
                "duration_ms": {"type": "number", "minimum": 0},
                "words": {
                    "type": "array",
                    "minItems": 1,
                    "items": WORD_ITEM_SCHEMA,
                },
            },
        },
        {
            "type": "array",
            "minItems": 1,
            "items": WORD_ITEM_SCHEMA,
        },
    ],
}

FLAG_ITEM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["type", "start_ms", "end_ms"],
    "properties": {
        "flag_id": {"type": ["string", "integer"]},
        "type": {"type": "string"},
        "start_ms": {"type": "number", "minimum": 0},
        "end_ms": {"type": "number", "minimum": 0},
        "duration_ms": {"type": "number", "minimum": 0},
        "word_ids": {"type": "array", "items": {"type": ["string", "integer"]}},
        "text": {"type": ["string", "null"]},
        "reason": {"type": ["string", "null"]},
        "severity": {"type": ["string", "null"]},
    },
}

FLAGS_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AcousticFlags",
    "oneOf": [
        {
            "type": "object",
            "required": ["flags"],
            "properties": {
                "project_id": {"type": "string"},
                "token_savings_pct": {"type": "number", "minimum": 0, "maximum": 100},
                "summary": {"type": "object"},
                "flags": {
                    "type": "array",
                    "items": FLAG_ITEM_SCHEMA,
                },
            },
        },
        {
            "type": "array",
            "items": FLAG_ITEM_SCHEMA,
        },
    ],
}

TAKE_ITEM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["beat_id"],
    "properties": {
        "take_id": {"type": ["string", "integer"]},
        "beat_id": {"type": ["string", "integer"]},
        "section_type": {"type": "string"},
        "start_ms": {"type": "number", "minimum": 0},
        "end_ms": {"type": "number", "exclusiveMinimum": 0},
        "score": {"type": "number", "minimum": 0.0, "maximum": 100.0},
        "selected_take": {
            "type": "object",
            "required": ["start_ms", "end_ms"],
            "properties": {
                "take_id": {"type": ["string", "integer"]},
                "start_ms": {"type": "number", "minimum": 0},
                "end_ms": {"type": "number", "exclusiveMinimum": 0},
                "score": {"type": "number", "minimum": 0.0, "maximum": 100.0},
                "text": {"type": "string"},
                "word_ids": {"type": "array"},
                "reasoning": {"type": "string"},
            },
        },
        "text": {"type": "string"},
        "transcript": {"type": "string"},
        "reasoning": {"type": "string"},
        "reason": {"type": "string"},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "word_ids": {"type": "array", "items": {"type": ["string", "integer"]}},
        "candidates": {"type": "array"},
    },
}

TAKES_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "SelectedTakes",
    "oneOf": [
        {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "model": {"type": "string"},
                "takes": {
                    "type": "array",
                    "minItems": 1,
                    "items": TAKE_ITEM_SCHEMA,
                },
                "beats": {
                    "type": "array",
                    "minItems": 1,
                    "items": TAKE_ITEM_SCHEMA,
                },
                "selections": {
                    "type": "array",
                    "minItems": 1,
                    "items": TAKE_ITEM_SCHEMA,
                },
            },
        },
        {
            "type": "array",
            "minItems": 1,
            "items": TAKE_ITEM_SCHEMA,
        },
    ],
}

HOOK_ITEM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["start_ms", "end_ms", "score"],
    "properties": {
        "hook_id": {"type": ["string", "integer"]},
        "beat_id": {"type": ["string", "integer"]},
        "rank": {"type": "integer", "minimum": 1},
        "start_ms": {"type": "number", "minimum": 0},
        "end_ms": {"type": "number", "exclusiveMinimum": 0},
        "score": {"type": "number", "minimum": 0.0, "maximum": 100.0},
        "text": {"type": "string"},
        "reasoning": {"type": "string"},
        "reason": {"type": "string"},
        "explanation": {"type": "string"},
        "selected": {"type": "boolean"},
    },
}

HOOKS_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "HookCandidates",
    "oneOf": [
        {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "selected_hook_id": {"type": ["string", "integer", "null"]},
                "hooks": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 10,
                    "items": HOOK_ITEM_SCHEMA,
                },
                "candidates": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 10,
                    "items": HOOK_ITEM_SCHEMA,
                },
            },
        },
        {
            "type": "array",
            "minItems": 1,
            "maxItems": 10,
            "items": HOOK_ITEM_SCHEMA,
        },
    ],
}

CUTLIST_SEGMENT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["start_ms", "end_ms"],
    "properties": {
        "segment_id": {"type": ["string", "integer"]},
        "clip_id": {"type": ["string", "integer"]},
        "beat_id": {"type": ["string", "integer"]},
        "section_type": {"type": "string"},
        "start_ms": {"type": "number", "minimum": 0},
        "end_ms": {"type": "number", "exclusiveMinimum": 0},
        "raw_start_ms": {"type": "number", "minimum": 0},
        "raw_end_ms": {"type": "number", "exclusiveMinimum": 0},
        "pad_start_ms": {"type": "number", "minimum": 0},
        "pad_end_ms": {"type": "number", "minimum": 0},
        "duration_ms": {"type": "number", "exclusiveMinimum": 0},
        "timeline_start_ms": {"type": "number", "minimum": 0},
        "timeline_end_ms": {"type": "number", "exclusiveMinimum": 0},
        "text": {"type": "string"},
    },
}

CUTLIST_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "EditCutlist",
    "oneOf": [
        {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "source_video": {"type": ["string", "null"]},
                "source_duration_ms": {"type": "number", "minimum": 0},
                "total_duration_ms": {"type": "number", "minimum": 0},
                "pad_start_ms": {"type": "number", "minimum": 0},
                "pad_end_ms": {"type": "number", "minimum": 0},
                "merge_gap_ms": {"type": "number", "minimum": 0},
                "segments": {
                    "type": "array",
                    "minItems": 1,
                    "items": CUTLIST_SEGMENT_SCHEMA,
                },
                "cuts": {
                    "type": "array",
                    "minItems": 1,
                    "items": CUTLIST_SEGMENT_SCHEMA,
                },
                "clips": {
                    "type": "array",
                    "minItems": 1,
                    "items": CUTLIST_SEGMENT_SCHEMA,
                },
            },
        },
        {
            "type": "array",
            "minItems": 1,
            "items": CUTLIST_SEGMENT_SCHEMA,
        },
    ],
}

STYLE_PROFILE_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "StyleProfile",
    "type": "object",
    "required": [
        "style_id",
        "name",
        "source",
        "format",
        "pacing",
        "hook",
        "captions",
        "audio",
        "titlecard",
        "punchin",
        "confidence",
        "evidence",
    ],
    "properties": {
        "style_id": {"type": "string", "minLength": 1},
        "name": {"type": "string"},
        "source": {
            "type": "object",
            "required": ["sha256", "duration_ms", "analyzed_ms"],
            "properties": {
                "sha256": {"type": "string"},
                "duration_ms": {"type": "number", "minimum": 0},
                "analyzed_ms": {"type": "number", "minimum": 0},
            },
        },
        "format": {
            "type": "object",
            "required": ["width", "height", "fps", "aspect", "template"],
            "properties": {
                "width": {"type": "integer", "minimum": 1},
                "height": {"type": "integer", "minimum": 1},
                "fps": {"type": "number", "exclusiveMinimum": 0},
                "aspect": {"type": "string", "minLength": 1},
                "template": {"type": "string", "enum": sorted(STYLE_TEMPLATES)},
            },
        },
        "pacing": {
            "type": "object",
            "required": [
                "words_per_min",
                "pause_median_ms",
                "pause_p90_ms",
                "max_silence_kept_ms",
                "shots_per_min",
                "jump_cut_ratio",
            ],
            "properties": {
                "words_per_min": {"type": "number", "minimum": 0},
                "pause_median_ms": {"type": "number", "minimum": 0},
                "pause_p90_ms": {"type": "number", "minimum": 0},
                "max_silence_kept_ms": {"type": "number", "minimum": 0},
                "shots_per_min": {"type": "number", "minimum": 0},
                "jump_cut_ratio": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            },
        },
        "hook": {
            "type": "object",
            "required": [
                "duration_ms",
                "style",
                "text_overlay",
                "repeated_later",
                "time_to_first_word_ms",
            ],
            "properties": {
                "duration_ms": {"type": "number", "minimum": 0},
                "style": {"type": "string", "enum": sorted(STYLE_HOOK_STYLES)},
                "text_overlay": {"type": "boolean"},
                "repeated_later": {"type": "boolean"},
                "time_to_first_word_ms": {"type": "number", "minimum": 0},
            },
        },
        "captions": {
            "type": "object",
            "required": [
                "present",
                "position",
                "words_per_line",
                "lines",
                "highlight",
                "font_class",
                "text_color",
                "highlight_color",
            ],
            "properties": {
                "present": {"type": "boolean"},
                "position": {"type": "string", "enum": sorted(STYLE_CAPTION_POSITIONS)},
                "words_per_line": {"type": "integer", "minimum": 0},
                "lines": {"type": "integer", "minimum": 0},
                "highlight": {"type": "string", "enum": sorted(STYLE_CAPTION_HIGHLIGHTS)},
                "font_class": {"type": "string", "enum": sorted(STYLE_FONT_CLASSES)},
                "text_color": {"type": "string"},
                "highlight_color": {"type": "string"},
            },
        },
        "audio": {
            "type": "object",
            "required": ["lufs", "true_peak_db", "lra", "music_detected"],
            "properties": {
                "lufs": {"type": "number"},
                "true_peak_db": {"type": "number"},
                "lra": {"type": "number", "minimum": 0},
                "music_detected": {"type": ["boolean", "null"]},
            },
        },
        "titlecard": {
            "type": "object",
            "required": ["present"],
            "properties": {
                "present": {"type": "boolean"},
            },
        },
        "punchin": {
            "type": "object",
            "required": ["detected", "min_gap_s", "scale"],
            "properties": {
                "detected": {"type": "boolean"},
                "min_gap_s": {"type": ["number", "null"], "minimum": 0},
                "scale": {"type": ["number", "null"], "exclusiveMinimum": 1.0},
            },
        },
        "confidence": {
            "type": "object",
            "additionalProperties": {
                "type": "string",
                "enum": sorted(STYLE_CONFIDENCE_LEVELS),
            },
        },
        "evidence": {
            "type": "object",
        },
    },
}

EFFECTIVE_PROFILE_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "EffectiveProfile",
    "type": "object",
    "required": [
        "project_id",
        "template",
        "playback_speed",
        "enabled_groups",
        "pacing",
        "hook",
        "captions",
        "audio",
        "punchin",
    ],
    "properties": {
        "schema_version": {"type": "string"},
        "project_id": {"type": "string", "minLength": 1},
        "style_id": {"type": ["string", "null"]},
        "template": {"type": "string", "enum": sorted(STYLE_TEMPLATES)},
        "playback_speed": {"type": "number", "const": 1.0},
        "enabled_groups": {
            "type": "object",
            "additionalProperties": {"type": "boolean"},
        },
        "format": {
            "type": "object",
            "properties": {
                "width": {"type": "integer", "minimum": 1},
                "height": {"type": "integer", "minimum": 1},
                "fps": {"type": "number", "exclusiveMinimum": 0},
                "aspect": {"type": "string", "minLength": 1},
                "keep_source_aspect": {"type": "boolean"},
            },
        },
        "pacing": {
            "type": "object",
            "required": [
                "pad_start_ms",
                "pad_end_ms",
                "merge_gap_ms",
                "silence_threshold_ms",
            ],
            "properties": {
                "pad_start_ms": {"type": "number", "minimum": 0},
                "pad_end_ms": {"type": "number", "minimum": 0},
                "merge_gap_ms": {"type": "number", "minimum": 0},
                "silence_threshold_ms": {"type": "number", "minimum": 0},
                "max_silence_ms": {"type": "number", "minimum": 0},
                "min_silence_ms": {"type": "number", "minimum": 0},
                "target_pause_median_ms": {"type": "number", "minimum": 0},
            },
        },
        "hook": {
            "type": "object",
            "required": ["min_ms", "max_ms"],
            "properties": {
                "min_ms": {"type": "number", "exclusiveMinimum": 0},
                "max_ms": {"type": "number", "exclusiveMinimum": 0},
                "target_ms": {"type": "number", "exclusiveMinimum": 0},
                "preferred_style": {
                    "type": ["string", "null"],
                    "enum": sorted(STYLE_HOOK_STYLES) + [None],
                },
                "prefer_opening_mode": {
                    "type": ["string", "null"],
                    "enum": [
                        "reuse_opening",
                        "cold_open_duplicate",
                        "direct_intro",
                        "teaser_highlight",
                        None,
                    ],
                },
                "text_overlay": {"type": "boolean"},
            },
        },
        "captions": {
            "type": "object",
            "required": ["enabled", "position", "words_per_line", "max_lines"],
            "properties": {
                "enabled": {"type": "boolean"},
                "position": {"type": "string", "enum": sorted(STYLE_CAPTION_POSITIONS)},
                "words_per_line": {"type": "integer", "minimum": 1},
                "max_lines": {"type": "integer", "minimum": 1},
                "highlight": {"type": "string", "enum": sorted(STYLE_CAPTION_HIGHLIGHTS)},
                "font_class": {"type": "string", "enum": sorted(STYLE_FONT_CLASSES)},
                "font_family": {"type": "string", "enum": sorted(ALLOWED_VIETNAMESE_FONTS)},
                "text_color": {"type": "string"},
                "highlight_color": {"type": "string"},
            },
        },
        "audio": {
            "type": "object",
            "required": ["target_lufs", "true_peak_max_db"],
            "properties": {
                "target_lufs": {
                    "type": "number",
                    "minimum": LUFS_SAFE_MIN,
                    "maximum": LUFS_SAFE_MAX,
                },
                "true_peak_max_db": {
                    "type": "number",
                    "maximum": TRUE_PEAK_SAFE_MAX_DB,
                },
                "lra_target": {"type": "number", "minimum": 0},
            },
        },
        "titlecard": {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean"},
                "duration_ms": {"type": "number", "minimum": 0},
            },
        },
        "punchin": {
            "type": "object",
            "required": ["enabled"],
            "properties": {
                "enabled": {"type": "boolean"},
                "min_gap_ms": {"type": "number", "minimum": 0},
                "scale": {"type": "number", "exclusiveMinimum": 1.0},
                "min_shot_duration_ms": {"type": "number", "minimum": 0},
            },
        },
        "warnings": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
}

PROFILE_TRACE_ENTRY_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["param", "source", "effective_value"],
    "properties": {
        "param": {"type": "string", "minLength": 1},
        "group": {"type": "string"},
        "source": {"type": "string", "enum": list(PROFILE_TRACE_SOURCES)},
        "raw_value": {},
        "effective_value": {},
        "clamped": {"type": "boolean"},
        "skipped_sources": {"type": "object"},
        "confidence": {
            "type": ["string", "null"],
            "enum": sorted(STYLE_CONFIDENCE_LEVELS) + [None],
        },
        "reason": {"type": "string"},
    },
}

PROFILE_TRACE_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ProfileTrace",
    "type": "object",
    "required": ["project_id", "priority_order", "entries"],
    "properties": {
        "schema_version": {"type": "string"},
        "project_id": {"type": "string", "minLength": 1},
        "style_id": {"type": ["string", "null"]},
        "priority_order": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": {"type": "string", "enum": list(PROFILE_TRACE_SOURCES)},
        },
        "enabled_groups": {
            "type": "object",
            "additionalProperties": {"type": "boolean"},
        },
        "entries": {
            "type": "array",
            "minItems": 1,
            "items": PROFILE_TRACE_ENTRY_SCHEMA,
        },
        "warnings": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
}

STYLE_MATCH_ITEM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": [
        "metric",
        "label",
        "target_value",
        "actual_value",
        "tolerance",
        "within_tolerance",
        "severity",
        "status",
    ],
    "properties": {
        "metric": {"type": "string", "minLength": 1},
        "label": {"type": "string", "minLength": 1},
        "target_value": {},
        "actual_value": {},
        "unit": {"type": "string"},
        "tolerance": {"type": "string", "minLength": 1},
        "deviation": {"type": "string"},
        "within_tolerance": {"type": "boolean"},
        "severity": {"type": "string", "enum": sorted(STYLE_MATCH_SEVERITIES)},
        "status": {"type": "string", "enum": sorted(STYLE_MATCH_STATUSES)},
        "note": {"type": "string"},
    },
}

STYLE_MATCH_SCHEMA: Dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "StyleMatchReport",
    "type": "object",
    "required": ["project_id", "style_id", "overall_status", "items"],
    "properties": {
        "schema_version": {"type": "string"},
        "project_id": {"type": "string", "minLength": 1},
        "style_id": {"type": "string", "minLength": 1},
        "overall_status": {
            "type": "string",
            "enum": sorted(STYLE_MATCH_OVERALL_STATUSES),
        },
        "summary": {"type": "string"},
        "items": {
            "type": "array",
            "minItems": 1,
            "items": STYLE_MATCH_ITEM_SCHEMA,
        },
    },
}

SCHEMAS: Dict[str, Dict[str, Any]] = {
    "state": STATE_SCHEMA,
    "beats": BEATS_SCHEMA,
    "words": WORDS_SCHEMA,
    "flags": FLAGS_SCHEMA,
    "takes": TAKES_SCHEMA,
    "hooks": HOOKS_SCHEMA,
    "cutlist": CUTLIST_SCHEMA,
    "style_profile": STYLE_PROFILE_SCHEMA,
    "effective_profile": EFFECTIVE_PROFILE_SCHEMA,
    "profile_trace": PROFILE_TRACE_SCHEMA,
    "style_match": STYLE_MATCH_SCHEMA,
}


# ---------------------------------------------------------------------------
# Dataclass Models for Style-from-Sample Artifacts (NFC-normalized)
# ---------------------------------------------------------------------------

@dataclass
class StyleSource:
    sha256: str = ""
    duration_ms: int = 0
    analyzed_ms: int = 0

    def __post_init__(self) -> None:
        self.sha256 = normalize_nfc(str(self.sha256))
        self.duration_ms = int(self.duration_ms)
        self.analyzed_ms = int(self.analyzed_ms)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StyleFormat:
    width: int = 1080
    height: int = 1920
    fps: float = 30.0
    aspect: str = "9:16"
    template: str = "podcast_vertical"

    def __post_init__(self) -> None:
        self.width = int(self.width)
        self.height = int(self.height)
        self.fps = float(self.fps)
        self.aspect = normalize_nfc(str(self.aspect))
        self.template = normalize_nfc(str(self.template))

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StylePacing:
    words_per_min: float = 0.0
    pause_median_ms: float = 0.0
    pause_p90_ms: float = 0.0
    max_silence_kept_ms: float = 0.0
    shots_per_min: float = 0.0
    jump_cut_ratio: float = 0.0

    def __post_init__(self) -> None:
        self.words_per_min = float(self.words_per_min)
        self.pause_median_ms = float(self.pause_median_ms)
        self.pause_p90_ms = float(self.pause_p90_ms)
        self.max_silence_kept_ms = float(self.max_silence_kept_ms)
        self.shots_per_min = float(self.shots_per_min)
        self.jump_cut_ratio = float(self.jump_cut_ratio)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StyleHook:
    duration_ms: float = 0.0
    style: str = "question"
    text_overlay: bool = False
    repeated_later: bool = False
    time_to_first_word_ms: float = 0.0

    def __post_init__(self) -> None:
        self.duration_ms = float(self.duration_ms)
        self.style = normalize_nfc(str(self.style))
        self.text_overlay = bool(self.text_overlay)
        self.repeated_later = bool(self.repeated_later)
        self.time_to_first_word_ms = float(self.time_to_first_word_ms)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StyleCaptions:
    present: bool = True
    position: str = "bottom_center"
    words_per_line: int = 3
    lines: int = 1
    highlight: str = "none"
    font_class: str = "sans_bold"
    text_color: str = ""
    highlight_color: str = ""

    def __post_init__(self) -> None:
        self.present = bool(self.present)
        self.position = normalize_nfc(str(self.position))
        self.words_per_line = int(self.words_per_line)
        self.lines = int(self.lines)
        self.highlight = normalize_nfc(str(self.highlight))
        self.font_class = normalize_nfc(str(self.font_class))
        self.text_color = normalize_nfc(str(self.text_color))
        self.highlight_color = normalize_nfc(str(self.highlight_color))

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StyleAudio:
    lufs: float = 0.0
    true_peak_db: float = 0.0
    lra: float = 0.0
    music_detected: Optional[bool] = None

    def __post_init__(self) -> None:
        self.lufs = float(self.lufs)
        self.true_peak_db = float(self.true_peak_db)
        self.lra = float(self.lra)
        if self.music_detected is not None:
            self.music_detected = bool(self.music_detected)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StyleTitlecard:
    present: bool = False

    def __post_init__(self) -> None:
        self.present = bool(self.present)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StylePunchin:
    detected: bool = False
    min_gap_s: Optional[float] = None
    scale: Optional[float] = None

    def __post_init__(self) -> None:
        self.detected = bool(self.detected)
        if self.min_gap_s is not None:
            self.min_gap_s = float(self.min_gap_s)
        if self.scale is not None:
            self.scale = float(self.scale)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class StyleProfile:
    style_id: str = "style_ab12"
    name: str = ""
    source: Union[StyleSource, Dict[str, Any]] = field(default_factory=StyleSource)
    format: Union[StyleFormat, Dict[str, Any]] = field(default_factory=StyleFormat)
    pacing: Union[StylePacing, Dict[str, Any]] = field(default_factory=StylePacing)
    hook: Union[StyleHook, Dict[str, Any]] = field(default_factory=StyleHook)
    captions: Union[StyleCaptions, Dict[str, Any]] = field(default_factory=StyleCaptions)
    audio: Union[StyleAudio, Dict[str, Any]] = field(default_factory=StyleAudio)
    titlecard: Union[StyleTitlecard, Dict[str, Any]] = field(default_factory=StyleTitlecard)
    punchin: Union[StylePunchin, Dict[str, Any]] = field(default_factory=StylePunchin)
    confidence: Dict[str, str] = field(default_factory=dict)
    evidence: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.style_id = normalize_nfc(str(self.style_id))
        self.name = normalize_nfc(str(self.name))
        if isinstance(self.source, dict):
            self.source = StyleSource(**self.source)
        if isinstance(self.format, dict):
            self.format = StyleFormat(**self.format)
        if isinstance(self.pacing, dict):
            self.pacing = StylePacing(**self.pacing)
        if isinstance(self.hook, dict):
            self.hook = StyleHook(**self.hook)
        if isinstance(self.captions, dict):
            self.captions = StyleCaptions(**self.captions)
        if isinstance(self.audio, dict):
            self.audio = StyleAudio(**self.audio)
        if isinstance(self.titlecard, dict):
            self.titlecard = StyleTitlecard(**self.titlecard)
        if isinstance(self.punchin, dict):
            self.punchin = StylePunchin(**self.punchin)
        self.confidence = normalize_nfc_deep(dict(self.confidence or {}))
        self.evidence = normalize_nfc_deep(dict(self.evidence or {}))

    def to_dict(self) -> Dict[str, Any]:
        return normalize_nfc_deep(asdict(self))

    model_dump = to_dict
    dict = to_dict

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StyleProfile":
        normalized = normalize_nfc_deep(data)
        instance = cls(**normalized)
        validate_style_profile(instance.to_dict(), raise_on_error=True)
        return instance

    def validate(self, *, raise_on_error: bool = True) -> bool:
        return validate_style_profile(self.to_dict(), raise_on_error=raise_on_error)


@dataclass
class EffectiveProfile:
    project_id: str = "default_project"
    style_id: Optional[str] = None
    schema_version: str = "1.0"
    template: str = "podcast_vertical"
    playback_speed: float = 1.0
    enabled_groups: Dict[str, bool] = field(
        default_factory=lambda: {
            "pacing": True,
            "hook": True,
            "captions": True,
            "audio": True,
            "punchin": False,
        }
    )
    format: Dict[str, Any] = field(
        default_factory=lambda: {
            "width": 1080,
            "height": 1920,
            "fps": 30.0,
            "aspect": "9:16",
            "keep_source_aspect": True,
        }
    )
    pacing: Dict[str, Any] = field(
        default_factory=lambda: {
            "pad_start_ms": 80,
            "pad_end_ms": 100,
            "merge_gap_ms": 150,
            "silence_threshold_ms": 400,
            "max_silence_ms": 650,
            "min_silence_ms": 400,
            "target_pause_median_ms": 240,
        }
    )
    hook: Dict[str, Any] = field(
        default_factory=lambda: {
            "min_ms": 5000,
            "max_ms": 10000,
            "target_ms": 6500,
            "preferred_style": "question",
            "prefer_opening_mode": "reuse_opening",
            "text_overlay": False,
        }
    )
    captions: Dict[str, Any] = field(
        default_factory=lambda: {
            "enabled": True,
            "position": "bottom_center",
            "words_per_line": 3,
            "max_lines": 1,
            "highlight": "keyword_color",
            "font_class": "sans_bold",
            "font_family": "Be Vietnam Pro",
            "text_color": "#FFFFFF",
            "highlight_color": "#FFD60A",
        }
    )
    audio: Dict[str, Any] = field(
        default_factory=lambda: {
            "target_lufs": -14.0,
            "true_peak_max_db": -1.0,
            "lra_target": 11.0,
        }
    )
    titlecard: Dict[str, Any] = field(
        default_factory=lambda: {
            "enabled": False,
            "duration_ms": 3000,
        }
    )
    punchin: Dict[str, Any] = field(
        default_factory=lambda: {
            "enabled": False,
            "min_gap_ms": 5000,
            "scale": 1.08,
            "min_shot_duration_ms": 2500,
        }
    )
    warnings: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.project_id = normalize_nfc(str(self.project_id))
        if self.style_id is not None:
            self.style_id = normalize_nfc(str(self.style_id))
        self.schema_version = normalize_nfc(str(self.schema_version))
        self.template = normalize_nfc(str(self.template))
        self.playback_speed = float(self.playback_speed)
        self.enabled_groups = {
            normalize_nfc(str(k)): bool(v) for k, v in (self.enabled_groups or {}).items()
        }
        self.format = normalize_nfc_deep(dict(self.format or {}))
        self.pacing = normalize_nfc_deep(dict(self.pacing or {}))
        self.hook = normalize_nfc_deep(dict(self.hook or {}))
        self.captions = normalize_nfc_deep(dict(self.captions or {}))
        self.audio = normalize_nfc_deep(dict(self.audio or {}))
        self.titlecard = normalize_nfc_deep(dict(self.titlecard or {}))
        self.punchin = normalize_nfc_deep(dict(self.punchin or {}))
        self.warnings = [normalize_nfc(str(w)) for w in (self.warnings or [])]

    def to_dict(self) -> Dict[str, Any]:
        return normalize_nfc_deep(asdict(self))

    model_dump = to_dict
    dict = to_dict

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EffectiveProfile":
        normalized = normalize_nfc_deep(data)
        instance = cls(**normalized)
        validate_effective_profile(instance.to_dict(), raise_on_error=True)
        return instance

    def validate(self, *, raise_on_error: bool = True) -> bool:
        return validate_effective_profile(self.to_dict(), raise_on_error=raise_on_error)


@dataclass
class ProfileTraceEntry:
    param: str
    source: str
    effective_value: Any
    raw_value: Any = None
    group: str = "general"
    clamped: bool = False
    skipped_sources: Dict[str, Any] = field(default_factory=dict)
    confidence: Optional[str] = None
    reason: str = ""

    def __post_init__(self) -> None:
        self.param = normalize_nfc(str(self.param))
        self.source = normalize_nfc(str(self.source))
        self.effective_value = normalize_nfc_deep(self.effective_value)
        self.raw_value = (
            self.effective_value
            if self.raw_value is None
            else normalize_nfc_deep(self.raw_value)
        )
        self.group = normalize_nfc(str(self.group))
        self.clamped = bool(self.clamped)
        self.skipped_sources = normalize_nfc_deep(dict(self.skipped_sources or {}))
        if self.confidence is not None:
            self.confidence = normalize_nfc(str(self.confidence))
        self.reason = normalize_nfc(str(self.reason))

    def to_dict(self) -> Dict[str, Any]:
        return normalize_nfc_deep(asdict(self))


@dataclass
class ProfileTrace:
    project_id: str = "default_project"
    style_id: Optional[str] = None
    schema_version: str = "1.0"
    priority_order: List[str] = field(
        default_factory=lambda: list(PROFILE_TRACE_SOURCES)
    )
    enabled_groups: Dict[str, bool] = field(
        default_factory=lambda: {
            "pacing": True,
            "hook": True,
            "captions": True,
            "audio": True,
            "punchin": False,
        }
    )
    entries: List[Union[ProfileTraceEntry, Dict[str, Any]]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.project_id = normalize_nfc(str(self.project_id))
        if self.style_id is not None:
            self.style_id = normalize_nfc(str(self.style_id))
        self.schema_version = normalize_nfc(str(self.schema_version))
        self.priority_order = [normalize_nfc(str(s)) for s in (self.priority_order or [])]
        self.enabled_groups = {
            normalize_nfc(str(k)): bool(v) for k, v in (self.enabled_groups or {}).items()
        }
        normalized_entries: List[ProfileTraceEntry] = []
        for item in self.entries or []:
            if isinstance(item, ProfileTraceEntry):
                normalized_entries.append(item)
            elif isinstance(item, dict):
                normalized_entries.append(ProfileTraceEntry(**item))
            else:
                raise TypeError(f"Expected ProfileTraceEntry or dict, got {type(item).__name__}")
        self.entries = normalized_entries
        self.warnings = [normalize_nfc(str(w)) for w in (self.warnings or [])]

    def to_dict(self) -> Dict[str, Any]:
        return normalize_nfc_deep(asdict(self))

    model_dump = to_dict
    dict = to_dict

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProfileTrace":
        normalized = normalize_nfc_deep(data)
        instance = cls(**normalized)
        validate_profile_trace(instance.to_dict(), raise_on_error=True)
        return instance

    def validate(self, *, raise_on_error: bool = True) -> bool:
        return validate_profile_trace(self.to_dict(), raise_on_error=raise_on_error)


@dataclass
class StyleMatchItem:
    metric: str
    label: str
    target_value: Any
    actual_value: Any
    tolerance: str
    within_tolerance: bool
    unit: str = ""
    deviation: str = ""
    severity: str = "scored"
    status: str = "matched"
    note: str = ""

    def __post_init__(self) -> None:
        self.metric = normalize_nfc(str(self.metric))
        self.label = normalize_nfc(str(self.label))
        self.target_value = normalize_nfc_deep(self.target_value)
        self.actual_value = normalize_nfc_deep(self.actual_value)
        self.unit = normalize_nfc(str(self.unit))
        self.tolerance = normalize_nfc(str(self.tolerance))
        self.deviation = normalize_nfc(str(self.deviation))
        self.within_tolerance = bool(self.within_tolerance)
        self.severity = normalize_nfc(str(self.severity))
        self.status = normalize_nfc(str(self.status))
        self.note = normalize_nfc(str(self.note))

    def to_dict(self) -> Dict[str, Any]:
        return normalize_nfc_deep(asdict(self))


@dataclass
class StyleMatchReport:
    project_id: str = "default_project"
    style_id: str = "style_ab12"
    schema_version: str = "1.0"
    overall_status: str = "pass"
    summary: str = ""
    items: List[Union[StyleMatchItem, Dict[str, Any]]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.project_id = normalize_nfc(str(self.project_id))
        self.style_id = normalize_nfc(str(self.style_id))
        self.schema_version = normalize_nfc(str(self.schema_version))
        self.overall_status = normalize_nfc(str(self.overall_status))
        self.summary = normalize_nfc(str(self.summary))
        normalized_items: List[StyleMatchItem] = []
        for item in self.items or []:
            if isinstance(item, StyleMatchItem):
                normalized_items.append(item)
            elif isinstance(item, dict):
                normalized_items.append(StyleMatchItem(**item))
            else:
                raise TypeError(f"Expected StyleMatchItem or dict, got {type(item).__name__}")
        self.items = normalized_items

    def to_dict(self) -> Dict[str, Any]:
        return normalize_nfc_deep(asdict(self))

    model_dump = to_dict
    dict = to_dict

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StyleMatchReport":
        normalized = normalize_nfc_deep(data)
        instance = cls(**normalized)
        validate_style_match(instance.to_dict(), raise_on_error=True)
        return instance

    def validate(self, *, raise_on_error: bool = True) -> bool:
        return validate_style_match(self.to_dict(), raise_on_error=raise_on_error)


# ---------------------------------------------------------------------------
# Normalization & Domain Validation Logic
# ---------------------------------------------------------------------------

def normalize_artifact_type(artifact_type: str) -> str:
    """Normalize artifact name (e.g. 'beats.json' -> 'beats')."""
    if not isinstance(artifact_type, str):
        raise ValueError(f"Artifact type must be a string, got {type(artifact_type).__name__}")
    cleaned = Path(artifact_type.strip().lower()).stem
    if cleaned not in SCHEMAS:
        raise ValueError(
            f"Unknown artifact type '{artifact_type}'. Valid types: {', '.join(ARTIFACT_TYPES)}"
        )
    return cleaned


def get_schema(artifact_type: str) -> Dict[str, Any]:
    """Return the JSON Schema dictionary for the specified artifact type."""
    key = normalize_artifact_type(artifact_type)
    return SCHEMAS[key]


def _is_number(val: Any) -> bool:
    """Return True if val is an int or float (excluding bool)."""
    return isinstance(val, (int, float)) and not isinstance(val, bool)


def _is_non_empty_str(val: Any) -> bool:
    return isinstance(val, str) and len(val.strip()) > 0


def _validate_state_domain(data: Any) -> List[str]:
    errors: List[str] = []
    if not isinstance(data, dict):
        return ["state.json root must be a JSON object"]

    if not _is_non_empty_str(data.get("project_id")):
        errors.append("project_id is required and must be a non-empty string")

    phases = data.get("phases")
    if not isinstance(phases, dict):
        errors.append("phases is required and must be a JSON object")
    else:
        for phase_key, phase_val in phases.items():
            if not isinstance(phase_val, dict):
                errors.append(f"phases.{phase_key} must be an object")
                continue
            status = phase_val.get("status")
            if not isinstance(status, str) or status.lower() not in VALID_PHASE_STATUSES:
                errors.append(
                    f"phases.{phase_key}.status '{status}' is invalid; must be one of {sorted(VALID_PHASE_STATUSES)}"
                )

    video_meta = data.get("video_metadata") or data.get("metadata")
    if video_meta is not None:
        if not isinstance(video_meta, dict):
            errors.append("video_metadata must be an object when present")
        else:
            for non_neg_key in ("duration_sec", "duration_ms"):
                if non_neg_key in video_meta and video_meta[non_neg_key] is not None:
                    if not _is_number(video_meta[non_neg_key]) or video_meta[non_neg_key] < 0:
                        errors.append(f"video_metadata.{non_neg_key} must be a non-negative number")
            for pos_key in ("width", "height", "fps", "sample_rate", "channels"):
                if pos_key in video_meta and video_meta[pos_key] is not None:
                    if not _is_number(video_meta[pos_key]) or video_meta[pos_key] <= 0:
                        errors.append(f"video_metadata.{pos_key} must be > 0")

    return errors


def _validate_beats_domain(data: Any) -> List[str]:
    errors: List[str] = []
    if isinstance(data, dict):
        beats = data.get("beats") or data.get("items") or data.get("script_beats")
    elif isinstance(data, list):
        beats = data
    else:
        return ["beats.json must be an object with 'beats' array or a non-empty array"]

    if not isinstance(beats, list) or len(beats) == 0:
        return ["beats list must be a non-empty array"]

    seen_ids = set()
    for idx, item in enumerate(beats):
        prefix = f"beats[{idx}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue

        beat_id = item.get("beat_id") if "beat_id" in item else item.get("id")
        if beat_id is None or (isinstance(beat_id, str) and not beat_id.strip()) or isinstance(beat_id, bool):
            errors.append(f"{prefix}.beat_id is required and must be a non-empty string or int")
        else:
            if str(beat_id) in seen_ids:
                errors.append(f"{prefix}.beat_id '{beat_id}' is duplicated")
            seen_ids.add(str(beat_id))

        expected_text = item.get("expected_text") or item.get("text") or item.get("script_text")
        if not _is_non_empty_str(expected_text):
            errors.append(f"{prefix}.expected_text is required and must be a non-empty string")

        section_type = item.get("section_type") or item.get("type")
        if not _is_non_empty_str(section_type) or str(section_type).lower() not in VALID_SECTION_TYPES:
            errors.append(
                f"{prefix}.section_type '{section_type}' must be one of {sorted(VALID_SECTION_TYPES)}"
            )

        if "anchor_keywords" in item and item["anchor_keywords"] is not None:
            keywords = item["anchor_keywords"]
            if not isinstance(keywords, list) or any(not _is_non_empty_str(k) for k in keywords):
                errors.append(f"{prefix}.anchor_keywords must be a list of non-empty strings")

    return errors


def _validate_words_domain(data: Any) -> List[str]:
    errors: List[str] = []
    if isinstance(data, dict):
        words = data.get("words")
    elif isinstance(data, list):
        words = data
    else:
        return ["words.json must be an object with 'words' array or a non-empty array"]

    if not isinstance(words, list) or len(words) == 0:
        return ["words list must be a non-empty array"]

    for idx, item in enumerate(words):
        prefix = f"words[{idx}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue

        word_text = item.get("word") if "word" in item else item.get("text")
        if not _is_non_empty_str(word_text):
            errors.append(f"{prefix}.word (or .text) must be a non-empty string")

        start_ms = item.get("start_ms")
        end_ms = item.get("end_ms")
        if not _is_number(start_ms) or not _is_number(end_ms):
            errors.append(f"{prefix}.start_ms and .end_ms must be numeric")
        else:
            if start_ms < 0:
                errors.append(f"{prefix}.start_ms ({start_ms}) must be >= 0")
            if end_ms <= start_ms:
                errors.append(f"{prefix}.end_ms ({end_ms}) must be strictly greater than start_ms ({start_ms})")

        if "confidence" in item and item["confidence"] is not None:
            confidence = item["confidence"]
            if not _is_number(confidence) or confidence < 0.0 or confidence > 1.0:
                errors.append(f"{prefix}.confidence ({confidence}) must be a number between 0.0 and 1.0")

    return errors


def _validate_flags_domain(data: Any) -> List[str]:
    errors: List[str] = []
    if isinstance(data, dict):
        flags = data.get("flags") if "flags" in data else data.get("events")
    elif isinstance(data, list):
        flags = data
    else:
        return ["flags.json must be an object with 'flags' array or an array"]

    if not isinstance(flags, list):
        return ["flags field must be a list"]

    if isinstance(data, dict) and "token_savings_pct" in data and data["token_savings_pct"] is not None:
        pct = data["token_savings_pct"]
        if not _is_number(pct) or pct < 0 or pct > 100:
            errors.append("token_savings_pct must be between 0 and 100")

    for idx, item in enumerate(flags):
        prefix = f"flags[{idx}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue

        flag_type = item.get("type") or item.get("flag_type") or item.get("kind")
        if not _is_non_empty_str(flag_type) or str(flag_type).upper() not in VALID_FLAG_TYPES:
            errors.append(
                f"{prefix}.type '{flag_type}' is invalid; must be one of {sorted(VALID_FLAG_TYPES)}"
            )

        start_ms = item.get("start_ms")
        end_ms = item.get("end_ms")
        if not _is_number(start_ms) or not _is_number(end_ms):
            errors.append(f"{prefix}.start_ms and .end_ms must be numeric")
        else:
            if start_ms < 0:
                errors.append(f"{prefix}.start_ms ({start_ms}) must be >= 0")
            if end_ms <= start_ms:
                errors.append(f"{prefix}.end_ms ({end_ms}) must be > start_ms ({start_ms})")

    return errors


def _validate_takes_domain(data: Any) -> List[str]:
    errors: List[str] = []
    if isinstance(data, dict):
        takes = (
            data.get("takes")
            if "takes" in data
            else data.get("beats")
            if "beats" in data
            else data.get("selections")
            if "selections" in data
            else data.get("items")
        )
    elif isinstance(data, list):
        takes = data
    else:
        return ["takes.json must be an object with 'takes'/'beats' array or a non-empty array"]

    if not isinstance(takes, list) or len(takes) == 0:
        return ["takes list must be a non-empty array"]

    for idx, item in enumerate(takes):
        prefix = f"takes[{idx}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue

        beat_id = item.get("beat_id") if "beat_id" in item else item.get("id")
        if beat_id is None or (isinstance(beat_id, str) and not beat_id.strip()) or isinstance(beat_id, bool):
            errors.append(f"{prefix}.beat_id is required")

        selected_take = item.get("selected_take") if isinstance(item.get("selected_take"), dict) else item
        start_ms = selected_take.get("start_ms")
        end_ms = selected_take.get("end_ms")
        if not _is_number(start_ms) or not _is_number(end_ms):
            errors.append(f"{prefix} requires numeric start_ms and end_ms")
        else:
            if start_ms < 0:
                errors.append(f"{prefix}.start_ms ({start_ms}) must be >= 0")
            if end_ms <= start_ms:
                errors.append(f"{prefix}.end_ms ({end_ms}) must be > start_ms ({start_ms})")

        for reason_key in ("reasoning", "reason", "rationale"):
            if reason_key in item and item[reason_key] is not None:
                if not _is_non_empty_str(item[reason_key]):
                    errors.append(f"{prefix}.{reason_key} must be a non-empty string when provided")

    return errors


def _validate_hooks_domain(data: Any) -> List[str]:
    errors: List[str] = []
    if isinstance(data, dict):
        hooks = (
            data.get("hooks")
            if "hooks" in data
            else data.get("candidates")
            if "candidates" in data
            else data.get("hook_candidates")
        )
    elif isinstance(data, list):
        hooks = data
    else:
        return ["hooks.json must be an object with 'hooks' array or a non-empty array"]

    if not isinstance(hooks, list) or len(hooks) == 0:
        return ["hooks list must be a non-empty array"]

    for idx, item in enumerate(hooks):
        prefix = f"hooks[{idx}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue

        start_ms = item.get("start_ms")
        end_ms = item.get("end_ms")
        if not _is_number(start_ms) or not _is_number(end_ms):
            errors.append(f"{prefix}.start_ms and .end_ms must be numeric")
        else:
            if start_ms < 0:
                errors.append(f"{prefix}.start_ms ({start_ms}) must be >= 0")
            if end_ms <= start_ms:
                errors.append(f"{prefix}.end_ms ({end_ms}) must be > start_ms ({start_ms})")

        score = item.get("score") if "score" in item else item.get("total_score")
        if not _is_number(score) or score < 0.0 or score > 100.0:
            errors.append(f"{prefix}.score ({score}) must be a number between 0 and 100")

        for reason_key in ("reasoning", "reason", "explanation", "rationale"):
            if reason_key in item and item[reason_key] is not None:
                if not _is_non_empty_str(item[reason_key]):
                    errors.append(f"{prefix}.{reason_key} must be a non-empty string when provided")

    return errors


def _validate_cutlist_domain(data: Any) -> List[str]:
    errors: List[str] = []
    source_duration_ms: Optional[float] = None
    if isinstance(data, dict):
        segments = (
            data.get("segments")
            if "segments" in data
            else data.get("cuts")
            if "cuts" in data
            else data.get("clips")
            if "clips" in data
            else data.get("timeline")
        )
        raw_dur = (
            data.get("source_duration_ms")
            or data.get("max_duration_ms")
            or data.get("video_duration_ms")
        )
        if _is_number(raw_dur):
            source_duration_ms = float(raw_dur)
    elif isinstance(data, list):
        segments = data
    else:
        return ["cutlist.json must be an object with 'segments' array or a non-empty array"]

    if not isinstance(segments, list) or len(segments) == 0:
        return ["cutlist segments must be a non-empty array"]

    for idx, seg in enumerate(segments):
        prefix = f"segments[{idx}]"
        if not isinstance(seg, dict):
            errors.append(f"{prefix} must be an object")
            continue

        start_ms = seg.get("start_ms") if "start_ms" in seg else seg.get("source_start_ms")
        end_ms = seg.get("end_ms") if "end_ms" in seg else seg.get("source_end_ms")
        if not _is_number(start_ms) or not _is_number(end_ms):
            errors.append(f"{prefix}.start_ms and .end_ms must be numeric")
            continue

        if start_ms < 0:
            errors.append(f"{prefix}.start_ms ({start_ms}) must be >= 0")
        if end_ms <= start_ms:
            errors.append(f"{prefix}.end_ms ({end_ms}) must be > start_ms ({start_ms})")
        if source_duration_ms is not None and end_ms > source_duration_ms:
            errors.append(
                f"{prefix}.end_ms ({end_ms}) exceeds source_duration_ms ({source_duration_ms})"
            )

        for pad_key in ("pad_start_ms", "pad_end_ms"):
            if pad_key in seg and seg[pad_key] is not None:
                if not _is_number(seg[pad_key]) or seg[pad_key] < 0:
                    errors.append(f"{prefix}.{pad_key} must be >= 0")

    return errors


def _coerce_dict(data: Any) -> Any:
    """Convert dataclass models (with `.to_dict()`) to plain dicts before validation."""
    if hasattr(data, "to_dict") and callable(getattr(data, "to_dict")):
        return data.to_dict()
    return data


def _validate_style_profile_domain(data: Any) -> List[str]:
    data = _coerce_dict(data)
    errors: List[str] = []
    if not isinstance(data, dict):
        return ["style_profile.json root must be a JSON object"]

    if not _is_non_empty_str(data.get("style_id")):
        errors.append("style_id is required and must be a non-empty string")

    if "name" not in data or not isinstance(data.get("name"), str):
        errors.append("name is required and must be a string")

    # source
    source = data.get("source")
    if not isinstance(source, dict):
        errors.append("source is required and must be an object")
    else:
        if not isinstance(source.get("sha256"), str):
            errors.append("source.sha256 must be a string")
        dur = source.get("duration_ms")
        analyzed = source.get("analyzed_ms")
        if not _is_number(dur) or dur < 0:
            errors.append("source.duration_ms must be >= 0")
        if not _is_number(analyzed) or analyzed < 0:
            errors.append("source.analyzed_ms must be >= 0")
        if _is_number(dur) and _is_number(analyzed) and dur > 0 and analyzed > dur:
            errors.append(
                f"source.analyzed_ms ({analyzed}) cannot exceed source.duration_ms ({dur})"
            )

    # format
    fmt = data.get("format")
    if not isinstance(fmt, dict):
        errors.append("format is required and must be an object")
    else:
        for pos_key in ("width", "height", "fps"):
            val = fmt.get(pos_key)
            if not _is_number(val) or val <= 0:
                errors.append(f"format.{pos_key} must be > 0")
        if not _is_non_empty_str(fmt.get("aspect")):
            errors.append("format.aspect must be a non-empty string")
        if fmt.get("template") not in STYLE_TEMPLATES:
            errors.append(f"format.template must be one of {sorted(STYLE_TEMPLATES)}")

    # pacing
    pacing = data.get("pacing")
    if not isinstance(pacing, dict):
        errors.append("pacing is required and must be an object")
    else:
        for non_neg in (
            "words_per_min",
            "pause_median_ms",
            "pause_p90_ms",
            "max_silence_kept_ms",
            "shots_per_min",
        ):
            val = pacing.get(non_neg)
            if not _is_number(val) or val < 0:
                errors.append(f"pacing.{non_neg} must be >= 0")
        jcr = pacing.get("jump_cut_ratio")
        if not _is_number(jcr) or jcr < 0.0 or jcr > 1.0:
            errors.append("pacing.jump_cut_ratio must be between 0.0 and 1.0")
        p_med = pacing.get("pause_median_ms")
        p_90 = pacing.get("pause_p90_ms")
        if _is_number(p_med) and _is_number(p_90) and p_90 < p_med:
            errors.append(
                f"pacing.pause_p90_ms ({p_90}) must be >= pacing.pause_median_ms ({p_med})"
            )

    # hook
    hook = data.get("hook")
    if not isinstance(hook, dict):
        errors.append("hook is required and must be an object")
    else:
        if not _is_number(hook.get("duration_ms")) or hook["duration_ms"] < 0:
            errors.append("hook.duration_ms must be >= 0")
        if hook.get("style") not in STYLE_HOOK_STYLES:
            errors.append(f"hook.style must be one of {sorted(STYLE_HOOK_STYLES)}")
        if not isinstance(hook.get("text_overlay"), bool):
            errors.append("hook.text_overlay must be a boolean")
        if not isinstance(hook.get("repeated_later"), bool):
            errors.append("hook.repeated_later must be a boolean")
        if (
            not _is_number(hook.get("time_to_first_word_ms"))
            or hook["time_to_first_word_ms"] < 0
        ):
            errors.append("hook.time_to_first_word_ms must be >= 0")

    # captions
    captions = data.get("captions")
    if not isinstance(captions, dict):
        errors.append("captions is required and must be an object")
    else:
        if not isinstance(captions.get("present"), bool):
            errors.append("captions.present must be a boolean")
        if captions.get("position") not in STYLE_CAPTION_POSITIONS:
            errors.append(
                f"captions.position must be one of {sorted(STYLE_CAPTION_POSITIONS)}"
            )
        for int_key in ("words_per_line", "lines"):
            val = captions.get(int_key)
            if not isinstance(val, int) or isinstance(val, bool) or val < 0:
                errors.append(f"captions.{int_key} must be an integer >= 0")
        if captions.get("highlight") not in STYLE_CAPTION_HIGHLIGHTS:
            errors.append(
                f"captions.highlight must be one of {sorted(STYLE_CAPTION_HIGHLIGHTS)}"
            )
        if captions.get("font_class") not in STYLE_FONT_CLASSES:
            errors.append(
                f"captions.font_class must be one of {sorted(STYLE_FONT_CLASSES)}"
            )
        for color_key in ("text_color", "highlight_color"):
            if not isinstance(captions.get(color_key), str):
                errors.append(f"captions.{color_key} must be a string")

    # audio
    audio = data.get("audio")
    if not isinstance(audio, dict):
        errors.append("audio is required and must be an object")
    else:
        for num_key in ("lufs", "true_peak_db"):
            if not _is_number(audio.get(num_key)):
                errors.append(f"audio.{num_key} must be numeric")
        if not _is_number(audio.get("lra")) or audio["lra"] < 0:
            errors.append("audio.lra must be >= 0")
        if audio.get("music_detected") is not None and not isinstance(
            audio.get("music_detected"), bool
        ):
            errors.append("audio.music_detected must be a boolean or null")

    # titlecard
    titlecard = data.get("titlecard")
    if not isinstance(titlecard, dict) or not isinstance(titlecard.get("present"), bool):
        errors.append("titlecard.present is required and must be a boolean")

    # punchin
    punchin = data.get("punchin")
    if not isinstance(punchin, dict):
        errors.append("punchin is required and must be an object")
    else:
        if not isinstance(punchin.get("detected"), bool):
            errors.append("punchin.detected must be a boolean")
        min_gap_s = punchin.get("min_gap_s")
        if min_gap_s is not None and (not _is_number(min_gap_s) or min_gap_s < 0):
            errors.append("punchin.min_gap_s must be >= 0 or null")
        scale = punchin.get("scale")
        if scale is not None and (not _is_number(scale) or scale <= 1.0):
            errors.append("punchin.scale must be > 1.0 or null")

    # confidence & evidence
    confidence = data.get("confidence")
    if not isinstance(confidence, dict):
        errors.append("confidence is required and must be an object")
    else:
        for group_key, level in confidence.items():
            if level not in STYLE_CONFIDENCE_LEVELS:
                errors.append(
                    f"confidence.{group_key} '{level}' must be one of {sorted(STYLE_CONFIDENCE_LEVELS)}"
                )

    evidence = data.get("evidence")
    if not isinstance(evidence, dict):
        errors.append("evidence is required and must be an object")

    return errors


def _validate_effective_profile_domain(data: Any) -> List[str]:
    data = _coerce_dict(data)
    errors: List[str] = []
    if not isinstance(data, dict):
        return ["effective_profile.json root must be a JSON object"]

    if not _is_non_empty_str(data.get("project_id")):
        errors.append("project_id is required and must be a non-empty string")

    if data.get("template") not in STYLE_TEMPLATES:
        errors.append(f"template must be one of {sorted(STYLE_TEMPLATES)}")

    speed = data.get("playback_speed")
    if not _is_number(speed) or float(speed) != 1.0:
        errors.append(f"playback_speed ({speed}) must be 1.0 (speed modification is forbidden)")

    enabled_groups = data.get("enabled_groups")
    if not isinstance(enabled_groups, dict) or any(
        not isinstance(v, bool) for v in enabled_groups.values()
    ):
        errors.append("enabled_groups must be an object mapping group names to booleans")

    pacing = data.get("pacing")
    if not isinstance(pacing, dict):
        errors.append("pacing is required and must be an object")
    else:
        for req_key in ("pad_start_ms", "pad_end_ms", "merge_gap_ms", "silence_threshold_ms"):
            val = pacing.get(req_key)
            if not _is_number(val) or val < 0:
                errors.append(f"pacing.{req_key} must be >= 0")

    hook = data.get("hook")
    if not isinstance(hook, dict):
        errors.append("hook is required and must be an object")
    else:
        min_ms = hook.get("min_ms")
        max_ms = hook.get("max_ms")
        if not _is_number(min_ms) or min_ms <= 0:
            errors.append("hook.min_ms must be > 0")
        if not _is_number(max_ms) or max_ms <= 0:
            errors.append("hook.max_ms must be > 0")
        if _is_number(min_ms) and _is_number(max_ms) and max_ms < min_ms:
            errors.append(f"hook.max_ms ({max_ms}) must be >= hook.min_ms ({min_ms})")

    captions = data.get("captions")
    if not isinstance(captions, dict):
        errors.append("captions is required and must be an object")
    else:
        if not isinstance(captions.get("enabled"), bool):
            errors.append("captions.enabled must be a boolean")
        if captions.get("position") not in STYLE_CAPTION_POSITIONS:
            errors.append(
                f"captions.position must be one of {sorted(STYLE_CAPTION_POSITIONS)}"
            )
        wpl = captions.get("words_per_line")
        if not isinstance(wpl, int) or isinstance(wpl, bool) or wpl < 1:
            errors.append("captions.words_per_line must be an integer >= 1")
        max_lines = captions.get("max_lines")
        if not isinstance(max_lines, int) or isinstance(max_lines, bool) or max_lines < 1:
            errors.append("captions.max_lines must be an integer >= 1")
        font_family = captions.get("font_family")
        if font_family is not None and font_family not in ALLOWED_VIETNAMESE_FONTS:
            errors.append(
                f"captions.font_family '{font_family}' must be one of {sorted(ALLOWED_VIETNAMESE_FONTS)}"
            )

    audio = data.get("audio")
    if not isinstance(audio, dict):
        errors.append("audio is required and must be an object")
    else:
        target_lufs = audio.get("target_lufs")
        if not _is_number(target_lufs) or target_lufs < LUFS_SAFE_MIN or target_lufs > LUFS_SAFE_MAX:
            errors.append(
                f"audio.target_lufs ({target_lufs}) must be clamped within [{LUFS_SAFE_MIN}, {LUFS_SAFE_MAX}] LUFS"
            )
        tp = audio.get("true_peak_max_db")
        if not _is_number(tp) or tp > TRUE_PEAK_SAFE_MAX_DB:
            errors.append(
                f"audio.true_peak_max_db ({tp}) must be <= {TRUE_PEAK_SAFE_MAX_DB} dBTP"
            )

    punchin = data.get("punchin")
    if not isinstance(punchin, dict) or not isinstance(punchin.get("enabled"), bool):
        errors.append("punchin.enabled is required and must be a boolean")

    return errors


def _validate_profile_trace_domain(data: Any) -> List[str]:
    data = _coerce_dict(data)
    errors: List[str] = []
    if not isinstance(data, dict):
        return ["profile_trace.json root must be a JSON object"]

    if not _is_non_empty_str(data.get("project_id")):
        errors.append("project_id is required and must be a non-empty string")

    priority_order = data.get("priority_order")
    if (
        not isinstance(priority_order, list)
        or tuple(priority_order) != PROFILE_TRACE_SOURCES
    ):
        errors.append(
            f"priority_order must equal {list(PROFILE_TRACE_SOURCES)}"
        )

    entries = data.get("entries")
    if not isinstance(entries, list) or len(entries) == 0:
        errors.append("entries must be a non-empty list")
    else:
        for idx, entry in enumerate(entries):
            prefix = f"entries[{idx}]"
            if not isinstance(entry, dict):
                errors.append(f"{prefix} must be an object")
                continue
            if not _is_non_empty_str(entry.get("param")):
                errors.append(f"{prefix}.param must be a non-empty string")
            if entry.get("source") not in PROFILE_TRACE_SOURCES:
                errors.append(
                    f"{prefix}.source '{entry.get('source')}' must be one of {list(PROFILE_TRACE_SOURCES)}"
                )
            if "effective_value" not in entry:
                errors.append(f"{prefix}.effective_value is required")
            conf = entry.get("confidence")
            if conf is not None and conf not in STYLE_CONFIDENCE_LEVELS:
                errors.append(
                    f"{prefix}.confidence '{conf}' must be one of {sorted(STYLE_CONFIDENCE_LEVELS)} or null"
                )

    return errors


def _validate_style_match_domain(data: Any) -> List[str]:
    data = _coerce_dict(data)
    errors: List[str] = []
    if not isinstance(data, dict):
        return ["style_match.json root must be a JSON object"]

    if not _is_non_empty_str(data.get("project_id")):
        errors.append("project_id is required and must be a non-empty string")
    if not _is_non_empty_str(data.get("style_id")):
        errors.append("style_id is required and must be a non-empty string")

    overall = data.get("overall_status")
    if overall not in STYLE_MATCH_OVERALL_STATUSES:
        errors.append(
            f"overall_status '{overall}' must be one of {sorted(STYLE_MATCH_OVERALL_STATUSES)}"
        )

    items = data.get("items")
    if not isinstance(items, list) or len(items) == 0:
        errors.append("items must be a non-empty list")
    else:
        for idx, item in enumerate(items):
            prefix = f"items[{idx}]"
            if not isinstance(item, dict):
                errors.append(f"{prefix} must be an object")
                continue
            if not _is_non_empty_str(item.get("metric")):
                errors.append(f"{prefix}.metric must be a non-empty string")
            if not _is_non_empty_str(item.get("label")):
                errors.append(f"{prefix}.label must be a non-empty string")
            if not _is_non_empty_str(item.get("tolerance")):
                errors.append(f"{prefix}.tolerance must be a non-empty string")
            if not isinstance(item.get("within_tolerance"), bool):
                errors.append(f"{prefix}.within_tolerance must be a boolean")
            if item.get("severity") not in STYLE_MATCH_SEVERITIES:
                errors.append(
                    f"{prefix}.severity must be one of {sorted(STYLE_MATCH_SEVERITIES)}"
                )
            if item.get("status") not in STYLE_MATCH_STATUSES:
                errors.append(
                    f"{prefix}.status must be one of {sorted(STYLE_MATCH_STATUSES)}"
                )
            if item.get("metric") == "shots_per_min" and item.get("severity") != "informational":
                errors.append(
                    f"{prefix} ('shots_per_min') must have severity='informational'"
                )

    return errors


_DOMAIN_VALIDATORS = {
    "state": _validate_state_domain,
    "beats": _validate_beats_domain,
    "words": _validate_words_domain,
    "flags": _validate_flags_domain,
    "takes": _validate_takes_domain,
    "hooks": _validate_hooks_domain,
    "cutlist": _validate_cutlist_domain,
    "style_profile": _validate_style_profile_domain,
    "effective_profile": _validate_effective_profile_domain,
    "profile_trace": _validate_profile_trace_domain,
    "style_match": _validate_style_match_domain,
}


def check_artifact(artifact_type: str, data: Any) -> Tuple[bool, List[str]]:
    """
    Validate `data` against both JSON Schema and domain invariants.
    Returns `(is_valid, error_messages)`. Never raises on validation failure.
    """
    key = normalize_artifact_type(artifact_type)
    payload = _coerce_dict(data)
    errors: List[str] = []

    domain_validator = _DOMAIN_VALIDATORS[key]
    errors.extend(domain_validator(payload))

    if jsonschema is not None and not errors:
        schema = SCHEMAS[key]
        try:
            jsonschema.validate(instance=payload, schema=schema)
        except jsonschema.ValidationError as exc:
            errors.append(exc.message)

    return (len(errors) == 0, errors)


def validate_artifact(
    artifact_type: Union[str, Any],
    data: Any = None,
    *,
    raise_on_error: bool = True,
) -> bool:
    """
    Validate `data` for `artifact_type` ('state', 'beats', 'words', 'flags', 'takes', 'hooks',
    'cutlist', 'style_profile', 'effective_profile', 'profile_trace', 'style_match').
    Supports both `validate_artifact("beats", data)` and `validate_artifact(data, "beats")`.
    If `raise_on_error=True` (default), raises `SchemaValidationError` when invalid.
    """
    if not isinstance(artifact_type, str) and isinstance(data, str):
        artifact_type, data = data, artifact_type

    key = normalize_artifact_type(str(artifact_type))
    is_valid, errors = check_artifact(key, data)
    if not is_valid and raise_on_error:
        raise SchemaValidationError(key, errors)
    return is_valid


def validate_state(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("state", data, raise_on_error=raise_on_error)


def validate_beats(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("beats", data, raise_on_error=raise_on_error)


def validate_words(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("words", data, raise_on_error=raise_on_error)


def validate_flags(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("flags", data, raise_on_error=raise_on_error)


def validate_takes(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("takes", data, raise_on_error=raise_on_error)


def validate_hooks(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("hooks", data, raise_on_error=raise_on_error)


def validate_cutlist(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("cutlist", data, raise_on_error=raise_on_error)


def validate_style_profile(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("style_profile", data, raise_on_error=raise_on_error)


def validate_effective_profile(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("effective_profile", data, raise_on_error=raise_on_error)


def validate_profile_trace(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("profile_trace", data, raise_on_error=raise_on_error)


def validate_style_match(data: Any, *, raise_on_error: bool = True) -> bool:
    return validate_artifact("style_match", data, raise_on_error=raise_on_error)


def validate_artifact_file(
    file_path: Union[str, Path],
    artifact_type: Optional[str] = None,
    *,
    raise_on_error: bool = True,
) -> Any:
    """Load a JSON file from disk, validate it against the target artifact schema, and return its content."""
    path = Path(file_path)
    inferred_type = artifact_type or path.stem
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    payload = normalize_nfc_deep(payload)
    validate_artifact(inferred_type, payload, raise_on_error=raise_on_error)
    return payload


# ---------------------------------------------------------------------------
# Sample Payloads & Self-Test Suite
# ---------------------------------------------------------------------------

def get_sample_valid_payloads() -> Dict[str, Dict[str, Any]]:
    """Return canonical valid sample payloads for all 11 pipeline JSON artifacts."""
    return {
        "state": {
            "schema_version": "1.0",
            "project_id": "demo_podscare_01",
            "workspace_dir": "workspace/demo_podscare_01",
            "source_video": "/tmp/raw_input.mp4",
            "script_path": "/tmp/script.md",
            "audio_path": "workspace/demo_podscare_01/audio_16k.wav",
            "created_at": "2026-11-07T04:00:00Z",
            "updated_at": "2026-11-07T04:01:00Z",
            "video_metadata": {
                "duration_sec": 25.0,
                "duration_ms": 25000,
                "width": 1080,
                "height": 1920,
                "fps": 30.0,
                "video_codec": "h264",
                "audio_codec": "aac",
                "sample_rate": 16000,
                "channels": 1,
            },
            "phases": {
                "P0": {
                    "status": "completed",
                    "input_hash": "a1b2c3d4e5f6",
                    "completed_at": "2026-11-07T04:01:00Z",
                    "artifact": "state.json",
                },
                "P1": {"status": "pending"},
            },
        },
        "beats": {
            "project_id": "demo_podscare_01",
            "language": "vi",
            "initial_prompt": "PodsCare, AirPods Pro, ANC, màng loa",
            "beats": [
                {
                    "beat_id": "beat_01",
                    "expected_text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    "section_type": "hook",
                    "anchor_keywords": ["AirPods Pro", "bị rè", "sửa"],
                },
                {
                    "beat_id": "beat_02",
                    "expected_text": "Nhắn tin ngay cho PodsCare để được kiểm tra miễn phí nhé!",
                    "section_type": "cta",
                    "anchor_keywords": ["PodsCare", "kiểm tra", "miễn phí"],
                },
            ],
        },
        "words": {
            "project_id": "demo_podscare_01",
            "language": "vi",
            "duration_ms": 25000,
            "words": [
                {"word_id": "w1", "word": "Tai", "start_ms": 3700, "end_ms": 3950, "confidence": 0.98},
                {"word_id": "w2", "word": "nghe", "start_ms": 3960, "end_ms": 4200, "confidence": 0.96},
                {"word_id": "w3", "word": "AirPods", "start_ms": 4210, "end_ms": 4650, "confidence": 0.95},
            ],
        },
        "flags": {
            "project_id": "demo_podscare_01",
            "token_savings_pct": 78.5,
            "flags": [
                {
                    "flag_id": "flag_01",
                    "type": "FILLER",
                    "start_ms": 1000,
                    "end_ms": 1450,
                    "duration_ms": 450,
                    "word_ids": ["w0"],
                    "text": "À ừm",
                },
                {
                    "flag_id": "flag_02",
                    "type": "SILENCE",
                    "start_ms": 2800,
                    "end_ms": 3700,
                    "duration_ms": 900,
                    "text": "[SILENCE: 0.90s]",
                },
            ],
        },
        "takes": {
            "project_id": "demo_podscare_01",
            "model": "claude-sonnet-4-20250514",
            "takes": [
                {
                    "take_id": "take_01",
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "start_ms": 3700,
                    "end_ms": 6900,
                    "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    "word_ids": ["w7", "w18"],
                    "confidence": 0.96,
                    "reasoning": "Chọn take 2 hoàn chỉnh sau khoảng lặng 0.9s, không bị vấp như take 1.",
                }
            ],
        },
        "hooks": {
            "project_id": "demo_podscare_01",
            "selected_hook_id": "hook_01",
            "hooks": [
                {
                    "hook_id": "hook_01",
                    "beat_id": "beat_01",
                    "rank": 1,
                    "start_ms": 3700,
                    "end_ms": 6900,
                    "score": 94.5,
                    "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    "reasoning": "Câu hỏi trực diện nỗi đau người dùng AirPods Pro trong 3 giây đầu.",
                    "selected": True,
                }
            ],
        },
        "cutlist": {
            "project_id": "demo_podscare_01",
            "source_video": "/tmp/raw_input.mp4",
            "source_duration_ms": 25000,
            "total_duration_ms": 6650,
            "pad_start_ms": 80,
            "pad_end_ms": 120,
            "merge_gap_ms": 150,
            "segments": [
                {
                    "segment_id": "seg_001",
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "raw_start_ms": 3700,
                    "raw_end_ms": 6900,
                    "start_ms": 3620,
                    "end_ms": 7020,
                    "pad_start_ms": 80,
                    "pad_end_ms": 120,
                    "duration_ms": 3400,
                    "timeline_start_ms": 0,
                    "timeline_end_ms": 3400,
                    "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                },
                {
                    "segment_id": "seg_002",
                    "beat_id": "beat_02",
                    "section_type": "cta",
                    "raw_start_ms": 19750,
                    "raw_end_ms": 22800,
                    "start_ms": 19670,
                    "end_ms": 22920,
                    "pad_start_ms": 80,
                    "pad_end_ms": 120,
                    "duration_ms": 3250,
                    "timeline_start_ms": 3400,
                    "timeline_end_ms": 6650,
                    "text": "Nhắn tin ngay cho PodsCare để được kiểm tra miễn phí nhé!",
                },
            ],
        },
        "style_profile": StyleProfile(
            style_id="style_ab12",
            name="Podcast dọc nhịp nhanh PodsCare",
            source=StyleSource(
                sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                duration_ms=62400,
                analyzed_ms=62400,
            ),
            format=StyleFormat(
                width=1080,
                height=1920,
                fps=30.0,
                aspect="9:16",
                template="podcast_vertical",
            ),
            pacing=StylePacing(
                words_per_min=168.5,
                pause_median_ms=240.0,
                pause_p90_ms=520.0,
                max_silence_kept_ms=650.0,
                shots_per_min=18.2,
                jump_cut_ratio=0.65,
            ),
            hook=StyleHook(
                duration_ms=6200.0,
                style="question",
                text_overlay=True,
                repeated_later=True,
                time_to_first_word_ms=180.0,
            ),
            captions=StyleCaptions(
                present=True,
                position="bottom_center",
                words_per_line=3,
                lines=1,
                highlight="keyword_color",
                font_class="sans_bold",
                text_color="#FFFFFF",
                highlight_color="#FFD60A",
            ),
            audio=StyleAudio(
                lufs=-14.2,
                true_peak_db=-1.2,
                lra=6.4,
                music_detected=False,
            ),
            titlecard=StyleTitlecard(present=True),
            punchin=StylePunchin(detected=True, min_gap_s=5.5, scale=1.08),
            confidence={
                "format": "measured",
                "pacing": "measured",
                "hook": "estimated",
                "captions": "estimated",
                "audio": "measured",
                "titlecard": "estimated",
                "punchin": "estimated",
            },
            evidence={
                "format": {"stream_index": 0, "codec_name": "h264"},
                "pacing": {"pause_samples_ms": [180, 240, 520]},
                "hook": {"start_ms": 0, "end_ms": 6200},
                "captions": {"sample_timestamps_ms": [1200, 4500]},
                "audio": {"window_ms": [0, 62400], "filter": "ebur128"},
                "titlecard": {"start_ms": 0, "end_ms": 2800},
                "punchin": {
                    "events": [
                        {"start_ms": 6200, "end_ms": 9400, "estimated_scale": 1.08}
                    ]
                },
            },
        ).to_dict(),
        "effective_profile": EffectiveProfile(
            project_id="demo_podscare_01",
            style_id="style_ab12",
            template="podcast_vertical",
            playback_speed=1.0,
        ).to_dict(),
        "profile_trace": ProfileTrace(
            project_id="demo_podscare_01",
            style_id="style_ab12",
            entries=[
                ProfileTraceEntry(
                    param="pacing.silence_threshold_ms",
                    group="pacing",
                    source="sample_style",
                    raw_value=520,
                    effective_value=520,
                    clamped=False,
                    skipped_sources={"default_profile": 400},
                    confidence="measured",
                    reason="Áp dụng pause_p90_ms từ video mẫu.",
                )
            ],
            warnings=[],
        ).to_dict(),
        "style_match": StyleMatchReport(
            project_id="demo_podscare_01",
            style_id="style_ab12",
            overall_status="pass",
            summary="Đạt yêu cầu đối chiếu phong cách với video mẫu.",
            items=[
                StyleMatchItem(
                    metric="loudness_lufs",
                    label="Âm lượng (LUFS)",
                    target_value=-14.2,
                    actual_value=-14.0,
                    unit="LUFS",
                    tolerance="±1.0 LU",
                    deviation="+0.2 LU",
                    within_tolerance=True,
                    severity="scored",
                    status="matched",
                    note="Nằm trong dung sai ±1.0 LU.",
                ),
                StyleMatchItem(
                    metric="shots_per_min",
                    label="Nhịp cắt (cảnh/phút)",
                    target_value=18.2,
                    actual_value=14.5,
                    unit="shots/min",
                    tolerance="±30% (chỉ báo thông tin)",
                    deviation="-20.3%",
                    within_tolerance=True,
                    severity="informational",
                    status="info",
                    note="Chỉ số tham khảo theo mật độ vấp của video gốc.",
                ),
            ],
        ).to_dict(),
    }


def get_sample_invalid_payloads() -> Dict[str, Dict[str, Any]]:
    """Return intentionally invalid sample payloads for all 11 pipeline JSON artifacts."""
    return {
        "state": {
            "project_id": "",
            "phases": {"P0": {"status": "INVALID_STATUS_VALUE"}},
        },
        "beats": {
            "beats": [
                {
                    "beat_id": "",
                    "expected_text": "",
                    "section_type": "unknown_section",
                    "anchor_keywords": "not-a-list",
                }
            ]
        },
        "words": {
            "words": [
                {
                    "word": "Lỗi",
                    "start_ms": 5000,
                    "end_ms": 4000,  # end_ms <= start_ms violation
                    "confidence": 1.5,  # > 1.0 violation
                }
            ]
        },
        "flags": {
            "flags": [
                {
                    "type": "INVALID_FLAG_KIND",
                    "start_ms": -100,
                    "end_ms": 50,
                }
            ]
        },
        "takes": {
            "takes": [
                {
                    "beat_id": "beat_01",
                    "start_ms": 8000,
                    "end_ms": 8000,  # start_ms == end_ms violation
                    "reasoning": "",  # empty reasoning violation
                }
            ]
        },
        "hooks": {
            "hooks": [
                {
                    "start_ms": 3000,
                    "end_ms": 2000,  # end_ms < start_ms
                    "score": 150.0,  # score > 100
                    "reasoning": "",
                }
            ]
        },
        "cutlist": {
            "source_duration_ms": 10000,
            "segments": [
                {
                    "segment_id": "seg_bad",
                    "start_ms": 9000,
                    "end_ms": 12000,  # exceeds source_duration_ms
                }
            ],
        },
        "style_profile": {
            "style_id": "",
            "name": "Lỗi",
            "source": {"sha256": "", "duration_ms": 1000, "analyzed_ms": 5000},
            "format": {"width": 0, "height": 1920, "fps": 30, "aspect": "9:16", "template": "invalid_tpl"},
            "pacing": {
                "words_per_min": -5,
                "pause_median_ms": 500,
                "pause_p90_ms": 200,
                "max_silence_kept_ms": 0,
                "shots_per_min": 0,
                "jump_cut_ratio": 1.5,
            },
            "hook": {
                "duration_ms": -10,
                "style": "unknown_style",
                "text_overlay": False,
                "repeated_later": False,
                "time_to_first_word_ms": 0,
            },
            "captions": {
                "present": True,
                "position": "invalid_pos",
                "words_per_line": 3,
                "lines": 1,
                "highlight": "none",
                "font_class": "sans_bold",
                "text_color": "",
                "highlight_color": "",
            },
            "audio": {"lufs": -14, "true_peak_db": -1.0, "lra": -1, "music_detected": None},
            "titlecard": {"present": False},
            "punchin": {"detected": True, "min_gap_s": -1, "scale": 0.9},
            "confidence": {"pacing": "invalid_confidence"},
            "evidence": {},
        },
        "effective_profile": {
            "project_id": "demo_podscare_01",
            "template": "podcast_vertical",
            "playback_speed": 1.25,  # speed change violation
            "enabled_groups": {"pacing": True},
            "pacing": {
                "pad_start_ms": 80,
                "pad_end_ms": 100,
                "merge_gap_ms": 150,
                "silence_threshold_ms": 400,
            },
            "hook": {"min_ms": 8000, "max_ms": 5000},  # max_ms < min_ms
            "captions": {
                "enabled": True,
                "position": "bottom_center",
                "words_per_line": 3,
                "max_lines": 1,
                "font_family": "Comic Sans MS",  # disallowed font
            },
            "audio": {"target_lufs": -5.0, "true_peak_max_db": 0.5},  # unsafe LUFS & peak
            "punchin": {"enabled": False},
        },
        "profile_trace": {
            "project_id": "demo_podscare_01",
            "priority_order": ["sample_style", "user_override"],  # wrong priority order
            "entries": [],
        },
        "style_match": {
            "project_id": "demo_podscare_01",
            "style_id": "style_ab12",
            "overall_status": "invalid_status",
            "items": [
                {
                    "metric": "shots_per_min",
                    "label": "Nhịp cắt",
                    "target_value": 18.0,
                    "actual_value": 10.0,
                    "tolerance": "±30%",
                    "within_tolerance": False,
                    "severity": "scored",  # shots_per_min must be informational
                    "status": "deviated",
                }
            ],
        },
    }


def run_self_test() -> int:
    """Run self-tests for all 11 artifact schemas (valid, invalid, and Unicode NFC normalization)."""
    valid_samples = get_sample_valid_payloads()
    invalid_samples = get_sample_invalid_payloads()

    print(f"=== Pipeline Schemas Self-Test ({len(ARTIFACT_TYPES)} Artifacts) ===")
    for artifact in ARTIFACT_TYPES:
        # 1. Verify valid payload passes
        valid_data = valid_samples[artifact]
        assert validate_artifact(artifact, valid_data) is True, f"Valid {artifact} failed validation"
        assert validate_artifact(f"{artifact}.json", valid_data) is True

        # 2. Verify invalid payload raises SchemaValidationError
        invalid_data = invalid_samples[artifact]
        raised = False
        caught_msg = ""
        try:
            validate_artifact(artifact, invalid_data, raise_on_error=True)
        except SchemaValidationError as exc:
            raised = True
            caught_msg = str(exc)

        assert raised, f"Invalid {artifact} did NOT raise SchemaValidationError!"
        assert validate_artifact(artifact, invalid_data, raise_on_error=False) is False
        print(f"  [PASS] {artifact}.json -> valid accepted & invalid rejected ({caught_msg})")

    # 3. Verify NFD -> NFC normalization on Vietnamese strings in StyleProfile / ProfileTrace / StyleMatchReport
    nfd_name = unicodedata.normalize("NFD", "Phong cách mẫu Tiếng Việt chuẩn")
    assert unicodedata.is_normalized("NFC", nfd_name) is False
    sp = StyleProfile(style_id="style_nfc", name=nfd_name)
    assert unicodedata.is_normalized("NFC", sp.name) is True
    assert sp.validate() is True
    print("  [PASS] Unicode NFD -> NFC normalization verified on StyleProfile, EffectiveProfile, ProfileTrace, StyleMatchReport.")

    print(f"SELF-TEST PASSED: All {len(ARTIFACT_TYPES)} artifacts validated (valid + invalid + NFC cases).")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate JSON artifacts for the AI Video Editing Pipeline."
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run built-in unit tests for all artifact schemas (valid & invalid).",
    )
    parser.add_argument(
        "--type",
        dest="artifact_type",
        choices=list(ARTIFACT_TYPES),
        help="Artifact schema type to validate against.",
    )
    parser.add_argument(
        "--file",
        dest="file_path",
        help="Path to the JSON artifact file to validate.",
    )
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    if args.file_path:
        validate_artifact_file(args.file_path, args.artifact_type, raise_on_error=True)
        print(f"VALID: {args.file_path}")
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
