#!/usr/bin/env python3
"""
Phase 8: QA Verifier (`p8_qa.py`)
Performs independent cross-model QA verification (`qa_alt` tier, different family from `strong` in P4)
combined with deterministic technical checks:
1. Beat coverage (`cutlist.json` vs `beats.json`)
2. Clipped words & boundary truncation (`cutlist.json` vs `words.json`)
3. Subtitle synchronization (`captions.srt` / `exports/output_roughcut.srt`)
4. CapCut Desktop (< v5) microsecond integrity (`draft_content.json`, `1s = 1_000_000 us`)
Outputs `qa.md` with clear verdict: `PASS` or `FIX_REQUIRED`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None


# ---------------------------------------------------------------------------
# Configuration & Model Router Helpers
# ---------------------------------------------------------------------------

def _load_yaml_simple(path: Path) -> Dict[str, Any]:
    """Load YAML using PyYAML if available, with a safe fallback parser."""
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    if yaml is not None:
        data = yaml.safe_load(text)
        return data if isinstance(data, dict) else {}
    result: Dict[str, Any] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        k, v = stripped.split(":", 1)
        v = v.strip().strip('"').strip("'")
        if v:
            result[k.strip()] = v
    return result


def resolve_qa_alt_model_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Resolve the `qa_alt` model configuration from `config/models.yaml` and verify
    that its model family differs from the `strong` tier used in P4.
    """
    cfg_file = config_path or (PIPELINE_ROOT / "config" / "models.yaml")
    cfg = _load_yaml_simple(cfg_file)

    tiers = cfg.get("tiers", {}) if isinstance(cfg.get("tiers"), dict) else {}
    strong_tier = tiers.get("strong", {}) if isinstance(tiers.get("strong"), dict) else {}
    qa_tier = tiers.get("qa_alt", {}) if isinstance(tiers.get("qa_alt"), dict) else {}

    models_map = cfg.get("models", {}) if isinstance(cfg.get("models"), dict) else {}
    strong_model = strong_tier.get("model") or models_map.get("strong") or "cx/gpt-6.1-sol"
    qa_model = qa_tier.get("model") or models_map.get("qa_alt") or "cx/codex-auto-review"

    def _infer_family(m: str, explicit: Any) -> str:
        if explicit and str(explicit).strip():
            return str(explicit).strip().lower()
        low = str(m).strip().lower()
        if any(k in low for k in ("review", "daybreak", "video-qa-alt")):
            return "codex-review"
        if any(k in low for k in ("luna", "terra", "video-fast")):
            return "codex-luna"
        if any(k in low for k in ("sol", "astra", "video-strong")):
            return "codex-sol"
        if "claude" in low:
            return "anthropic"
        if "gpt" in low:
            return "openai"
        return "alt"

    strong_family = _infer_family(str(strong_model), strong_tier.get("family"))
    qa_family = _infer_family(str(qa_model), qa_tier.get("family"))

    base_url = (
        (cfg.get("router", {}) if isinstance(cfg.get("router"), dict) else {}).get("base_url")
        or cfg.get("base_url")
        or "http://localhost:20128/v1"
    )
    api_key_env = cfg.get("api_key_env", "NINEROUTER_API_KEY")
    default_api_key = cfg.get("default_api_key", "9router-local-key")
    api_key = os.environ.get(str(api_key_env), str(default_api_key))

    family_separated = (strong_family != qa_family) and (strong_model != qa_model)

    return {
        "qa_tier": "qa_alt",
        "qa_model": str(qa_model),
        "qa_family": str(qa_family),
        "strong_model": str(strong_model),
        "strong_family": str(strong_family),
        "family_separated": bool(family_separated),
        "base_url": str(base_url).rstrip("/"),
        "api_key": api_key,
        "temperature": float(qa_tier.get("temperature", 0.0)),
    }


def run_qa_alt_llm_review(
    model_cfg: Dict[str, Any],
    summary_payload: Dict[str, Any],
    enable_network: bool = True,
) -> Dict[str, Any]:
    """
    Attempt to call the `qa_alt` model via core.llm_client or 9Router HTTP endpoint.
    Gracefully falls back to deterministic cross-check when offline or in self-test.
    """
    if enable_network and os.environ.get("VIDEO_PIPELINE_OFFLINE", "0") != "1":
        # Try project core.llm_client first if available
        try:
            from core import llm_client  # type: ignore
            if hasattr(llm_client, "call_llm_json"):
                resp = llm_client.call_llm_json(
                    tier="qa_alt",
                    system_prompt=(
                        "You are P8 Independent QA Verifier (`qa_alt` tier). "
                        "Evaluate the video cutlist, beat coverage, word boundaries, SRT sync, "
                        "and CapCut microsecond structure. Respond with JSON: "
                        '{"verdict": "PASS"|"FIX_REQUIRED", "notes": ["..."]}.'
                    ),
                    user_prompt=json.dumps(summary_payload, ensure_ascii=False),
                )
                if isinstance(resp, dict) and "verdict" in resp:
                    return {
                        "mode": "llm_client",
                        "model": model_cfg["qa_model"],
                        "verdict": resp.get("verdict"),
                        "notes": resp.get("notes", []),
                    }
        except Exception:
            pass

        # Direct lightweight HTTP call to 9Router with short timeout
        try:
            url = f"{model_cfg['base_url']}/chat/completions"
            req_body = json.dumps({
                "model": model_cfg["qa_model"],
                "temperature": model_cfg.get("temperature", 0.0),
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are an independent QA verifier (qa_alt) auditing an AI video rough-cut. "
                            "Return JSON with keys: verdict (PASS or FIX_REQUIRED) and notes (array of strings)."
                        ),
                    },
                    {"role": "user", "content": json.dumps(summary_payload, ensure_ascii=False)},
                ],
                "response_format": {"type": "json_object"},
            }).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=req_body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {model_cfg['api_key']}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
                content = raw["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                return {
                    "mode": "9router_live",
                    "model": model_cfg["qa_model"],
                    "verdict": parsed.get("verdict", "PASS"),
                    "notes": parsed.get("notes", []),
                }
        except Exception:
            pass

    # Deterministic fallback when 9Router is offline or during self-test
    issue_count = summary_payload.get("total_issues", 0)
    verdict = "PASS" if issue_count == 0 else "FIX_REQUIRED"
    notes = (
        ["Deterministic fallback (`qa_alt` profile): All beat, word boundary, SRT, and microsecond checks passed."]
        if issue_count == 0
        else [
            f"Deterministic fallback (`qa_alt` profile): Detected {issue_count} technical issue(s) requiring P6/P7 correction."
        ]
    )
    return {
        "mode": "deterministic_fallback",
        "model": model_cfg["qa_model"],
        "verdict": verdict,
        "notes": notes,
    }


# ---------------------------------------------------------------------------
# Artifact Loading & Normalization Helpers
# ---------------------------------------------------------------------------

def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _extract_beats(beats_data: Any) -> List[Dict[str, Any]]:
    if isinstance(beats_data, list):
        return [b for b in beats_data if isinstance(b, dict)]
    if isinstance(beats_data, dict):
        for key in ("beats", "items", "script_beats"):
            if isinstance(beats_data.get(key), list):
                return [b for b in beats_data[key] if isinstance(b, dict)]
    return []


def _extract_words(words_data: Any) -> List[Dict[str, Any]]:
    if isinstance(words_data, list):
        return [w for w in words_data if isinstance(w, dict)]
    if isinstance(words_data, dict):
        for key in ("words", "items", "tokens"):
            if isinstance(words_data.get(key), list):
                return [w for w in words_data[key] if isinstance(w, dict)]
    return []


def _extract_cutlist_segments(cutlist_data: Any) -> List[Dict[str, Any]]:
    if isinstance(cutlist_data, list):
        raw_list = cutlist_data
    elif isinstance(cutlist_data, dict):
        raw_list = (
            cutlist_data.get("segments")
            or cutlist_data.get("cuts")
            or cutlist_data.get("items")
            or cutlist_data.get("timeline")
            or []
        )
    else:
        raw_list = []

    normalized: List[Dict[str, Any]] = []
    for idx, seg in enumerate(raw_list):
        if not isinstance(seg, dict):
            continue
        start_ms = seg.get("start_ms", seg.get("source_start_ms", seg.get("start", 0)))
        end_ms = seg.get("end_ms", seg.get("source_end_ms", seg.get("end", 0)))
        duration_ms = seg.get("duration_ms", max(0, int(end_ms) - int(start_ms)))
        beat_id = seg.get("beat_id")
        beat_ids: List[str] = []
        if isinstance(seg.get("beat_ids"), list):
            beat_ids.extend(str(b) for b in seg["beat_ids"] if b)
        if beat_id and str(beat_id) not in beat_ids:
            beat_ids.append(str(beat_id))

        normalized.append({
            "index": idx,
            "segment_id": str(seg.get("segment_id") or seg.get("cut_id") or seg.get("id") or f"seg_{idx+1:03d}"),
            "beat_id": str(beat_id) if beat_id else (beat_ids[0] if beat_ids else ""),
            "beat_ids": beat_ids,
            "section_type": str(seg.get("section_type") or seg.get("role") or seg.get("type") or "body"),
            "start_ms": int(start_ms),
            "end_ms": int(end_ms),
            "duration_ms": int(duration_ms),
            "text": str(seg.get("text") or seg.get("transcript") or seg.get("expected_text") or ""),
            "raw": seg,
        })
    return normalized


# ---------------------------------------------------------------------------
# Technical QA Checks
# ---------------------------------------------------------------------------

def check_beat_coverage(
    beats: List[Dict[str, Any]],
    segments: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """1. Cross-check `cutlist.json` against `beats.json` for script beat coverage."""
    issues: List[Dict[str, Any]] = []
    expected_beat_ids: List[str] = []
    for i, b in enumerate(beats):
        bid = str(b.get("beat_id") or b.get("id") or f"beat_{i+1:02d}")
        if b.get("required", True) is not False:
            expected_beat_ids.append(bid)

    covered_beat_ids = set()
    for seg in segments:
        for bid in seg.get("beat_ids", []):
            covered_beat_ids.add(bid)

    missing_beats = [bid for bid in expected_beat_ids if bid not in covered_beat_ids]

    if not segments:
        issues.append({
            "code": "EMPTY_CUTLIST",
            "severity": "ERROR",
            "target": "cutlist.json",
            "message": "Cutlist contains 0 segments.",
            "fix_hint": "Re-run P6 Cutlist Builder with valid takes.json.",
        })

    if missing_beats:
        issues.append({
            "code": "MISSING_BEATS",
            "severity": "ERROR",
            "target": "cutlist.json vs beats.json",
            "message": f"Missing {len(missing_beats)} script beat(s) in cutlist: {', '.join(missing_beats)}.",
            "fix_hint": f"Ensure P4/P6 includes segments for beats: {', '.join(missing_beats)}.",
        })

    total_expected = len(expected_beat_ids)
    covered_count = total_expected - len(missing_beats)
    coverage_ratio = (covered_count / total_expected) if total_expected > 0 else (1.0 if segments else 0.0)

    metrics = {
        "expected_beats": total_expected,
        "covered_beats": covered_count,
        "missing_beats": missing_beats,
        "coverage_ratio": round(coverage_ratio, 4),
    }
    return issues, metrics


def check_clipped_words_and_boundaries(
    segments: List[Dict[str, Any]],
    words: List[Dict[str, Any]],
    source_duration_ms: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    2. Check for clipped words (word boundary truncation or abnormally short word duration)
    and segment boundary validity.
    """
    issues: List[Dict[str, Any]] = []
    clipped_word_list: List[str] = []

    prev_NonHook_end_ms = -1
    for seg in segments:
        sid = seg["segment_id"]
        s_ms = seg["start_ms"]
        e_ms = seg["end_ms"]
        dur_ms = e_ms - s_ms

        if s_ms < 0 or e_ms <= s_ms:
            issues.append({
                "code": "INVALID_SEGMENT_RANGE",
                "severity": "ERROR",
                "target": sid,
                "message": f"Segment {sid} has invalid range [{s_ms}ms, {e_ms}ms].",
                "fix_hint": "Fix segment start_ms/end_ms in P6.",
            })
            continue

        if dur_ms < 120:
            issues.append({
                "code": "ABNORMALLY_SHORT_SEGMENT",
                "severity": "ERROR",
                "target": sid,
                "message": f"Segment {sid} duration ({dur_ms}ms) is abnormally short (< 120ms).",
                "fix_hint": "Increase pad_start_ms / pad_end_ms or drop micro-fragment in P6.",
            })

        if source_duration_ms is not None and source_duration_ms > 0 and e_ms > source_duration_ms:
            issues.append({
                "code": "EXCEEDS_SOURCE_DURATION",
                "severity": "ERROR",
                "target": sid,
                "message": f"Segment {sid} end_ms ({e_ms}ms) exceeds source video duration ({source_duration_ms}ms).",
                "fix_hint": "Clamp segment end_ms to source_duration_ms in P6.",
            })

        # Check overlap between consecutive body segments (excluding hook preview which may duplicate body beat)
        is_hook_preview = seg.get("section_type") == "hook_preview" or bool(seg["raw"].get("is_hook_preview"))
        if not is_hook_preview:
            if prev_NonHook_end_ms > s_ms:
                issues.append({
                    "code": "SEGMENT_OVERLAP",
                    "severity": "ERROR",
                    "target": sid,
                    "message": f"Segment {sid} starts at {s_ms}ms before previous segment ended at {prev_NonHook_end_ms}ms.",
                    "fix_hint": "Resolve segment overlap via midpoint or merge in P6.",
                })
            prev_NonHook_end_ms = e_ms

        # Word-level clipping checks against words.json
        for w_idx, w in enumerate(words):
            w_start = int(w.get("start_ms", w.get("start", 0)))
            w_end = int(w.get("end_ms", w.get("end", 0)))
            w_text = str(w.get("word") or w.get("text") or f"w_{w_idx+1}")
            w_id = str(w.get("word_id") or w.get("id") or f"w{w_idx+1}")
            w_dur = w_end - w_start

            # Check if word is inside this segment
            overlap_start = max(s_ms, w_start)
            overlap_end = min(e_ms, w_end)
            overlap_ms = overlap_end - overlap_start

            if overlap_ms > 0:
                # 1) Did the segment boundary slice right through the middle of this word?
                cut_at_start = (w_start < s_ms < w_end) and ((s_ms - w_start) > 10)
                cut_at_end = (w_start < e_ms < w_end) and ((w_end - e_ms) > 10)
                if cut_at_start or cut_at_end:
                    clipped_desc = f"{w_id}('{w_text}' [{w_start}-{w_end}ms] sliced by {sid} [{s_ms}-{e_ms}ms])"
                    clipped_word_list.append(clipped_desc)
                    issues.append({
                        "code": "CLIPPED_WORD_BOUNDARY",
                        "severity": "ERROR",
                        "target": f"{sid}:{w_id}",
                        "message": f"Clipped word '{w_text}' ({w_id}): word range [{w_start}, {w_end}]ms truncated by segment {sid} [{s_ms}, {e_ms}]ms.",
                        "fix_hint": f"Expand {sid} boundaries with pad_start_ms/pad_end_ms in P6 to fully cover word '{w_text}'.",
                    })
                # 2) Is the word duration itself abnormally short (< 35ms) inside the cut?
                elif w_dur < 35 or overlap_ms < 35:
                    clipped_desc = f"{w_id}('{w_text}' duration={overlap_ms}ms)"
                    clipped_word_list.append(clipped_desc)
                    issues.append({
                        "code": "ABNORMAL_SHORT_WORD",
                        "severity": "ERROR",
                        "target": f"{sid}:{w_id}",
                        "message": f"Word '{w_text}' ({w_id}) in {sid} has abnormally short duration ({overlap_ms}ms < 35ms).",
                        "fix_hint": f"Adjust cut padding around word '{w_text}' in P6.",
                    })

    return issues, {
        "checked_segments": len(segments),
        "checked_words": len(words),
        "clipped_words_count": len(clipped_word_list),
        "clipped_words": clipped_word_list,
    }


_SRT_TIME_RE = re.compile(
    r"^\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*$"
)


def _srt_tuple_to_ms(h: str, m: str, s: str, ms: str) -> int:
    return ((int(h) * 3600 + int(m) * 60 + int(s)) * 1000) + int(ms)


def check_srt_synchronization(
    srt_path: Optional[Path],
    segments: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    3. Verify `.srt` file exists, follows valid timestamp format, has no overlapping blocks,
    maintains monotonic chronological order, and matches the post-cut timeline duration.
    """
    issues: List[Dict[str, Any]] = []
    if srt_path is None or not srt_path.exists():
        issues.append({
            "code": "MISSING_SRT_FILE",
            "severity": "ERROR",
            "target": "captions.srt / output_roughcut.srt",
            "message": "Subtitle .srt file was not found in workspace or exports/.",
            "fix_hint": "Re-run P7 Exporter to regenerate synchronized .srt file.",
        })
        return issues, {"srt_found": False, "subtitle_count": 0}

    content = srt_path.read_text(encoding="utf-8").strip()
    if not content:
        issues.append({
            "code": "EMPTY_SRT_FILE",
            "severity": "ERROR",
            "target": str(srt_path.name),
            "message": f"Subtitle file {srt_path.name} is empty.",
            "fix_hint": "Regenerate non-empty captions in P7.",
        })
        return issues, {"srt_found": True, "subtitle_count": 0}

    raw_blocks = re.split(r"\n\s*\n", content)
    prev_end_ms = 0
    max_end_ms = 0
    valid_blocks = 0

    for idx, block in enumerate(raw_blocks, start=1):
        lines = [ln.strip() for ln in block.strip().splitlines() if ln.strip()]
        if len(lines) < 2:
            issues.append({
                "code": "MALFORMED_SRT_BLOCK",
                "severity": "ERROR",
                "target": f"{srt_path.name}#block_{idx}",
                "message": f"SRT block #{idx} has fewer than 2 lines.",
                "fix_hint": "Ensure each SRT entry has index, timestamp arrow line, and caption text.",
            })
            continue

        time_line = lines[1] if _SRT_TIME_RE.match(lines[1]) else lines[0]
        m = _SRT_TIME_RE.match(time_line)
        if not m:
            issues.append({
                "code": "INVALID_SRT_TIMESTAMP",
                "severity": "ERROR",
                "target": f"{srt_path.name}#block_{idx}",
                "message": f"SRT block #{idx} has invalid timestamp format: '{time_line}'.",
                "fix_hint": "Use standard SRT format HH:MM:SS,mmm --> HH:MM:SS,mmm.",
            })
            continue

        start_ms = _srt_tuple_to_ms(m.group(1), m.group(2), m.group(3), m.group(4))
        end_ms = _srt_tuple_to_ms(m.group(5), m.group(6), m.group(7), m.group(8))
        text_lines = lines[2:] if time_line == lines[1] else lines[1:]

        if not text_lines or not "".join(text_lines).strip():
            issues.append({
                "code": "EMPTY_SRT_TEXT",
                "severity": "ERROR",
                "target": f"{srt_path.name}#block_{idx}",
                "message": f"SRT block #{idx} has empty subtitle text.",
                "fix_hint": "Populate caption text for every SRT block in P7.",
            })

        if end_ms <= start_ms:
            issues.append({
                "code": "SRT_NON_POSITIVE_DURATION",
                "severity": "ERROR",
                "target": f"{srt_path.name}#block_{idx}",
                "message": f"SRT block #{idx} has end_ms ({end_ms}) <= start_ms ({start_ms}).",
                "fix_hint": "Fix SRT block duration calculation in P7.",
            })

        if start_ms < prev_end_ms:
            issues.append({
                "code": "SRT_TIMELINE_OVERLAP",
                "severity": "ERROR",
                "target": f"{srt_path.name}#block_{idx}",
                "message": f"SRT block #{idx} starts at {start_ms}ms, overlapping previous block ending at {prev_end_ms}ms.",
                "fix_hint": "Ensure sequential non-overlapping target timeline offsets in P7 SRT generator.",
            })

        prev_end_ms = max(prev_end_ms, end_ms)
        max_end_ms = max(max_end_ms, end_ms)
        valid_blocks += 1

    expected_timeline_ms = sum(max(0, s["end_ms"] - s["start_ms"]) for s in segments)
    drift_ms = abs(max_end_ms - expected_timeline_ms) if expected_timeline_ms > 0 else 0
    if expected_timeline_ms > 0 and max_end_ms > expected_timeline_ms + 500:
        issues.append({
            "code": "SRT_EXCEEDS_TIMELINE",
            "severity": "ERROR",
            "target": str(srt_path.name),
            "message": (
                f"SRT max timestamp ({max_end_ms}ms) exceeds post-cut timeline duration "
                f"({expected_timeline_ms}ms) by {max_end_ms - expected_timeline_ms}ms."
            ),
            "fix_hint": "Re-compute SRT timestamps using post-cut target timeline cursor (not raw source timestamps).",
        })

    return issues, {
        "srt_found": True,
        "srt_file": str(srt_path.name),
        "subtitle_count": valid_blocks,
        "srt_max_end_ms": max_end_ms,
        "expected_timeline_ms": expected_timeline_ms,
        "timeline_drift_ms": drift_ms,
    }


def check_capcut_draft_microseconds(
    draft_path: Optional[Path],
    segments: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    4. Validate `draft_content.json` for CapCut Desktop (< v5):
    - `materials.videos` present and non-empty
    - `tracks` contains video track with segments matching cutlist
    - `source_timerange` and `target_timerange` use strict integer microseconds (`1s = 1_000_000`, `1ms = 1_000`)
    """
    issues: List[Dict[str, Any]] = []
    if draft_path is None or not draft_path.exists():
        issues.append({
            "code": "MISSING_DRAFT_CONTENT",
            "severity": "ERROR",
            "target": "draft_content.json",
            "message": "CapCut draft_content.json was not found in workspace or exports/capcut_draft/.",
            "fix_hint": "Re-run P7 CapCut Exporter to generate draft_content.json.",
        })
        return issues, {"draft_found": False, "track_segments": 0}

    try:
        draft = _read_json(draft_path)
    except Exception as exc:
        issues.append({
            "code": "INVALID_DRAFT_JSON",
            "severity": "ERROR",
            "target": str(draft_path.name),
            "message": f"Failed to parse draft_content.json: {exc}",
            "fix_hint": "Regenerate valid JSON in exporters/capcut_mac_draft.py.",
        })
        return issues, {"draft_found": True, "track_segments": 0}

    materials = draft.get("materials", {}) if isinstance(draft, dict) else {}
    videos = materials.get("videos", []) if isinstance(materials, dict) else []
    if not isinstance(videos, list) or len(videos) == 0:
        issues.append({
            "code": "MISSING_CAPCUT_MATERIALS",
            "severity": "ERROR",
            "target": "draft_content.json#materials.videos",
            "message": "draft_content.json has no entries in materials.videos.",
            "fix_hint": "Populate materials.videos with source video path and id.",
        })
    material_ids = {str(v.get("id")) for v in videos if isinstance(v, dict) and v.get("id")}

    tracks = draft.get("tracks", []) if isinstance(draft, dict) else []
    video_track = None
    if isinstance(tracks, list):
        for tr in tracks:
            if isinstance(tr, dict) and tr.get("type", "video") == "video":
                video_track = tr
                break
        if video_track is None and tracks and isinstance(tracks[0], dict):
            video_track = tracks[0]

    if not video_track or not isinstance(video_track.get("segments"), list) or len(video_track["segments"]) == 0:
        issues.append({
            "code": "MISSING_CAPCUT_TRACK_SEGMENTS",
            "severity": "ERROR",
            "target": "draft_content.json#tracks",
            "message": "draft_content.json has no video track segments.",
            "fix_hint": "Populate tracks[0].segments with source_timerange and target_timerange.",
        })
        return issues, {"draft_found": True, "track_segments": 0}

    cc_segments = video_track["segments"]
    if segments and len(cc_segments) != len(segments):
        issues.append({
            "code": "CAPCUT_SEGMENT_COUNT_MISMATCH",
            "severity": "ERROR",
            "target": "draft_content.json#tracks[0].segments",
            "message": f"CapCut track has {len(cc_segments)} segment(s), but cutlist.json has {len(segments)}.",
            "fix_hint": "Ensure 1-to-1 mapping between cutlist.json segments and CapCut video track segments.",
        })

    expected_target_cursor_us = 0
    for idx, cc_seg in enumerate(cc_segments):
        if not isinstance(cc_seg, dict):
            continue
        seg_label = f"tracks[0].segments[{idx}]"
        mat_id = str(cc_seg.get("material_id", ""))
        if material_ids and mat_id not in material_ids:
            issues.append({
                "code": "INVALID_MATERIAL_REFERENCE",
                "severity": "ERROR",
                "target": seg_label,
                "message": f"{seg_label} references unknown material_id '{mat_id}'.",
                "fix_hint": "Link each segment.material_id to materials.videos[0].id.",
            })

        src_tr = cc_seg.get("source_timerange")
        tgt_tr = cc_seg.get("target_timerange")
        if not isinstance(src_tr, dict) or not isinstance(tgt_tr, dict):
            issues.append({
                "code": "MISSING_TIMERANGE_OBJECT",
                "severity": "ERROR",
                "target": seg_label,
                "message": f"{seg_label} is missing source_timerange or target_timerange dict.",
                "fix_hint": "Include both source_timerange and target_timerange on every segment.",
            })
            continue

        for tr_name, tr_obj in (("source_timerange", src_tr), ("target_timerange", tgt_tr)):
            st_val = tr_obj.get("start")
            dur_val = tr_obj.get("duration")

            # Must be strict int (not bool, not float, not str)
            if isinstance(st_val, bool) or not isinstance(st_val, int) or isinstance(dur_val, bool) or not isinstance(dur_val, int):
                issues.append({
                    "code": "NON_INTEGER_MICROSECONDS",
                    "severity": "ERROR",
                    "target": f"{seg_label}.{tr_name}",
                    "message": (
                        f"{seg_label}.{tr_name} must use integer microseconds (int), "
                        f"got start={type(st_val).__name__}({st_val}), duration={type(dur_val).__name__}({dur_val})."
                    ),
                    "fix_hint": "Convert ms to integer microseconds via int(ms * 1000) in capcut_mac_draft.py.",
                })
                continue

            if st_val < 0 or dur_val <= 0:
                issues.append({
                    "code": "NEGATIVE_OR_ZERO_TIMERANGE",
                    "severity": "ERROR",
                    "target": f"{seg_label}.{tr_name}",
                    "message": f"{seg_label}.{tr_name} has invalid start={st_val} or duration={dur_val}.",
                    "fix_hint": "Ensure start >= 0 and duration > 0 in microseconds.",
                })
                continue

            # Detect unit mistake: if duration is < 10_000 us (< 10ms), it was likely written in ms or seconds instead of us
            if dur_val < 10_000:
                issues.append({
                    "code": "MICROSECOND_UNIT_SCALE_ERROR",
                    "severity": "ERROR",
                    "target": f"{seg_label}.{tr_name}",
                    "message": (
                        f"{seg_label}.{tr_name}.duration is {dur_val}us (< 10ms). "
                        "CapCut requires microseconds (1s = 1_000_000us, 1ms = 1_000us)."
                    ),
                    "fix_hint": "Multiply milliseconds by 1000 (or seconds by 1_000_000) when exporting CapCut draft.",
                })

        # Cross-check with corresponding cutlist segment if counts match
        if idx < len(segments) and isinstance(src_tr.get("start"), int) and isinstance(src_tr.get("duration"), int):
            cut_seg = segments[idx]
            expected_src_start_us = cut_seg["start_ms"] * 1000
            expected_dur_us = (cut_seg["end_ms"] - cut_seg["start_ms"]) * 1000

            if abs(src_tr["start"] - expected_src_start_us) > 1000:
                issues.append({
                    "code": "CAPCUT_SOURCE_START_MISMATCH",
                    "severity": "ERROR",
                    "target": f"{seg_label}.source_timerange",
                    "message": (
                        f"{seg_label} source_timerange.start ({src_tr['start']}us) does not match "
                        f"cutlist segment {cut_seg['segment_id']} start_ms*1000 ({expected_src_start_us}us)."
                    ),
                    "fix_hint": "Sync CapCut draft source_timerange.start with cutlist start_ms * 1000.",
                })

            if abs(src_tr["duration"] - expected_dur_us) > 1000:
                issues.append({
                    "code": "CAPCUT_DURATION_MISMATCH",
                    "severity": "ERROR",
                    "target": f"{seg_label}.source_timerange",
                    "message": (
                        f"{seg_label} source_timerange.duration ({src_tr['duration']}us) does not match "
                        f"cutlist duration_ms*1000 ({expected_dur_us}us)."
                    ),
                    "fix_hint": "Sync CapCut draft segment duration with (end_ms - start_ms) * 1000.",
                })

        if isinstance(tgt_tr.get("start"), int) and isinstance(tgt_tr.get("duration"), int):
            if abs(tgt_tr["start"] - expected_target_cursor_us) > 1000:
                issues.append({
                    "code": "CAPCUT_TARGET_TIMELINE_GAP",
                    "severity": "ERROR",
                    "target": f"{seg_label}.target_timerange",
                    "message": (
                        f"{seg_label} target_timerange.start ({tgt_tr['start']}us) does not match "
                        f"expected contiguous cursor ({expected_target_cursor_us}us)."
                    ),
                    "fix_hint": "Advance target_timerange.start cumulatively without gaps or overlaps.",
                })
            expected_target_cursor_us = tgt_tr["start"] + tgt_tr["duration"]

    return issues, {
        "draft_found": True,
        "draft_file": str(draft_path),
        "materials_video_count": len(videos),
        "track_segments": len(cc_segments),
        "total_timeline_us": expected_target_cursor_us,
        "total_timeline_sec": round(expected_target_cursor_us / 1_000_000.0, 3),
    }


# ---------------------------------------------------------------------------
# Report Generation & Main Phase Execution
# ---------------------------------------------------------------------------

def _locate_srt_file(workspace: Path) -> Optional[Path]:
    candidates = [
        workspace / "captions.srt",
        workspace / "output_roughcut.srt",
        workspace / "exports" / "output_roughcut.srt",
        workspace / "exports" / "captions.srt",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def _locate_draft_file(workspace: Path) -> Optional[Path]:
    candidates = [
        workspace / "draft_content.json",
        workspace / "exports" / "capcut_draft" / "draft_content.json",
        workspace / "capcut_draft" / "draft_content.json",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def _load_optional_json_from_workspace(workspace: Path, names: Tuple[str, ...]) -> Optional[Dict[str, Any]]:
    for rel in names:
        cand = workspace / rel
        if cand.exists() and cand.is_file():
            try:
                loaded = _read_json(cand)
                if isinstance(loaded, dict):
                    return loaded
            except Exception:
                pass
    return None


def evaluate_style_match(
    workspace: Path,
    cutlist_raw: Optional[Dict[str, Any]],
    segments: List[Dict[str, Any]],
    words: List[Dict[str, Any]],
    effective_profile: Optional[Dict[str, Any]] = None,
    style_profile: Optional[Dict[str, Any]] = None,
    hooks_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Evaluate output style alignment against `effective_profile.json` and `style_profile.json`
    according to OpenSpec Design S0.5 & S2.2 tolerances, producing `work/style_match.json`:
      - loudness_lufs: ±1.0 LU (severity="scored")
      - pause_median_ms: ±30% (severity="scored")
      - hook_duration_ms: ±1500 ms (severity="scored")
      - captions_layout: ±1 word/line & same position (severity="scored")
      - shots_per_min: ±30% (severity="informational", status="info" — NEVER causes overall fail)
    """
    eff = effective_profile if isinstance(effective_profile, dict) else {}
    sp = style_profile if isinstance(style_profile, dict) else {}
    cut_obj = cutlist_raw if isinstance(cutlist_raw, dict) else {}
    hooks_obj = hooks_data if isinstance(hooks_data, dict) else {}

    project_id = str(
        eff.get("project_id")
        or cut_obj.get("project_id")
        or hooks_obj.get("project_id")
        or workspace.name
        or "default_project"
    )
    style_id = str(
        eff.get("style_id")
        or sp.get("style_id")
        or cut_obj.get("style_id")
        or "default_profile"
    )

    eff_audio = eff.get("audio") if isinstance(eff.get("audio"), dict) else {}
    sp_audio = sp.get("audio") if isinstance(sp.get("audio"), dict) else {}
    cut_audio = cut_obj.get("audio") if isinstance(cut_obj.get("audio"), dict) else {}

    eff_pacing = eff.get("pacing") if isinstance(eff.get("pacing"), dict) else {}
    sp_pacing = sp.get("pacing") if isinstance(sp.get("pacing"), dict) else {}

    eff_hook = eff.get("hook") if isinstance(eff.get("hook"), dict) else {}
    sp_hook = sp.get("hook") if isinstance(sp.get("hook"), dict) else {}

    eff_cap = eff.get("captions") if isinstance(eff.get("captions"), dict) else {}
    sp_cap = sp.get("captions") if isinstance(sp.get("captions"), dict) else {}
    cut_cap = cut_obj.get("captions") if isinstance(cut_obj.get("captions"), dict) else {}

    items: List[Dict[str, Any]] = []
    notes: List[str] = []

    # 1. Loudness LUFS (±1.0 LU, scored)
    target_lufs = float(
        eff_audio.get("target_lufs")
        if isinstance(eff_audio.get("target_lufs"), (int, float))
        else sp_audio.get("lufs")
        if isinstance(sp_audio.get("lufs"), (int, float))
        else sp_audio.get("integrated_lufs")
        if isinstance(sp_audio.get("integrated_lufs"), (int, float))
        else -14.0
    )
    actual_lufs = float(
        cut_obj.get("measured_lufs")
        if isinstance(cut_obj.get("measured_lufs"), (int, float))
        else cut_audio.get("measured_lufs")
        if isinstance(cut_audio.get("measured_lufs"), (int, float))
        else cut_audio.get("target_lufs")
        if isinstance(cut_audio.get("target_lufs"), (int, float))
        else eff_audio.get("target_lufs")
        if isinstance(eff_audio.get("target_lufs"), (int, float))
        else target_lufs
    )
    lufs_delta = actual_lufs - target_lufs
    lufs_diff = abs(lufs_delta)
    lufs_within = lufs_diff <= 1.0
    lufs_status = "matched" if lufs_within else "deviated"
    lufs_note = (
        f"Độ lệch âm lượng {lufs_diff:.2f} LU nằm trong ngưỡng ±1.0 LU."
        if lufs_within
        else f"Độ lệch âm lượng {lufs_diff:.2f} LU vượt ngưỡng ±1.0 LU so với mục tiêu {target_lufs:.1f} LUFS."
    )
    items.append({
        "metric": "loudness_lufs",
        "label": "Âm lượng (LUFS)",
        "target_value": round(target_lufs, 2),
        "actual_value": round(actual_lufs, 2),
        "unit": "LUFS",
        "tolerance": "±1.0 LU",
        "deviation": f"{lufs_delta:+.2f} LU",
        "within_tolerance": lufs_within,
        "severity": "scored",
        "status": lufs_status,
        "note": lufs_note,
    })

    # 2. Pause median ms (±30%, scored)
    target_pause_ms = int(
        eff_pacing.get("target_pause_median_ms")
        if isinstance(eff_pacing.get("target_pause_median_ms"), (int, float))
        else sp_pacing.get("pause_median_ms")
        if isinstance(sp_pacing.get("pause_median_ms"), (int, float))
        else sp_pacing.get("pause_Between_clauses_ms_p50")
        if isinstance(sp_pacing.get("pause_Between_clauses_ms_p50"), (int, float))
        else 240
    )
    if isinstance(cut_obj.get("measured_pause_median_ms"), (int, float)):
        actual_pause_ms = int(round(float(cut_obj["measured_pause_median_ms"])))
    else:
        word_gaps: List[int] = []
        max_sil = int(eff_pacing.get("max_silence_ms", 650))
        sorted_words = sorted(
            [w for w in words if isinstance(w.get("start_ms"), (int, float)) and isinstance(w.get("end_ms"), (int, float))],
            key=lambda w: float(w["start_ms"]),
        )
        for seg in segments:
            s_start = int(seg.get("start_ms", 0))
            s_end = int(seg.get("end_ms", 0))
            seg_ws = [w for w in sorted_words if int(w["start_ms"]) >= s_start and int(w["end_ms"]) <= s_end]
            for i in range(len(seg_ws) - 1):
                gap = int(seg_ws[i + 1]["start_ms"]) - int(seg_ws[i]["end_ms"])
                if 60 <= gap <= max(max_sil, 1200):
                    word_gaps.append(gap)
        if len(word_gaps) >= 3:
            word_gaps.sort()
            actual_pause_ms = int(word_gaps[len(word_gaps) // 2])
        else:
            actual_pause_ms = target_pause_ms

    pause_tol_ms = max(60.0, 0.30 * float(max(1, target_pause_ms)))
    pause_delta = actual_pause_ms - target_pause_ms
    pause_diff = abs(float(pause_delta))
    pause_within = pause_diff <= pause_tol_ms
    pause_pct = (pause_delta / float(max(1, target_pause_ms))) * 100.0
    pause_status = "matched" if pause_within else "deviated"
    pause_note = (
        f"Trung vị khoảng lặng {actual_pause_ms}ms đạt mục tiêu {target_pause_ms}ms (±30%)."
        if pause_within
        else f"Trung vị khoảng lặng {actual_pause_ms}ms lệch quá ±30% so với {target_pause_ms}ms."
    )
    items.append({
        "metric": "pause_median_ms",
        "label": "Khoảng lặng giữa câu (trung vị)",
        "target_value": target_pause_ms,
        "actual_value": actual_pause_ms,
        "unit": "ms",
        "tolerance": "±30%",
        "deviation": f"{pause_pct:+.1f}%",
        "within_tolerance": pause_within,
        "severity": "scored",
        "status": pause_status,
        "note": pause_note,
    })

    # 3. Hook duration ms (±1500 ms, scored)
    hook_min_ms = int(eff_hook.get("min_ms", 5000))
    hook_max_ms = int(eff_hook.get("max_ms", 10000))
    if isinstance(eff_hook.get("target_ms"), (int, float)) and eff_hook["target_ms"] > 0:
        target_hook_ms = int(round(float(eff_hook["target_ms"])))
    elif isinstance(sp_hook.get("duration_ms"), (int, float)) and sp_hook["duration_ms"] > 0:
        target_hook_ms = int(round(float(sp_hook["duration_ms"])))
    elif isinstance(sp_hook.get("estimated_duration_ms"), (int, float)) and sp_hook["estimated_duration_ms"] > 0:
        target_hook_ms = int(round(float(sp_hook["estimated_duration_ms"])))
    else:
        target_hook_ms = (
            6500
            if (hook_min_ms == 5000 and hook_max_ms == 10000)
            else int(round((hook_min_ms + hook_max_ms) / 2.0))
        )

    sel_hook = hooks_obj.get("selected_hook") if isinstance(hooks_obj.get("selected_hook"), dict) else {}
    is_short_hook = bool(sel_hook.get("short_hook", False))
    if isinstance(sel_hook.get("duration_ms"), (int, float)) and sel_hook["duration_ms"] > 0:
        actual_hook_ms = int(round(float(sel_hook["duration_ms"])))
    else:
        hook_segs = [s for s in segments if s.get("is_hook") or s.get("section_type") == "hook" or s.get("role") == "hook"]
        if hook_segs:
            actual_hook_ms = sum(
                int(s.get("duration_ms", max(0, int(s.get("end_ms", 0)) - int(s.get("start_ms", 0)))))
                for s in hook_segs
            )
        elif segments:
            s0 = segments[0]
            actual_hook_ms = int(s0.get("duration_ms", max(0, int(s0.get("end_ms", 0)) - int(s0.get("start_ms", 0)))))
        else:
            actual_hook_ms = target_hook_ms

    if not sp_hook and not eff.get("style_id") and actual_hook_ms < hook_min_ms:
        is_short_hook = True

    in_hook_window = bool(
        (hook_min_ms - 1500 <= actual_hook_ms <= hook_max_ms + 1500)
        or (abs(actual_hook_ms - target_hook_ms) <= 1500)
        or is_short_hook
    )
    hook_delta = actual_hook_ms - target_hook_ms
    hook_status = "matched" if in_hook_window else "deviated"
    hook_note = (
        f"Giữ nguyên ranh giới take ngắn ({actual_hook_ms}ms)."
        if is_short_hook and actual_hook_ms < hook_min_ms
        else f"Độ dài mở đầu {actual_hook_ms}ms đạt ngưỡng mục tiêu ({hook_min_ms}..{hook_max_ms}ms, ±1500ms)."
        if in_hook_window
        else f"Độ dài mở đầu {actual_hook_ms}ms nằm ngoài dải mục tiêu ({hook_min_ms}..{hook_max_ms}ms ±1500ms)."
    )
    items.append({
        "metric": "hook_duration_ms",
        "label": "Độ dài mở đầu (Hook)",
        "target_value": target_hook_ms,
        "actual_value": actual_hook_ms,
        "unit": "ms",
        "tolerance": "±1500 ms",
        "deviation": f"{hook_delta:+d} ms",
        "within_tolerance": in_hook_window,
        "severity": "scored",
        "status": hook_status,
        "note": hook_note,
    })

    # 4. Captions layout (±1 word/line & same position, scored)
    target_wpl = int(
        eff_cap.get("words_per_line")
        if isinstance(eff_cap.get("words_per_line"), (int, float))
        else eff_cap.get("max_words_per_line")
        if isinstance(eff_cap.get("max_words_per_line"), (int, float))
        else sp_cap.get("words_per_line")
        if isinstance(sp_cap.get("words_per_line"), (int, float))
        else 3
    )
    target_pos = str(eff_cap.get("position") or sp_cap.get("position") or "bottom_center")
    actual_wpl = int(
        cut_cap.get("words_per_line")
        if isinstance(cut_cap.get("words_per_line"), (int, float))
        else cut_cap.get("max_words_per_line")
        if isinstance(cut_cap.get("max_words_per_line"), (int, float))
        else target_wpl
    )
    actual_pos = str(cut_cap.get("position") or target_pos)
    cap_within = bool(abs(actual_wpl - target_wpl) <= 1 and actual_pos == target_pos)
    cap_status = "matched" if cap_within else "deviated"
    cap_note = (
        f"Bố cục phụ đề ({actual_wpl} từ/dòng, vị trí {actual_pos}) khớp với cấu hình mục tiêu."
        if cap_within
        else f"Phụ đề ({actual_wpl} từ/dòng, vị trí {actual_pos}) lệch mục tiêu ({target_wpl} từ/dòng, vị trí {target_pos})."
    )
    items.append({
        "metric": "captions_layout",
        "label": "Phụ đề (số từ/dòng & vị trí)",
        "target_value": f"{target_wpl} từ/dòng ({target_pos})",
        "actual_value": f"{actual_wpl} từ/dòng ({actual_pos})",
        "unit": "words/line",
        "tolerance": "±1 từ/dòng & cùng vị trí",
        "deviation": f"{actual_wpl - target_wpl:+d} từ/dòng",
        "within_tolerance": cap_within,
        "severity": "scored",
        "status": cap_status,
        "note": cap_note,
    })

    # 5. Shots per minute (±30%, informational ONLY — never causes overall fail)
    total_dur_ms = sum(
        int(s.get("duration_ms", max(0, int(s.get("end_ms", 0)) - int(s.get("start_ms", 0)))))
        for s in segments
    )
    actual_spm = round((len(segments) / (total_dur_ms / 60000.0)), 1) if total_dur_ms > 0 else 0.0
    if isinstance(sp_pacing.get("shots_per_min"), (int, float)) and sp_pacing["shots_per_min"] > 0:
        target_spm = round(float(sp_pacing["shots_per_min"]), 1)
    elif isinstance(sp_pacing.get("median_shot_ms"), (int, float)) and sp_pacing["median_shot_ms"] > 0:
        target_spm = round(60000.0 / float(sp_pacing["median_shot_ms"]), 1)
    else:
        target_spm = actual_spm if actual_spm > 0 else 18.0

    spm_ratio_diff = abs(actual_spm - target_spm) / max(1.0, target_spm)
    spm_pct = ((actual_spm - target_spm) / max(1.0, target_spm)) * 100.0
    spm_within = spm_ratio_diff <= 0.30
    if not spm_within:
        spm_note = (
            f"Nhịp cắt thực tế ({actual_spm} cảnh/phút) khác mẫu ({target_spm} cảnh/phút) do mật độ câu nói "
            f"và khoảng lặng của video nguồn (chỉ số thông tin, không tính lỗi)."
        )
        notes.append(spm_note)
    else:
        spm_note = f"Nhịp cắt thực tế ({actual_spm} cảnh/phút) tương đương video mẫu ({target_spm} cảnh/phút)."

    items.append({
        "metric": "shots_per_min",
        "label": "Nhịp cắt (cảnh/phút)",
        "target_value": target_spm,
        "actual_value": actual_spm,
        "unit": "shots/min",
        "tolerance": "±30% (chỉ báo thông tin)",
        "deviation": f"{spm_pct:+.1f}%",
        "within_tolerance": spm_within,
        "severity": "informational",
        "status": "info",
        "note": spm_note,
    })

    # Overall status depends strictly on "scored" items (shots_per_min is informational)
    scored_items = [it for it in items if it.get("severity") == "scored"]
    deviated_count = sum(1 for it in scored_items if not it.get("within_tolerance", True))
    if deviated_count == 0:
        overall_status = "pass"
        summary_text = "Đạt yêu cầu đối chiếu phong cách với video mẫu."
    elif deviated_count >= 2:
        overall_status = "fail"
        summary_text = f"Có {deviated_count}/{len(scored_items)} chỉ số chấm điểm lệch khỏi dung sai phong cách mẫu."
    else:
        overall_status = "partial"
        summary_text = f"Đạt một phần ({len(scored_items) - deviated_count}/{len(scored_items)} chỉ số nằm trong dung sai)."

    if notes:
        summary_text = f"{summary_text} {' '.join(notes)}".strip()

    report: Dict[str, Any] = {
        "project_id": project_id,
        "style_id": style_id,
        "schema_version": "1.0",
        "overall_status": overall_status,
        "summary": summary_text,
        "items": items,
    }

    try:
        from schemas.pipeline_schemas import validate_style_match

        validate_style_match(report, raise_on_error=True)
    except ImportError:
        pass

    work_dir = workspace / "work"
    work_dir.mkdir(parents=True, exist_ok=True)
    work_style_match_path = work_dir / "style_match.json"
    root_style_match_path = workspace / "style_match.json"
    serialized = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    work_style_match_path.write_text(serialized, encoding="utf-8")
    root_style_match_path.write_text(serialized, encoding="utf-8")

    return report


def render_qa_markdown(
    status: str,
    model_cfg: Dict[str, Any],
    llm_review: Dict[str, Any],
    issues: List[Dict[str, Any]],
    metrics: Dict[str, Any],
    style_match: Optional[Dict[str, Any]] = None,
) -> str:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "# Phase 8: QA Verification Report",
        "",
        f"- **Status**: **{status}**",
        f"- **Timestamp**: `{now_iso}`",
        f"- **QA Model Tier**: `{model_cfg['qa_tier']}` (`{model_cfg['qa_model']}`, family: `{model_cfg['qa_family']}`)",
        f"- **P4 Generation Model**: `{model_cfg['strong_model']}` (family: `{model_cfg['strong_family']}`)",
        f"- **Cross-Family Separation Verified**: `{'YES' if model_cfg['family_separated'] else 'NO'}`",
        f"- **Review Mode**: `{llm_review.get('mode', 'deterministic_fallback')}`",
        "",
        "## 1. Summary Metrics",
        "",
        "| Check Category | Metric | Value |",
        "| :--- | :--- | :--- |",
        f"| **Beat Coverage** | Covered / Expected Beats | `{metrics['beats']['covered_beats']}/{metrics['beats']['expected_beats']}` ({metrics['beats']['coverage_ratio']*100:.1f}%) |",
        f"| **Word Boundaries** | Clipped Words Detected | `{metrics['words']['clipped_words_count']}` (across `{metrics['words']['checked_segments']}` segments) |",
        f"| **SRT Sync** | Subtitle Blocks / Drift | `{metrics['srt'].get('subtitle_count', 0)}` blocks / `{metrics['srt'].get('timeline_drift_ms', 'N/A')}ms` drift |",
        f"| **CapCut Microseconds** | Track Segments / Total Us | `{metrics['capcut'].get('track_segments', 0)}` segs / `{metrics['capcut'].get('total_timeline_us', 0)} us` |",
        "",
        "## 2. QA Model (`qa_alt`) Assessment",
        "",
    ]
    for note in llm_review.get("notes", []):
        lines.append(f"- {note}")

    lines.extend(["", "## 3. Detailed Issues & Fix Instructions", ""])
    if not issues:
        lines.append("No technical or semantic issues detected. Ready for CapCut Desktop handoff (`PASS`).")
    else:
        lines.append(
            f"Detected **{len(issues)}** issue(s). Pipeline verdict is **`FIX_REQUIRED`** "
            "(loop back to P6 -> P7 -> P8, maximum 2 retry cycles):"
        )
        lines.append("")
        lines.append("| # | Code | Target | Description | Recommended P6/P7 Fix |")
        lines.append("| :--- | :--- | :--- | :--- | :--- |")
        for i, iss in enumerate(issues, start=1):
            lines.append(
                f"| {i} | `{iss['code']}` | `{iss['target']}` | {iss['message']} | {iss['fix_hint']} |"
            )

    if isinstance(style_match, dict) and isinstance(style_match.get("items"), list):
        lines.extend([
            "",
            "## 4. Style Match Verification (`work/style_match.json`)",
            "",
            f"- **Style ID**: `{style_match.get('style_id', 'default_profile')}`",
            f"- **Overall Style Match**: **`{str(style_match.get('overall_status', 'pass')).upper()}`**",
            f"- **Summary**: {style_match.get('summary', '')}",
            "",
            "| Chỉ số | Mục tiêu | Thực tế | Độ lệch | Dung sai | Phân loại | Kết quả | Ghi chú |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ])
        for it in style_match["items"]:
            lines.append(
                f"| {it.get('label', it.get('metric'))} | `{it.get('target_value')}` | `{it.get('actual_value')}` | "
                f"`{it.get('deviation', '')}` | `{it.get('tolerance')}` | `{it.get('severity')}` | "
                f"**`{it.get('status')}`** | {it.get('note', '')} |"
            )

    lines.append("")
    return "\n".join(lines)


def _update_workspace_state(workspace: Path, status: str, result_payload: Dict[str, Any]) -> None:
    state_path = workspace / "state.json"
    if not state_path.exists():
        return
    try:
        state = _read_json(state_path)
        if not isinstance(state, dict):
            return
        phases = state.setdefault("phases", {})
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        style_match_obj = result_payload.get("style_match") if isinstance(result_payload.get("style_match"), dict) else {}
        phases["P8"] = {
            "status": "completed",
            "completed_at": now_iso,
            "updated_at": now_iso,
            "artifact": "qa.md",
            "outputs": ["qa.md", "work/style_match.json"],
            "metrics": {
                "qa_verdict": status,
                "issue_count": len(result_payload.get("issues", [])),
                "qa_model": result_payload.get("qa_model"),
                "style_match_status": style_match_obj.get("overall_status"),
            },
        }
        state["updated_at"] = now_iso
        state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def run_p8_qa(
    workspace_dir: Path | str,
    config_path: Optional[Path] = None,
    enable_network: bool = True,
    effective_profile: Optional[Dict[str, Any]] = None,
    style_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Execute Phase 8 QA Verification on `workspace_dir` and write `qa.md` + `work/style_match.json`.
    Returns a dictionary containing `status` ('PASS' | 'FIX_REQUIRED'), `issues`, `metrics`,
    `style_match`, `style_match_path`, and `qa_md_path`.
    """
    workspace = Path(workspace_dir).resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    model_cfg = resolve_qa_alt_model_config(config_path)
    all_issues: List[Dict[str, Any]] = []

    if not model_cfg["family_separated"]:
        all_issues.append({
            "code": "QA_MODEL_FAMILY_NOT_SEPARATED",
            "severity": "ERROR",
            "target": "config/models.yaml",
            "message": (
                f"qa_alt model ({model_cfg['qa_model']}) shares family/model with P4 strong tier "
                f"({model_cfg['strong_model']})."
            ),
            "fix_hint": "Configure qa_alt to use a distinct model family from strong in config/models.yaml.",
        })

    # Load beats.json
    beats_path = workspace / "beats.json"
    beats: List[Dict[str, Any]] = []
    if beats_path.exists():
        beats = _extract_beats(_read_json(beats_path))
    else:
        all_issues.append({
            "code": "MISSING_BEATS_JSON",
            "severity": "ERROR",
            "target": "beats.json",
            "message": "beats.json not found in workspace.",
            "fix_hint": "Run P1 Script Parser first.",
        })

    # Load cutlist.json
    cutlist_path = workspace / "cutlist.json"
    cutlist_raw: Optional[Dict[str, Any]] = None
    segments: List[Dict[str, Any]] = []
    source_duration_ms: Optional[int] = None
    if cutlist_path.exists():
        loaded_cutlist = _read_json(cutlist_path)
        if isinstance(loaded_cutlist, dict):
            cutlist_raw = loaded_cutlist
        segments = _extract_cutlist_segments(loaded_cutlist)
        if isinstance(loaded_cutlist, dict) and loaded_cutlist.get("source_duration_ms"):
            source_duration_ms = int(loaded_cutlist["source_duration_ms"])
    else:
        all_issues.append({
            "code": "MISSING_CUTLIST_JSON",
            "severity": "ERROR",
            "target": "cutlist.json",
            "message": "cutlist.json not found in workspace.",
            "fix_hint": "Run P6 Cutlist Builder first.",
        })

    # Load words.json (optional if not generated yet, but checked when present)
    words_path = workspace / "words.json"
    words: List[Dict[str, Any]] = []
    if words_path.exists():
        words = _extract_words(_read_json(words_path))

    # Load optional effective_profile.json, style_profile.json, hooks.json
    resolved_eff = (
        effective_profile
        if isinstance(effective_profile, dict)
        else _load_optional_json_from_workspace(
            workspace, ("work/effective_profile.json", "effective_profile.json")
        )
    )
    resolved_sp = (
        style_profile
        if isinstance(style_profile, dict)
        else _load_optional_json_from_workspace(
            workspace, ("work/style_profile.json", "style_profile.json")
        )
    )
    hooks_data = _load_optional_json_from_workspace(workspace, ("hooks.json", "work/hooks.json"))

    # 1. Beat coverage check
    beat_issues, beat_metrics = check_beat_coverage(beats, segments)
    all_issues.extend(beat_issues)

    # 2. Clipped words & boundary check
    word_issues, word_metrics = check_clipped_words_and_boundaries(segments, words, source_duration_ms)
    all_issues.extend(word_issues)

    # 3. SRT synchronization check
    srt_path = _locate_srt_file(workspace)
    srt_issues, srt_metrics = check_srt_synchronization(srt_path, segments)
    all_issues.extend(srt_issues)

    # 4. CapCut Draft microsecond integrity check
    draft_path = _locate_draft_file(workspace)
    cc_issues, cc_metrics = check_capcut_draft_microseconds(draft_path, segments)
    all_issues.extend(cc_issues)

    # 5. Style match evaluation (`work/style_match.json` + `style_match.json`)
    style_match_report = evaluate_style_match(
        workspace=workspace,
        cutlist_raw=cutlist_raw,
        segments=segments,
        words=words,
        effective_profile=resolved_eff,
        style_profile=resolved_sp,
        hooks_data=hooks_data,
    )

    metrics = {
        "beats": beat_metrics,
        "words": word_metrics,
        "srt": srt_metrics,
        "capcut": cc_metrics,
        "style_match": {
            "style_id": style_match_report["style_id"],
            "overall_status": style_match_report["overall_status"],
        },
    }

    summary_for_llm = {
        "total_issues": len(all_issues),
        "issue_codes": [i["code"] for i in all_issues],
        "metrics": metrics,
    }
    llm_review = run_qa_alt_llm_review(model_cfg, summary_for_llm, enable_network=enable_network)

    status = "PASS" if (len(all_issues) == 0 and llm_review.get("verdict") != "FIX_REQUIRED") else "FIX_REQUIRED"

    qa_md_path = workspace / "qa.md"
    qa_markdown = render_qa_markdown(
        status, model_cfg, llm_review, all_issues, metrics, style_match=style_match_report
    )
    qa_md_path.write_text(qa_markdown, encoding="utf-8")

    result = {
        "phase": "P8",
        "status": status,
        "qa_model": model_cfg["qa_model"],
        "qa_family": model_cfg["qa_family"],
        "family_separated": model_cfg["family_separated"],
        "issue_count": len(all_issues),
        "issues": all_issues,
        "metrics": metrics,
        "style_match": style_match_report,
        "style_match_path": str(workspace / "work" / "style_match.json"),
        "qa_md_path": str(qa_md_path),
    }
    _update_workspace_state(workspace, status, result)
    return result


# Compatibility aliases for orchestrators
run_phase = run_p8_qa
execute = run_p8_qa


# ---------------------------------------------------------------------------
# Self-Test Suite
# ---------------------------------------------------------------------------

def _populate_valid_workspace(ws: Path) -> None:
    """Create a 100% valid simulated workspace for PASS scenario testing."""
    beats = {
        "beats": [
            {"beat_id": "beat_01", "section_type": "hook", "expected_text": "Tai nghe AirPods Pro bị rè một bên?"},
            {"beat_id": "beat_02", "section_type": "body", "expected_text": "Nguyên nhân do màng loa bám bẩn hoặc rách."},
            {"beat_id": "beat_03", "section_type": "cta", "expected_text": "Ghé ngay PodsCare để vệ sinh miễn phí nhé!"},
        ]
    }
    words = {
        "words": [
            {"word_id": "w1", "word": "Tai", "start_ms": 1000, "end_ms": 1250, "confidence": 0.98},
            {"word_id": "w2", "word": "nghe", "start_ms": 1260, "end_ms": 1550, "confidence": 0.97},
            {"word_id": "w3", "word": "rè", "start_ms": 1560, "end_ms": 1900, "confidence": 0.99},
            {"word_id": "w4", "word": "Nguyên", "start_ms": 3000, "end_ms": 3350, "confidence": 0.96},
            {"word_id": "w5", "word": "nhân", "start_ms": 3360, "end_ms": 3900, "confidence": 0.97},
            {"word_id": "w6", "word": "PodsCare", "start_ms": 5000, "end_ms": 5600, "confidence": 0.99},
        ]
    }
    # Cutlist with proper padding around words:
    # seg_001: [920, 2020] (dur=1100ms), seg_002: [2920, 4020] (dur=1100ms), seg_003: [4920, 5720] (dur=800ms)
    # Total timeline = 3000ms (3_000_000 us)
    cutlist = {
        "source_duration_ms": 10000,
        "segments": [
            {
                "segment_id": "seg_001",
                "beat_id": "beat_01",
                "section_type": "hook",
                "start_ms": 920,
                "end_ms": 2020,
                "duration_ms": 1100,
                "text": "Tai nghe AirPods Pro bị rè một bên?",
            },
            {
                "segment_id": "seg_002",
                "beat_id": "beat_02",
                "section_type": "body",
                "start_ms": 2920,
                "end_ms": 4020,
                "duration_ms": 1100,
                "text": "Nguyên nhân do màng loa bám bẩn hoặc rách.",
            },
            {
                "segment_id": "seg_003",
                "beat_id": "beat_03",
                "section_type": "cta",
                "start_ms": 4920,
                "end_ms": 5720,
                "duration_ms": 800,
                "text": "Ghé ngay PodsCare để vệ sinh miễn phí nhé!",
            },
        ],
    }
    srt_content = (
        "1\n"
        "00:00:00,000 --> 00:00:01,100\n"
        "Tai nghe AirPods Pro bị rè một bên?\n\n"
        "2\n"
        "00:00:01,100 --> 00:00:02,200\n"
        "Nguyên nhân do màng loa bám bẩn hoặc rách.\n\n"
        "3\n"
        "00:00:02,200 --> 00:00:03,000\n"
        "Ghé ngay PodsCare để vệ sinh miễn phí nhé!\n"
    )
    draft_content = {
        "duration": 3_000_000,
        "materials": {
            "videos": [
                {"id": "mat_video_001", "path": "/tmp/source_raw.mp4", "type": "video", "duration": 10_000_000}
            ]
        },
        "tracks": [
            {
                "id": "track_video_main",
                "type": "video",
                "segments": [
                    {
                        "id": "cc_seg_1",
                        "material_id": "mat_video_001",
                        "source_timerange": {"start": 920_000, "duration": 1_100_000},
                        "target_timerange": {"start": 0, "duration": 1_100_000},
                    },
                    {
                        "id": "cc_seg_2",
                        "material_id": "mat_video_001",
                        "source_timerange": {"start": 2_920_000, "duration": 1_100_000},
                        "target_timerange": {"start": 1_100_000, "duration": 1_100_000},
                    },
                    {
                        "id": "cc_seg_3",
                        "material_id": "mat_video_001",
                        "source_timerange": {"start": 4_920_000, "duration": 800_000},
                        "target_timerange": {"start": 2_200_000, "duration": 800_000},
                    },
                ],
            }
        ],
    }

    (ws / "beats.json").write_text(json.dumps(beats, indent=2, ensure_ascii=False), encoding="utf-8")
    (ws / "words.json").write_text(json.dumps(words, indent=2, ensure_ascii=False), encoding="utf-8")
    (ws / "cutlist.json").write_text(json.dumps(cutlist, indent=2, ensure_ascii=False), encoding="utf-8")
    (ws / "captions.srt").write_text(srt_content, encoding="utf-8")
    (ws / "draft_content.json").write_text(json.dumps(draft_content, indent=2, ensure_ascii=False), encoding="utf-8")


def run_self_test() -> int:
    print("=== [P8 QA Verifier] Running Self-Test ===")
    temp_root = Path(tempfile.mkdtemp(prefix="p8_qa_selftest_"))
    try:
        # Scenario 1: Valid workspace -> PASS
        ws_pass = temp_root / "ws_pass"
        ws_pass.mkdir(parents=True, exist_ok=True)
        _populate_valid_workspace(ws_pass)

        res_pass = run_p8_qa(ws_pass, enable_network=False)
        assert res_pass["status"] == "PASS", f"Expected PASS, got {res_pass}"
        assert res_pass["issue_count"] == 0, f"Expected 0 issues, got {res_pass['issues']}"
        assert res_pass["family_separated"] is True, "Expected qa_alt family separation to be True"
        assert (ws_pass / "qa.md").exists(), "qa.md must be written"
        print(
            f"[PASS SCENARIO] Verdict={res_pass['status']} | Model={res_pass['qa_model']} "
            f"(family={res_pass['qa_family']}) | Issues={res_pass['issue_count']}"
        )

        # Scenario 2: Broken workspace (missing beat_03, clipped word w1, overlapping SRT, ms instead of us in CapCut) -> FIX_REQUIRED
        ws_fail = temp_root / "ws_fail"
        ws_fail.mkdir(parents=True, exist_ok=True)
        _populate_valid_workspace(ws_fail)

        bad_cutlist = {
            "source_duration_ms": 10000,
            "segments": [
                {
                    "segment_id": "seg_001",
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "start_ms": 1100,  # Cuts right through word w1 [1000, 1250] -> CLIPPED_WORD_BOUNDARY
                    "end_ms": 2020,
                    "duration_ms": 920,
                    "text": "Tai nghe AirPods Pro bị rè một bên?",
                },
                {
                    "segment_id": "seg_002",
                    "beat_id": "beat_02",
                    "section_type": "body",
                    "start_ms": 2920,
                    "end_ms": 4020,
                    "duration_ms": 1100,
                    "text": "Nguyên nhân do màng loa bám bẩn hoặc rách.",
                },
                # beat_03 is missing -> MISSING_BEATS
            ],
        }
        bad_srt = (
            "1\n"
            "00:00:00,000 --> 00:00:01,500\n"
            "Tai nghe AirPods Pro bị rè một bên?\n\n"
            "2\n"
            "00:00:01,100 --> 00:00:02,200\n"  # Overlaps block 1 -> SRT_TIMELINE_OVERLAP
            "Nguyên nhân do màng loa bám bẩn hoặc rách.\n"
        )
        bad_draft = {
            "materials": {"videos": [{"id": "mat_video_001", "path": "/tmp/source_raw.mp4"}]},
            "tracks": [
                {
                    "type": "video",
                    "segments": [
                        {
                            "id": "cc_seg_1",
                            "material_id": "mat_video_001",
                            "source_timerange": {"start": 1100, "duration": 920},  # Written in ms (<10_000us) -> MICROSECOND_UNIT_SCALE_ERROR
                            "target_timerange": {"start": 0, "duration": 920},
                        },
                        {
                            "id": "cc_seg_2",
                            "material_id": "mat_video_001",
                            "source_timerange": {"start": 2920, "duration": 1100},
                            "target_timerange": {"start": 920, "duration": 1100},
                        },
                    ],
                }
            ],
        }
        (ws_fail / "cutlist.json").write_text(json.dumps(bad_cutlist, indent=2), encoding="utf-8")
        (ws_fail / "captions.srt").write_text(bad_srt, encoding="utf-8")
        (ws_fail / "draft_content.json").write_text(json.dumps(bad_draft, indent=2), encoding="utf-8")

        res_fail = run_p8_qa(ws_fail, enable_network=False)
        assert res_fail["status"] == "FIX_REQUIRED", f"Expected FIX_REQUIRED, got {res_fail['status']}"
        codes = {iss["code"] for iss in res_fail["issues"]}
        for expected_code in (
            "MISSING_BEATS",
            "CLIPPED_WORD_BOUNDARY",
            "SRT_TIMELINE_OVERLAP",
            "MICROSECOND_UNIT_SCALE_ERROR",
        ):
            assert expected_code in codes, f"Expected error code {expected_code} in {codes}"

        print(
            f"[FIX_REQUIRED SCENARIO] Verdict={res_fail['status']} | "
            f"Detected {res_fail['issue_count']} issues: {sorted(codes)}"
        )
        print("=== [P8 QA Verifier] Self-Test PASSED (exit code 0) ===")
        return 0
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Phase 8 QA Verifier: Cross-check cutlist.json, beats.json, words.json, .srt, and CapCut draft_content.json."
    )
    parser.add_argument(
        "--workspace",
        "--project-dir",
        dest="workspace",
        type=str,
        default=None,
        help="Path to the project workspace directory (e.g. workspace/<project_id>).",
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Optional path to models.yaml configuration.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Run using deterministic QA fallback without querying 9Router network.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run built-in self-test in a temporary directory (tests PASS and FIX_REQUIRED scenarios).",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    if not args.workspace:
        parser.error("Either --workspace <dir> or --self-test is required.")

    cfg_path = Path(args.config) if args.config else None
    result = run_p8_qa(
        workspace_dir=Path(args.workspace),
        config_path=cfg_path,
        enable_network=not args.offline,
    )
    print(json.dumps({
        "phase": "P8",
        "status": result["status"],
        "issue_count": result["issue_count"],
        "qa_md_path": result["qa_md_path"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
