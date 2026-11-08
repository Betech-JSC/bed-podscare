#!/usr/bin/env python3
"""
Phase 6: Cutlist Builder (`p6_cutlist.py`)
Merges P3 (`flags.json`), P4 (`takes.json`), and P5 (`hooks.json` + `--hook-option`)
into a frame-aligned, padded, and overlap-free Edit Decision List (`cutlist.json`).

Key capabilities:
1. Filters out silence/filler/fluff regions flagged in P3 (`flags.json`) and rejected
   bad takes from P4 (`takes.json`), keeping only best takes.
2. Places the selected opening hook from P5 (`hooks.json` or `--hook-option`) at the
   start of the timeline and orders segments according to P5 structure or script order.
3. Applies speech-safe padding (`pad_start_ms`, `pad_end_ms` from `profile.yaml`),
   clamped strictly to `[0, source_duration_ms]`.
4. Merges consecutive chronological segments of the same role/source separated by
   `< merge_gap_ms` (without falsely merging a cold-open hook with a non-adjacent body beat).
5. Aligns segment boundaries to video frame boundaries (`frame_ms = 1000.0 / fps`)
   while protecting word boundaries in `words.json` from mid-word clipping.
6. Attaches ~30ms audio fade-in/fade-out (`audio_fade_in_ms: 30`, `audio_fade_out_ms: 30`)
   to prevent clicks/pops at cut points.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None

try:
    from schemas.pipeline_schemas import validate_cutlist  # type: ignore
except Exception:
    validate_cutlist = None


DEFAULT_PAD_START_MS = 80
DEFAULT_PAD_END_MS = 120
DEFAULT_MERGE_GAP_MS = 150
DEFAULT_FPS = 30.0
DEFAULT_AUDIO_FADE_MS = 30
CUT_FLAG_TYPES = {
    "SILENCE",
    "FILLER",
    "FLUFF",
    "REPEAT",
    "HESITATION",
    "FALSE_START",
    "STUTTER",
    "NOISE",
}


# ---------------------------------------------------------------------------
# Configuration & I/O Helpers
# ---------------------------------------------------------------------------

def _load_yaml_file(path: Optional[Path]) -> Dict[str, Any]:
    """Load a YAML configuration file with PyYAML or a safe key-value fallback."""
    if path is None or not path.exists():
        return {}
    raw_text = path.read_text(encoding="utf-8")
    if yaml is not None:
        loaded = yaml.safe_load(raw_text)
        return loaded if isinstance(loaded, dict) else {}
    parsed: Dict[str, Any] = {}
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        k, v = stripped.split(":", 1)
        val_str = v.strip().strip('"').strip("'")
        if not val_str:
            continue
        try:
            if "." in val_str:
                parsed[k.strip()] = float(val_str)
            else:
                parsed[k.strip()] = int(val_str)
        except ValueError:
            parsed[k.strip()] = val_str
    return parsed


def _load_json_if_exists(path: Optional[Path]) -> Optional[Any]:
    if path is None or not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_effective_profile_from_workspace(ws: Optional[Path]) -> Optional[Dict[str, Any]]:
    """Load `work/effective_profile.json` or `effective_profile.json` from workspace if present."""
    if ws is None:
        return None
    for candidate in (ws / "work" / "effective_profile.json", ws / "effective_profile.json"):
        if candidate.exists() and candidate.is_file():
            try:
                loaded = _load_json_if_exists(candidate)
                if isinstance(loaded, dict):
                    return loaded
            except Exception:
                pass
    return None


def resolve_profile_params(
    profile_path: Optional[Path] = None,
    pad_start_ms: Optional[int] = None,
    pad_end_ms: Optional[int] = None,
    merge_gap_ms: Optional[int] = None,
    fps: Optional[float] = None,
    fade_in_ms: Optional[int] = None,
    fade_out_ms: Optional[int] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Resolve cutlist parameters from `effective_profile.json` or `profile.yaml` with explicit CLI/function overrides."""
    default_profile = PIPELINE_ROOT / "memory" / "profile.yaml"
    cfg = _load_yaml_file(profile_path or default_profile)
    cut_cfg = cfg.get("cutlist", {}) if isinstance(cfg.get("cutlist"), dict) else {}
    exp_cfg = cfg.get("export", {}) if isinstance(cfg.get("export"), dict) else {}

    eff_pacing = (
        effective_profile.get("pacing", {})
        if isinstance(effective_profile, dict) and isinstance(effective_profile.get("pacing"), dict)
        else {}
    )
    eff_hook = (
        effective_profile.get("hook", {})
        if isinstance(effective_profile, dict) and isinstance(effective_profile.get("hook"), dict)
        else {}
    )
    eff_groups = (
        effective_profile.get("enabled_groups", {})
        if isinstance(effective_profile, dict) and isinstance(effective_profile.get("enabled_groups"), dict)
        else {}
    )
    hook_group_active = bool(
        eff_groups.get("hook", bool(isinstance(effective_profile, dict) and effective_profile.get("style_id")))
    )

    resolved_pad_start = (
        int(pad_start_ms)
        if pad_start_ms is not None
        else int(
            eff_pacing.get(
                "pad_start_ms",
                cut_cfg.get("pad_start_ms", cfg.get("pad_start_ms", DEFAULT_PAD_START_MS)),
            )
        )
    )
    resolved_pad_end = (
        int(pad_end_ms)
        if pad_end_ms is not None
        else int(
            eff_pacing.get(
                "pad_end_ms",
                cut_cfg.get("pad_end_ms", cfg.get("pad_end_ms", DEFAULT_PAD_END_MS)),
            )
        )
    )
    resolved_merge_gap = (
        int(merge_gap_ms)
        if merge_gap_ms is not None
        else int(
            eff_pacing.get(
                "merge_gap_ms",
                cut_cfg.get("merge_gap_ms", cfg.get("merge_gap_ms", DEFAULT_MERGE_GAP_MS)),
            )
        )
    )
    resolved_fps = (
        float(fps)
        if fps is not None and fps > 0
        else float(exp_cfg.get("target_fps", cfg.get("target_fps", DEFAULT_FPS)))
    )
    resolved_fade_in = (
        int(fade_in_ms)
        if fade_in_ms is not None
        else int(cut_cfg.get("fade_in_ms", cfg.get("fade_in_ms", DEFAULT_AUDIO_FADE_MS)))
    )
    resolved_fade_out = (
        int(fade_out_ms)
        if fade_out_ms is not None
        else int(cut_cfg.get("fade_out_ms", cfg.get("fade_out_ms", DEFAULT_AUDIO_FADE_MS)))
    )

    return {
        "pad_start_ms": max(0, resolved_pad_start),
        "pad_end_ms": max(0, resolved_pad_end),
        "merge_gap_ms": max(0, resolved_merge_gap),
        "fps": resolved_fps if resolved_fps > 0 else DEFAULT_FPS,
        "fade_in_ms": max(0, resolved_fade_in),
        "fade_out_ms": max(0, resolved_fade_out),
        "clamp_to_source_bounds": bool(cut_cfg.get("clamp_to_source_bounds", True)),
        "resolve_overlaps": str(cut_cfg.get("resolve_overlaps", "midpoint")),
        "prefer_opening_mode": (
            str(eff_hook.get("prefer_opening_mode", "cold_open_duplicate"))
            if hook_group_active
            else "cold_open_duplicate"
        ),
        "max_silence_ms": int(eff_pacing.get("max_silence_ms", 400)),
        "silence_threshold_ms": int(eff_pacing.get("silence_threshold_ms", 400)),
        "target_pause_median_ms": int(eff_pacing.get("target_pause_median_ms", 220)),
    }


# ---------------------------------------------------------------------------
# Mathematical Helpers: Frame Alignment, Flag Trimming & Merging
# ---------------------------------------------------------------------------

def align_ms_to_frame(
    timestamp_ms: float,
    fps: float = DEFAULT_FPS,
    mode: str = "nearest",
) -> Tuple[int, int]:
    """
    Align a millisecond timestamp to a video frame boundary (`frame_ms = 1000.0 / fps`).
    Returns `(aligned_ms, frame_index)`.
    """
    effective_fps = float(fps) if fps and fps > 0 else DEFAULT_FPS
    frame_ms = 1000.0 / effective_fps
    raw_frames = max(0.0, float(timestamp_ms)) / frame_ms

    if mode == "floor":
        frame_idx = int(math.floor(raw_frames + 1e-9))
    elif mode == "ceil":
        frame_idx = int(math.ceil(raw_frames - 1e-9))
    else:
        frame_idx = int(round(raw_frames))

    aligned_ms = int(round(frame_idx * frame_ms))
    return max(0, aligned_ms), max(0, frame_idx)


def _extract_flags_list(flags_data: Any) -> List[Dict[str, Any]]:
    """Extract normalized acoustic/editorial cut flags from `flags.json`."""
    if flags_data is None:
        return []
    raw_items: List[Any] = []
    if isinstance(flags_data, list):
        raw_items = flags_data
    elif isinstance(flags_data, dict):
        for key in ("flags", "items", "silences", "fillers", "fluff", "markers"):
            if isinstance(flags_data.get(key), list):
                raw_items.extend(flags_data[key])

    normalized: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        f_type = str(item.get("type") or item.get("flag_type") or item.get("category") or "SILENCE").upper()
        action = str(item.get("action") or "cut").lower()
        if action in ("keep", "ignore", "preserve"):
            continue
        s_ms = item.get("start_ms", item.get("start"))
        e_ms = item.get("end_ms", item.get("end"))
        if isinstance(s_ms, (int, float)) and isinstance(e_ms, (int, float)) and e_ms > s_ms >= 0:
            normalized.append({
                "flag_id": str(item.get("flag_id") or item.get("id") or f"flag_{idx + 1:02d}"),
                "type": f_type,
                "action": action,
                "start_ms": int(round(s_ms)),
                "end_ms": int(round(e_ms)),
                "text": str(item.get("text") or ""),
            })
    normalized.sort(key=lambda x: (x["start_ms"], x["end_ms"]))
    return normalized


def _extract_words_list(words_data: Any) -> List[Dict[str, Any]]:
    """Extract normalized word-level timestamp list from `words.json`."""
    if words_data is None:
        return []
    raw_words: List[Any] = []
    if isinstance(words_data, list):
        raw_words = words_data
    elif isinstance(words_data, dict):
        if isinstance(words_data.get("words"), list):
            raw_words = words_data["words"]
        elif isinstance(words_data.get("segments"), list):
            for seg in words_data["segments"]:
                if isinstance(seg, dict) and isinstance(seg.get("words"), list):
                    raw_words.extend(seg["words"])

    words: List[Dict[str, Any]] = []
    for idx, w in enumerate(raw_words):
        if not isinstance(w, dict):
            continue
        s_ms = w.get("start_ms")
        e_ms = w.get("end_ms")
        if s_ms is None and w.get("start") is not None:
            s_ms = int(round(float(w["start"]) * 1000))
        if e_ms is None and w.get("end") is not None:
            e_ms = int(round(float(w["end"]) * 1000))
        if isinstance(s_ms, (int, float)) and isinstance(e_ms, (int, float)) and e_ms > s_ms >= 0:
            text_val = str(w.get("word") if "word" in w else (w.get("text") or "")).strip()
            if text_val:
                words.append({
                    "word_id": str(w.get("word_id") or w.get("id") or f"w{idx + 1}"),
                    "word": text_val,
                    "start_ms": int(round(s_ms)),
                    "end_ms": int(round(e_ms)),
                    "confidence": float(w.get("confidence", 0.95)),
                })
    words.sort(key=lambda x: (x["start_ms"], x["end_ms"]))
    return words


def _extract_beats_map(beats_data: Any) -> Dict[str, Dict[str, Any]]:
    """Map `beat_id` -> beat metadata from `beats.json`."""
    beats_map: Dict[str, Dict[str, Any]] = {}
    if beats_data is None:
        return beats_map
    raw_list: List[Any] = []
    if isinstance(beats_data, list):
        raw_list = beats_data
    elif isinstance(beats_data, dict):
        for key in ("beats", "items", "script_beats"):
            if isinstance(beats_data.get(key), list):
                raw_list = beats_data[key]
                break
    for idx, b in enumerate(raw_list):
        if not isinstance(b, dict):
            continue
        bid = str(b.get("beat_id") or b.get("id") or f"beat_{idx + 1:02d}")
        beats_map[bid] = {
            "beat_id": bid,
            "order": int(b.get("order", idx + 1)),
            "section_type": str(b.get("section_type") or b.get("type") or "body").lower(),
            "expected_text": str(b.get("expected_text") or b.get("text") or ""),
        }
    return beats_map


def _extract_best_takes(
    takes_data: Any,
    beats_map: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Extract selected best takes from `takes.json` while discarding bad/rejected takes.
    Supports both nested `selected_take` objects and flat take arrays with `selected` / `status` flags.
    """
    raw_entries: List[Any] = []
    if isinstance(takes_data, list):
        raw_entries = takes_data
    elif isinstance(takes_data, dict):
        for key in ("takes", "beats", "selections", "items"):
            if isinstance(takes_data.get(key), list):
                raw_entries = takes_data[key]
                break

    # Group by beat_id in case `takes.json` is a flat list of multiple takes (good + bad) per beat
    grouped_by_beat: Dict[str, List[Dict[str, Any]]] = {}
    beat_order: List[str] = []

    for idx, item in enumerate(raw_entries):
        if not isinstance(item, dict):
            continue
        status = str(item.get("status") or "").lower()
        if status in ("rejected", "discarded", "bad", "drop", "cut"):
            continue
        if item.get("keep") is False or item.get("selected") is False or item.get("is_selected") is False:
            continue

        beat_id = str(item.get("beat_id") or item.get("id") or f"beat_{idx + 1:02d}")
        if beat_id not in grouped_by_beat:
            grouped_by_beat[beat_id] = []
            beat_order.append(beat_id)

        # Check if item has an explicit `selected_take` dict
        sel_obj = item.get("selected_take") if isinstance(item.get("selected_take"), dict) else None
        if sel_obj is None and isinstance(item.get("candidates"), list):
            # Pick candidate marked selected=True, or highest score, or last valid candidate
            valid_cands = [
                c for c in item["candidates"]
                if isinstance(c, dict)
                and str(c.get("status") or "").lower() not in ("rejected", "discarded", "bad")
                and c.get("selected") is not False
                and c.get("keep") is not False
                and isinstance(c.get("start_ms"), (int, float))
                and isinstance(c.get("end_ms"), (int, float))
                and c["end_ms"] > c["start_ms"] >= 0
            ]
            explicit_sel = [c for c in valid_cands if c.get("selected") is True or c.get("is_selected") is True]
            if explicit_sel:
                sel_obj = explicit_sel[-1]
            elif valid_cands:
                sel_obj = valid_cands[-1]

        target = sel_obj if sel_obj is not None else item
        s_ms = target.get("start_ms", target.get("source_start_ms"))
        e_ms = target.get("end_ms", target.get("source_end_ms"))
        if not isinstance(s_ms, (int, float)) or not isinstance(e_ms, (int, float)) or e_ms <= s_ms or s_ms < 0:
            continue

        beat_info = beats_map.get(beat_id, {})
        sec_type = str(
            target.get("section_type")
            or item.get("section_type")
            or target.get("role")
            or item.get("role")
            or beat_info.get("section_type")
            or ("hook" if idx == 0 else "body")
        ).lower()
        text_val = str(
            target.get("text")
            or target.get("transcript")
            or item.get("text")
            or item.get("transcript")
            or item.get("expected_text")
            or beat_info.get("expected_text")
            or ""
        ).strip()

        grouped_by_beat[beat_id].append({
            "take_id": str(target.get("take_id") or item.get("take_id") or f"{beat_id}_take"),
            "beat_id": beat_id,
            "section_type": sec_type,
            "role": sec_type,
            "start_ms": int(round(s_ms)),
            "end_ms": int(round(e_ms)),
            "text": text_val,
            "explicit_selected": bool(
                sel_obj is not None
                or item.get("selected") is True
                or item.get("is_selected") is True
                or status in ("selected", "keep", "best")
            ),
            "score": float(target.get("score", item.get("score", 0.0)) or 0.0),
            "reasoning": str(target.get("reasoning") or item.get("reasoning") or item.get("reason") or ""),
        })

    selected_takes: List[Dict[str, Any]] = []
    for beat_id in beat_order:
        candidates = grouped_by_beat.get(beat_id, [])
        if not candidates:
            continue
        explicit = [c for c in candidates if c["explicit_selected"]]
        if explicit:
            chosen = explicit[-1]
        else:
            # Prefer last complete take (Rule 01)
            chosen = candidates[-1]
        selected_takes.append(chosen)

    return selected_takes


def _select_hook_candidate(
    hooks_data: Any,
    hook_option: Optional[Union[str, int]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[List[str]]]:
    """
    Resolve the chosen hook candidate and optional beat structure/order from `hooks.json`.
    Supports `--hook-option` (1-based rank/index or hook_id) and `selected_option` / `selected_hook_id`.
    """
    if hooks_data is None:
        return None, None

    raw_hooks: List[Any] = []
    selected_ref: Any = hook_option
    beat_order: Optional[List[str]] = None

    if isinstance(hooks_data, list):
        raw_hooks = hooks_data
    elif isinstance(hooks_data, dict):
        for key in ("hooks", "candidates", "options", "items"):
            if isinstance(hooks_data.get(key), list):
                raw_hooks = hooks_data[key]
                break
        if selected_ref is None:
            for sel_key in ("selected_option", "selected_hook_id", "recommended_hook_id", "best_hook_id", "selected"):
                if hooks_data.get(sel_key) is not None:
                    selected_ref = hooks_data.get(sel_key)
                    break
        for order_key in ("beat_order", "structure", "sequence"):
            if isinstance(hooks_data.get(order_key), list):
                beat_order = [str(x) for x in hooks_data[order_key] if x]
                break

    root_custom_clip = (
        hooks_data.get("custom_hook_clip_path") or hooks_data.get("custom_clip_path")
        if isinstance(hooks_data, dict)
        else None
    )

    valid_hooks: List[Dict[str, Any]] = []
    for idx, h in enumerate(raw_hooks):
        if not isinstance(h, dict):
            continue
        s_ms = h.get("start_ms", h.get("source_start_ms"))
        e_ms = h.get("end_ms", h.get("source_end_ms"))
        if not isinstance(s_ms, (int, float)) or not isinstance(e_ms, (int, float)) or e_ms <= s_ms or s_ms < 0:
            continue
        hid = str(h.get("hook_id") or h.get("option_id") or h.get("id") or f"hook_{idx + 1:02d}")
        valid_hooks.append({
            "hook_id": hid,
            "beat_id": str(h.get("beat_id") or "") if h.get("beat_id") else "",
            "rank": int(h.get("rank", idx + 1)),
            "start_ms": int(round(s_ms)),
            "end_ms": int(round(e_ms)),
            "score": float(h.get("score", 0.0) or 0.0),
            "text": str(h.get("text") or h.get("transcript") or "").strip(),
            "reasoning": str(h.get("reasoning") or h.get("reason") or h.get("explanation") or ""),
            "selected": bool(h.get("selected", False)),
            "is_teaser": bool(h.get("is_teaser", False) or h.get("cold_open", False)),
            "custom_clip_path": h.get("custom_clip_path") or root_custom_clip,
            "beat_order": [str(x) for x in h["beat_order"]] if isinstance(h.get("beat_order"), list) else None,
        })

    if not valid_hooks:
        return None, beat_order

    chosen: Optional[Dict[str, Any]] = None
    if selected_ref is not None:
        ref_str = str(selected_ref).strip()
        # 1. Match by hook_id / option_id / hook_<rank>
        for idx_h, h in enumerate(valid_hooks):
            r_num = h["rank"]
            idx_num = idx_h + 1
            if (
                h["hook_id"].lower() == ref_str.lower()
                or f"option_{r_num}" == ref_str.lower()
                or f"hook_{r_num}" == ref_str.lower()
                or f"hook_0{r_num}" == ref_str.lower()
                or f"hook_{idx_num}" == ref_str.lower()
                or f"hook_0{idx_num}" == ref_str.lower()
            ):
                chosen = h
                break
        # 2. Match by 1-based rank or index
        if chosen is None:
            try:
                ref_int = int(ref_str)
                for h in valid_hooks:
                    if h["rank"] == ref_int:
                        chosen = h
                        break
                if chosen is None and 1 <= ref_int <= len(valid_hooks):
                    chosen = valid_hooks[ref_int - 1]
                elif chosen is None and 0 <= ref_int < len(valid_hooks):
                    chosen = valid_hooks[ref_int]
            except ValueError:
                pass

    if chosen is None:
        explicit = [h for h in valid_hooks if h["selected"]]
        if explicit:
            chosen = explicit[0]
        else:
            # Sort by score descending, then rank ascending
            ranked = sorted(valid_hooks, key=lambda x: (-x["score"], x["rank"]))
            chosen = ranked[0]

    if chosen and chosen.get("beat_order"):
        beat_order = chosen["beat_order"]

    return chosen, beat_order


def _apply_flags_to_segments(
    segments: List[Dict[str, Any]],
    flags: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Remove or trim silence/filler/fluff intervals flagged in P3 (`flags.json`)
    from raw segments while preserving valid speech beats.
    """
    if not flags:
        return segments

    cut_flags = [
        f for f in flags
        if f["type"] in CUT_FLAG_TYPES and f["action"] not in ("keep", "ignore")
    ]
    if not cut_flags:
        return segments

    cleaned: List[Dict[str, Any]] = []
    for seg in segments:
        s_ms = int(seg["start_ms"])
        e_ms = int(seg["end_ms"])

        # Trim flags overlapping the start or end of the segment
        changed = True
        while changed:
            changed = False
            for flg in cut_flags:
                fs, fe = flg["start_ms"], flg["end_ms"]
                # Entire segment is inside a cut flag -> drop if not a required beat or if explicitly filler/silence
                if fs <= s_ms and fe >= e_ms:
                    s_ms = e_ms
                    break
                # Overlaps leading edge (and leaves >= 150ms)
                if fs <= s_ms < fe < e_ms and (e_ms - fe) >= 150:
                    s_ms = fe
                    changed = True
                # Overlaps trailing edge (and leaves >= 150ms)
                if s_ms < fs < e_ms <= fe and (fs - s_ms) >= 150:
                    e_ms = fs
                    changed = True

        if e_ms <= s_ms:
            continue

        # Check interior cut flags that split the segment into sub-segments
        intervals: List[Tuple[int, int]] = [(s_ms, e_ms)]
        for flg in cut_flags:
            fs, fe = flg["start_ms"], flg["end_ms"]
            next_intervals: List[Tuple[int, int]] = []
            for iv_s, iv_e in intervals:
                if iv_s < fs and fe < iv_e:
                    left_dur = fs - iv_s
                    right_dur = iv_e - fe
                    if left_dur >= 180 and right_dur >= 180:
                        next_intervals.append((iv_s, fs))
                        next_intervals.append((fe, iv_e))
                    else:
                        next_intervals.append((iv_s, iv_e))
                else:
                    next_intervals.append((iv_s, iv_e))
            intervals = next_intervals

        for sub_idx, (iv_s, iv_e) in enumerate(intervals):
            sub_seg = dict(seg)
            sub_seg["start_ms"] = iv_s
            sub_seg["end_ms"] = iv_e
            if len(intervals) > 1:
                sub_seg["take_id"] = f"{seg.get('take_id', 'seg')}_part{sub_idx + 1}"
            cleaned.append(sub_seg)

    return cleaned


# ---------------------------------------------------------------------------
# Main Cutlist Builder Pipeline
# ---------------------------------------------------------------------------

def build_cutlist(
    takes_data: Any,
    hooks_data: Optional[Any] = None,
    flags_data: Optional[Any] = None,
    words_data: Optional[Any] = None,
    beats_data: Optional[Any] = None,
    state_data: Optional[Any] = None,
    profile_path: Optional[Path] = None,
    hook_option: Optional[Union[str, int]] = None,
    source_video: Optional[str] = None,
    source_duration_ms: Optional[int] = None,
    fps: Optional[float] = None,
    pad_start_ms: Optional[int] = None,
    pad_end_ms: Optional[int] = None,
    merge_gap_ms: Optional[int] = None,
    fade_in_ms: Optional[int] = None,
    fade_out_ms: Optional[int] = None,
    custom_hook_clip_path: Optional[str] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build the complete `cutlist.json` dictionary from P3 (`flags`), P4 (`takes`), P5 (`hooks`),
    and optional S2 `effective_profile.json`.
    """
    # Resolve metadata from state.json / takes / words
    state_obj = state_data if isinstance(state_data, dict) else {}
    video_meta = state_obj.get("video_metadata") if isinstance(state_obj.get("video_metadata"), dict) else {}

    resolved_fps = fps
    if resolved_fps is None and isinstance(video_meta.get("fps"), (int, float)) and video_meta["fps"] > 0:
        resolved_fps = float(video_meta["fps"])

    params = resolve_profile_params(
        profile_path=profile_path,
        pad_start_ms=pad_start_ms,
        pad_end_ms=pad_end_ms,
        merge_gap_ms=merge_gap_ms,
        fps=resolved_fps,
        fade_in_ms=fade_in_ms,
        fade_out_ms=fade_out_ms,
        effective_profile=effective_profile,
    )

    eff_pad_start = params["pad_start_ms"]
    eff_pad_end = params["pad_end_ms"]
    eff_merge_gap = params["merge_gap_ms"]
    eff_fps = params["fps"]
    eff_fade_in = params["fade_in_ms"]
    eff_fade_out = params["fade_out_ms"]
    prefer_opening_mode = params.get("prefer_opening_mode", "cold_open_duplicate")
    frame_ms = 1000.0 / eff_fps

    # Resolve source_video and source_duration_ms
    resolved_video = (
        source_video
        or state_obj.get("source_video")
        or state_obj.get("video_path")
        or (takes_data.get("source_video") if isinstance(takes_data, dict) else None)
    )
    project_id = str(
        state_obj.get("project_id")
        or (takes_data.get("project_id") if isinstance(takes_data, dict) else None)
        or (beats_data.get("project_id") if isinstance(beats_data, dict) else None)
        or "default_project"
    )

    words = _extract_words_list(words_data)
    flags = _extract_flags_list(flags_data)
    beats_map = _extract_beats_map(beats_data)

    resolved_duration_ms: Optional[int] = None
    for candidate_dur in (
        source_duration_ms,
        video_meta.get("duration_ms"),
        int(round(float(video_meta["duration_sec"]) * 1000)) if isinstance(video_meta.get("duration_sec"), (int, float)) else None,
        takes_data.get("source_duration_ms") if isinstance(takes_data, dict) else None,
        takes_data.get("max_duration_ms") if isinstance(takes_data, dict) else None,
        takes_data.get("duration_ms") if isinstance(takes_data, dict) else None,
        words_data.get("duration_ms") if isinstance(words_data, dict) else None,
    ):
        if isinstance(candidate_dur, (int, float)) and candidate_dur > 0:
            resolved_duration_ms = int(round(candidate_dur))
            break

    # Step 1: Extract best takes from P4
    best_takes = _extract_best_takes(takes_data, beats_map)

    # Step 2: Resolve selected hook from P5 and order segments
    chosen_hook, custom_beat_order = _select_hook_candidate(hooks_data, hook_option=hook_option)

    if custom_beat_order:
        order_index = {bid: idx for idx, bid in enumerate(custom_beat_order)}
        best_takes.sort(key=lambda t: order_index.get(t["beat_id"], 9999))

    ordered_raw_segments: List[Dict[str, Any]] = []
    if chosen_hook is not None:
        hook_beat_id = chosen_hook.get("beat_id") or (best_takes[0]["beat_id"] if best_takes else "beat_01")
        hook_s = chosen_hook["start_ms"]
        hook_e = chosen_hook["end_ms"]

        is_middle_or_end_beat = bool(
            len(best_takes) > 0
            and best_takes[0]["beat_id"] != hook_beat_id
            and hook_s > best_takes[0]["start_ms"] + 300
        )
        is_cold_open_teaser = bool(
            chosen_hook.get("is_teaser", False)
            or is_middle_or_end_beat
        )

        # Check if chosen_hook replaces the first beat vs prepending as a cold-open teaser (cold_open_duplicate)
        matched_first = (
            len(best_takes) > 0
            and (
                best_takes[0]["beat_id"] == hook_beat_id
                or best_takes[0]["section_type"] == "hook"
                or (abs(best_takes[0]["start_ms"] - hook_s) <= 300 and abs(best_takes[0]["end_ms"] - hook_e) <= 300)
            )
            and not is_cold_open_teaser
        )

        eff_custom_clip = (
            custom_hook_clip_path
            or chosen_hook.get("custom_clip_path")
            or state_obj.get("custom_hook_clip_path")
        )
        hook_seg = {
            "take_id": chosen_hook["hook_id"],
            "beat_id": hook_beat_id,
            "beat_ids": [hook_beat_id] if hook_beat_id else [],
            "section_type": "hook",
            "role": "hook",
            "label": "hook",
            "start_ms": hook_s,
            "end_ms": hook_e,
            "text": chosen_hook.get("text") or (best_takes[0]["text"] if matched_first else ""),
            "is_hook": True,
            "is_hook_preview": is_cold_open_teaser,
            "opening_mode": "cold_open_duplicate" if is_cold_open_teaser else prefer_opening_mode,
            "hook_id": chosen_hook["hook_id"],
            "hook_score": chosen_hook.get("score"),
            "custom_clip_path": str(eff_custom_clip) if eff_custom_clip else None,
        }
        ordered_raw_segments.append(hook_seg)

        for idx, take in enumerate(best_takes):
            if idx == 0 and matched_first:
                continue
            # Avoid exact duplicate back-to-back segment only when not a cold-open teaser from middle/end of video
            if (
                take["start_ms"] == hook_s
                and take["end_ms"] == hook_e
                and take["beat_id"] == hook_beat_id
                and not is_cold_open_teaser
            ):
                continue
            ordered_raw_segments.append({
                "take_id": take["take_id"],
                "beat_id": take["beat_id"],
                "beat_ids": [take["beat_id"]],
                "section_type": take["section_type"] if take["section_type"] != "hook" else "body",
                "role": take["section_type"] if take["section_type"] != "hook" else "body",
                "label": take["beat_id"],
                "start_ms": take["start_ms"],
                "end_ms": take["end_ms"],
                "text": take["text"],
                "is_hook": False,
                "is_hook_preview": False,
            })
    else:
        for idx, take in enumerate(best_takes):
            is_first_hook = (idx == 0 and take["section_type"] == "hook")
            role = "hook" if is_first_hook else take["section_type"]
            ordered_raw_segments.append({
                "take_id": take["take_id"],
                "beat_id": take["beat_id"],
                "beat_ids": [take["beat_id"]],
                "section_type": role,
                "role": role,
                "label": "hook" if is_first_hook else take["beat_id"],
                "start_ms": take["start_ms"],
                "end_ms": take["end_ms"],
                "text": take["text"],
                "is_hook": is_first_hook,
                "is_hook_preview": False,
            })

    # Step 3: Filter/trim silence, filler, and fluff flags from P3 (`flags.json`)
    filtered_segments = _apply_flags_to_segments(ordered_raw_segments, flags)

    # Ensure source_duration_ms is at least as large as max raw segment end if not explicitly bounded
    max_raw_end = max((s["end_ms"] for s in filtered_segments), default=0)
    if resolved_duration_ms is None and max_raw_end > 0:
        resolved_duration_ms = max_raw_end + eff_pad_end + 1000

    # Step 4: Apply padding (`pad_start_ms`, `pad_end_ms`) clamped to `[0, source_duration_ms]`
    padded_segments: List[Dict[str, Any]] = []
    for seg in filtered_segments:
        raw_s = int(seg["start_ms"])
        raw_e = int(seg["end_ms"])

        pad_s = max(0, raw_s - eff_pad_start)
        pad_e = raw_e + eff_pad_end
        if resolved_duration_ms is not None and resolved_duration_ms > 0:
            pad_e = min(resolved_duration_ms, pad_e)
            pad_s = min(pad_s, pad_e)

        item = dict(seg)
        item["raw_start_ms"] = raw_s
        item["raw_end_ms"] = raw_e
        item["padded_start_ms"] = pad_s
        item["padded_end_ms"] = pad_e
        padded_segments.append(item)

    # Step 5: Merge consecutive segments of the same role/source separated by `< merge_gap_ms`
    # Never merge a hook segment with a body segment, and never merge non-chronological segments!
    merged_segments: List[Dict[str, Any]] = []
    for seg in padded_segments:
        if not merged_segments:
            merged_segments.append(seg)
            continue

        prev = merged_segments[-1]
        same_role = (prev["role"] == seg["role"]) and (not prev.get("is_hook")) and (not seg.get("is_hook"))
        raw_gap_ms = seg["raw_start_ms"] - prev["raw_end_ms"]
        padded_gap_ms = seg["padded_start_ms"] - prev["padded_end_ms"]

        # Check if any cut flag lies between prev.raw_end_ms and seg.raw_start_ms
        has_intervening_flag = any(
            f["start_ms"] >= prev["raw_end_ms"] - 5 and f["end_ms"] <= seg["raw_start_ms"] + 5
            for f in flags
        )

        # Merge if consecutive in source timeline (0 <= raw_gap_ms < merge_gap_ms or 0 <= padded_gap_ms < merge_gap_ms with small raw gap)
        can_merge = (
            same_role
            and not has_intervening_flag
            and raw_gap_ms >= 0
            and (raw_gap_ms < eff_merge_gap or (padded_gap_ms < eff_merge_gap and raw_gap_ms < eff_merge_gap * 2))
        )

        if can_merge:
            prev["raw_end_ms"] = max(prev["raw_end_ms"], seg["raw_end_ms"])
            prev["padded_end_ms"] = max(prev["padded_end_ms"], seg["padded_end_ms"])
            for bid in seg.get("beat_ids", [seg["beat_id"]]):
                if bid and bid not in prev["beat_ids"]:
                    prev["beat_ids"].append(bid)
            if seg.get("text") and seg["text"] not in prev.get("text", ""):
                prev["text"] = f"{prev.get('text', '').strip()} {seg['text'].strip()}".strip()
            prev["merged_count"] = int(prev.get("merged_count", 1)) + 1
        else:
            merged_segments.append(seg)

    # Step 6: Resolve any padding overlaps between chronological adjacent segments via midpoint
    for idx in range(len(merged_segments) - 1):
        curr = merged_segments[idx]
        nxt = merged_segments[idx + 1]
        # Check if curr is a cold-open hook pulled from later in the video than nxt
        if curr.get("is_hook") and curr["raw_start_ms"] > nxt["raw_start_ms"]:
            curr["is_hook_preview"] = True
            continue
        if nxt["raw_start_ms"] >= curr["raw_end_ms"] and curr["padded_end_ms"] > nxt["padded_start_ms"]:
            midpoint = int(round((curr["raw_end_ms"] + nxt["raw_start_ms"]) / 2.0))
            curr["padded_end_ms"] = min(curr["padded_end_ms"], midpoint)
            nxt["padded_start_ms"] = max(nxt["padded_start_ms"], midpoint)

    # Step 7: Frame boundary alignment (`frame_ms = 1000.0 / fps`) + Word boundary protection
    final_segments: List[Dict[str, Any]] = []
    timeline_cursor_ms = 0
    all_subtitles: List[Dict[str, Any]] = []

    for idx, seg in enumerate(merged_segments):
        raw_s = seg["raw_start_ms"]
        raw_e = seg["raw_end_ms"]
        pad_s = seg["padded_start_ms"]
        pad_e = seg["padded_end_ms"]

        aligned_s, start_frame = align_ms_to_frame(pad_s, eff_fps, mode="nearest")
        aligned_e, end_frame = align_ms_to_frame(pad_e, eff_fps, mode="nearest")

        if resolved_duration_ms is not None and resolved_duration_ms > 0:
            if aligned_e > resolved_duration_ms:
                aligned_e, end_frame = align_ms_to_frame(resolved_duration_ms, eff_fps, mode="floor")
                aligned_e = min(aligned_e, resolved_duration_ms)

        # Ensure word boundary safety against `words.json` so no word is ever clipped mid-word
        if words:
            for w in words:
                ws, we = w["start_ms"], w["end_ms"]
                # Word belongs to this segment's core speech
                if ws >= raw_s - 15 and we <= raw_e + 15:
                    if aligned_s > ws:
                        aligned_s, start_frame = align_ms_to_frame(ws, eff_fps, mode="floor")
                    if aligned_e < we:
                        aligned_e, end_frame = align_ms_to_frame(we, eff_fps, mode="ceil")
                        if resolved_duration_ms is not None:
                            aligned_e = min(aligned_e, resolved_duration_ms)
                else:
                    # Word is outside this segment: ensure padded+aligned boundary does not slice into it
                    if ws < aligned_s < we or (aligned_s < we <= raw_s):
                        aligned_s, start_frame = align_ms_to_frame(we, eff_fps, mode="ceil")
                        aligned_s = max(aligned_s, we)
                    if ws < aligned_e < we or (raw_e <= ws < aligned_e):
                        aligned_e, end_frame = align_ms_to_frame(ws, eff_fps, mode="floor")
                        aligned_e = min(aligned_e, ws)

        # Guarantee monotonic non-overlap with previous chronological segment
        if final_segments and not final_segments[-1].get("is_hook_preview"):
            prev_end = final_segments[-1]["end_ms"]
            if raw_s >= final_segments[-1]["raw_end_ms"] and aligned_s < prev_end:
                aligned_s = prev_end
                _, start_frame = align_ms_to_frame(aligned_s, eff_fps, mode="ceil")

        if aligned_e <= aligned_s:
            aligned_e = aligned_s + max(int(round(frame_ms * 4)), 150)
            if resolved_duration_ms is not None and resolved_duration_ms > 0:
                aligned_e = min(aligned_e, resolved_duration_ms)
            _, end_frame = align_ms_to_frame(aligned_e, eff_fps, mode="nearest")

        dur_ms = aligned_e - aligned_s
        target_s = timeline_cursor_ms
        target_e = timeline_cursor_ms + dur_ms
        timeline_cursor_ms = target_e

        # Collect words falling inside this segment and compute target timeline offsets
        seg_words: List[Dict[str, Any]] = []
        for w in words:
            if w["start_ms"] >= aligned_s and w["end_ms"] <= aligned_e:
                w_target_s = target_s + (w["start_ms"] - aligned_s)
                w_target_e = target_s + (w["end_ms"] - aligned_s)
                seg_words.append({
                    "word_id": w["word_id"],
                    "word": w["word"],
                    "start_ms": w["start_ms"],
                    "end_ms": w["end_ms"],
                    "target_start_ms": w_target_s,
                    "target_end_ms": w_target_e,
                    "confidence": w["confidence"],
                })

        text_val = seg.get("text", "").strip()
        if not text_val and seg_words:
            text_val = " ".join(w["word"] for w in seg_words).strip()
        if not text_val:
            text_val = f"Segment {idx + 1}"

        # Audio fade (~30ms, clamped to at most 40% of segment duration)
        max_fade = max(0, dur_ms // 3)
        seg_fade_in = min(eff_fade_in, max_fade)
        seg_fade_out = min(eff_fade_out, max_fade)

        role_str = str(seg.get("role") or seg.get("section_type") or "body")
        beat_id_str = str(seg.get("beat_id") or f"beat_{idx + 1:02d}")
        label_str = "hook" if role_str == "hook" else beat_id_str
        seg_id = f"seg_{idx + 1:03d}"
        clip_id = f"{idx + 1:03d}_{label_str}"

        sub_entry = {
            "index": idx + 1,
            "segment_id": seg_id,
            "start_ms": target_s,
            "end_ms": target_e,
            "target_start_ms": target_s,
            "target_end_ms": target_e,
            "source_start_ms": aligned_s,
            "source_end_ms": aligned_e,
            "text": text_val,
        }
        all_subtitles.append(sub_entry)

        final_segments.append({
            "id": seg_id,
            "segment_id": seg_id,
            "clip_id": clip_id,
            "order": idx + 1,
            "beat_id": beat_id_str,
            "beat_ids": seg.get("beat_ids", [beat_id_str]),
            "role": role_str,
            "label": label_str,
            "section_type": role_str,
            "is_hook": bool(seg.get("is_hook", role_str == "hook")),
            "is_hook_preview": bool(seg.get("is_hook_preview", False)),
            "raw_start_ms": raw_s,
            "raw_end_ms": raw_e,
            "start_ms": aligned_s,
            "end_ms": aligned_e,
            "source_start_ms": aligned_s,
            "source_end_ms": aligned_e,
            "pad_start_ms": max(0, raw_s - aligned_s),
            "pad_end_ms": max(0, aligned_e - raw_e),
            "duration_ms": dur_ms,
            "timeline_start_ms": target_s,
            "timeline_end_ms": target_e,
            "target_start_ms": target_s,
            "target_end_ms": target_e,
            "fps": eff_fps,
            "frame_duration_ms": round(frame_ms, 4),
            "start_frame": start_frame,
            "end_frame": end_frame,
            "frame_aligned": True,
            "audio_fade_in_ms": seg_fade_in,
            "audio_fade_out_ms": seg_fade_out,
            "fade_in_ms": seg_fade_in,
            "fade_out_ms": seg_fade_out,
            "audio_fade": {
                "fade_in_ms": seg_fade_in,
                "fade_out_ms": seg_fade_out,
                "curve": "tri",
            },
            "merged_count": int(seg.get("merged_count", 1)),
            "custom_clip_path": seg.get("custom_clip_path"),
            "text": text_val,
            "words": seg_words,
            "subtitles": [sub_entry],
        })

    resolved_custom_hook_clip = (
        custom_hook_clip_path
        or (chosen_hook.get("custom_clip_path") if chosen_hook else None)
        or state_obj.get("custom_hook_clip_path")
    )

    cutlist_payload: Dict[str, Any] = {
        "schema_version": "1.0",
        "phase": "P6",
        "project_id": project_id,
        "style_id": effective_profile.get("style_id") if isinstance(effective_profile, dict) else None,
        "template": effective_profile.get("template") if isinstance(effective_profile, dict) else None,
        "playback_speed": 1.0,
        "source_video": resolved_video,
        "source_duration_ms": resolved_duration_ms or timeline_cursor_ms,
        "total_duration_ms": timeline_cursor_ms,
        "fps": eff_fps,
        "frame_duration_ms": round(frame_ms, 4),
        "pad_start_ms": eff_pad_start,
        "pad_end_ms": eff_pad_end,
        "merge_gap_ms": eff_merge_gap,
        "audio_fade_in_ms": eff_fade_in,
        "audio_fade_out_ms": eff_fade_out,
        "prefer_opening_mode": prefer_opening_mode,
        "selected_hook_id": chosen_hook["hook_id"] if chosen_hook else None,
        "custom_hook_clip_path": str(resolved_custom_hook_clip) if resolved_custom_hook_clip else None,
        "segments": final_segments,
        "subtitles": all_subtitles,
    }
    if isinstance(effective_profile, dict):
        for section_key in ("aspect_ratio", "pacing", "hook", "captions", "audio", "titlecard", "punchin"):
            if section_key in effective_profile:
                cutlist_payload[section_key] = effective_profile[section_key]

    if validate_cutlist is not None:
        validate_cutlist(cutlist_payload, raise_on_error=True)

    return cutlist_payload


def _update_workspace_state(workspace: Path, cutlist_path: Path, cutlist_payload: Dict[str, Any]) -> None:
    state_path = workspace / "state.json"
    if not state_path.exists():
        return
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            return
        phases = state.setdefault("phases", {})
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        phases["P6"] = {
            "status": "completed",
            "completed_at": now_iso,
            "updated_at": now_iso,
            "artifact": str(cutlist_path.name),
            "metrics": {
                "segment_count": len(cutlist_payload.get("segments", [])),
                "total_duration_ms": cutlist_payload.get("total_duration_ms", 0),
                "fps": cutlist_payload.get("fps", DEFAULT_FPS),
                "style_id": cutlist_payload.get("style_id"),
                "pad_start_ms": cutlist_payload.get("pad_start_ms"),
                "pad_end_ms": cutlist_payload.get("pad_end_ms"),
                "merge_gap_ms": cutlist_payload.get("merge_gap_ms"),
            },
        }
        state["updated_at"] = now_iso
        state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def run_p6_cutlist(
    workspace_dir: Optional[Union[Path, str]] = None,
    takes_path: Optional[Union[Path, str]] = None,
    hooks_path: Optional[Union[Path, str]] = None,
    flags_path: Optional[Union[Path, str]] = None,
    words_path: Optional[Union[Path, str]] = None,
    beats_path: Optional[Union[Path, str]] = None,
    state_path: Optional[Union[Path, str]] = None,
    profile_path: Optional[Union[Path, str]] = None,
    output_path: Optional[Union[Path, str]] = None,
    hook_option: Optional[Union[str, int]] = None,
    source_video: Optional[str] = None,
    source_duration_ms: Optional[int] = None,
    fps: Optional[float] = None,
    pad_start_ms: Optional[int] = None,
    pad_end_ms: Optional[int] = None,
    merge_gap_ms: Optional[int] = None,
    fade_ms: Optional[int] = None,
    custom_hook_clip_path: Optional[str] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute Phase 6 Cutlist Builder on a workspace directory or explicit file paths."""
    ws = Path(workspace_dir).resolve() if workspace_dir else None

    t_file = Path(takes_path) if takes_path else (ws / "takes.json" if ws else None)
    h_file = Path(hooks_path) if hooks_path else (ws / "hooks.json" if ws else None)
    f_file = Path(flags_path) if flags_path else (ws / "flags.json" if ws else None)
    w_file = Path(words_path) if words_path else (ws / "words.json" if ws else None)
    b_file = Path(beats_path) if beats_path else (ws / "beats.json" if ws else None)
    s_file = Path(state_path) if state_path else (ws / "state.json" if ws else None)
    p_file = Path(profile_path) if profile_path else None
    out_file = Path(output_path) if output_path else (ws / "cutlist.json" if ws else Path("cutlist.json"))

    if t_file is None or not t_file.exists():
        raise FileNotFoundError(f"Required input takes.json not found at: {t_file}")

    takes_data = _load_json_if_exists(t_file)
    hooks_data = _load_json_if_exists(h_file)
    flags_data = _load_json_if_exists(f_file)
    words_data = _load_json_if_exists(w_file)
    beats_data = _load_json_if_exists(b_file)
    state_data = _load_json_if_exists(s_file)

    resolved_eff_profile = (
        effective_profile
        if isinstance(effective_profile, dict)
        else _load_effective_profile_from_workspace(ws or (t_file.parent if t_file else None))
    )

    eff_custom_clip = custom_hook_clip_path
    if not eff_custom_clip and ws is not None:
        meta_data = _load_json_if_exists(ws / "studio_meta.json")
        if isinstance(meta_data, dict):
            eff_custom_clip = meta_data.get("custom_hook_clip_path") or meta_data.get("customHookClipPath")
        if not eff_custom_clip:
            for cand_name in ("custom_hook_clip.mp4", "custom_hook_clip.mov"):
                cand_file = ws / cand_name
                if cand_file.exists():
                    eff_custom_clip = str(cand_file.resolve())
                    break

    cutlist_payload = build_cutlist(
        takes_data=takes_data,
        hooks_data=hooks_data,
        flags_data=flags_data,
        words_data=words_data,
        beats_data=beats_data,
        state_data=state_data,
        profile_path=p_file,
        hook_option=hook_option,
        source_video=source_video,
        source_duration_ms=source_duration_ms,
        fps=fps,
        pad_start_ms=pad_start_ms,
        pad_end_ms=pad_end_ms,
        merge_gap_ms=merge_gap_ms,
        fade_in_ms=fade_ms,
        fade_out_ms=fade_ms,
        custom_hook_clip_path=eff_custom_clip,
        effective_profile=resolved_eff_profile,
    )

    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(cutlist_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    if ws is not None:
        _update_workspace_state(ws, out_file, cutlist_payload)

    return cutlist_payload


# Aliases for CLI orchestrator compatibility
run_phase = run_p6_cutlist
execute = run_p6_cutlist


# ---------------------------------------------------------------------------
# Self-Test Suite
# ---------------------------------------------------------------------------

def run_self_test() -> int:
    """
    Self-test verifying:
    1. Filtering out P3 silence/filler/fluff flags and P4 rejected bad takes.
    2. Hook selection (`--hook-option` / `selected_option`) and placement at start.
    3. Speech padding (`pad_start_ms=80`, `pad_end_ms=120`) clamped to `[0, duration_ms]`.
    4. Merging consecutive body segments with gap `< merge_gap_ms (150ms)` while NOT
       merging the hook segment with body segments.
    5. Frame boundary alignment (`fps=25.0 -> frame_ms=40ms` and `fps=30.0 -> frame_ms=33.33ms`)
       and word boundary protection (no clipped words).
    6. Audio fade-in/fade-out (`30ms`) and valid `cutlist.json` schema output.
    """
    print("=== [P6 Cutlist Builder] Running Self-Test ===")
    with tempfile.TemporaryDirectory(prefix="p6_cutlist_selftest_") as tmp_dir:
        ws = Path(tmp_dir)

        state_sample = {
            "project_id": "selftest_podscare_p6",
            "source_video": "/tmp/raw_podscare.mp4",
            "video_metadata": {
                "duration_ms": 20000,
                "fps": 25.0,  # 1 frame = 40.0 ms exact
                "width": 1080,
                "height": 1920,
            },
            "phases": {"P0": {"status": "completed"}},
        }
        beats_sample = {
            "beats": [
                {
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "expected_text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    "anchor_keywords": ["AirPods Pro", "bị rè"],
                },
                {
                    "beat_id": "beat_02",
                    "section_type": "body",
                    "expected_text": "Nguyên nhân chính là do màng loa bị rách.",
                    "anchor_keywords": ["màng loa", "rách"],
                },
                {
                    "beat_id": "beat_03",
                    "section_type": "body",
                    "expected_text": "Hoặc bám bụi bẩn lâu ngày.",
                    "anchor_keywords": ["bụi bẩn"],
                },
                {
                    "beat_id": "beat_04",
                    "section_type": "cta",
                    "expected_text": "Ghé ngay PodsCare để vệ sinh miễn phí nhé!",
                    "anchor_keywords": ["PodsCare", "miễn phí"],
                },
            ]
        }
        words_sample = {
            "duration_ms": 20000,
            "words": [
                {"word_id": "w1", "word": "Tai", "start_ms": 2000, "end_ms": 2300, "confidence": 0.98},
                {"word_id": "w2", "word": "nghe", "start_ms": 2320, "end_ms": 2900, "confidence": 0.97},
                {"word_id": "w3", "word": "Nguyên", "start_ms": 5000, "end_ms": 5400, "confidence": 0.96},
                {"word_id": "w4", "word": "nhân", "start_ms": 5420, "end_ms": 6000, "confidence": 0.97},
                # beat_03 starts at 6100ms -> only 100ms gap after beat_02 (6000ms), < merge_gap_ms (150ms)!
                {"word_id": "w5", "word": "Hoặc", "start_ms": 6100, "end_ms": 6500, "confidence": 0.95},
                {"word_id": "w6", "word": "bẩn", "start_ms": 6520, "end_ms": 7200, "confidence": 0.98},
                {"word_id": "w7", "word": "PodsCare", "start_ms": 12000, "end_ms": 13500, "confidence": 0.99},
            ],
        }
        flags_sample = {
            "flags": [
                {"flag_id": "f1", "type": "FILLER", "start_ms": 500, "end_ms": 1100, "text": "À ừm"},
                {"flag_id": "f2", "type": "SILENCE", "start_ms": 1100, "end_ms": 1900, "text": "[SILENCE: 0.80s]"},
                {"flag_id": "f3", "type": "FLUFF", "start_ms": 13600, "end_ms": 14200, "text": "ờ thôi cắt đoạn này"},
            ]
        }
        takes_sample = {
            "project_id": "selftest_podscare_p6",
            "takes": [
                {
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "candidates": [
                        {"take_id": "t1_bad", "start_ms": 500, "end_ms": 1800, "status": "rejected", "text": "À ừm tai nghe..."},
                        {"take_id": "t1_good", "start_ms": 2000, "end_ms": 2900, "selected": True, "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?"},
                    ],
                    "selected_take": {
                        "take_id": "t1_good",
                        "start_ms": 2000,
                        "end_ms": 2900,
                        "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    },
                    "reasoning": "Chọn take 2 trôi chảy, loại bỏ take 1 nói vấp.",
                },
                {
                    "beat_id": "beat_02",
                    "section_type": "body",
                    "start_ms": 5000,
                    "end_ms": 6000,
                    "text": "Nguyên nhân chính là do màng loa bị rách.",
                    "reasoning": "Take rõ chữ.",
                },
                {
                    "beat_id": "beat_03",
                    "section_type": "body",
                    "start_ms": 6100,
                    "end_ms": 7200,
                    "text": "Hoặc bám bụi bẩn lâu ngày.",
                    "reasoning": "Liên tiếp ngay sau beat_02 với khoảng nghỉ 100ms (< 150ms).",
                },
                {
                    "beat_id": "beat_04",
                    "section_type": "cta",
                    # Include trailing fluff [13600..14200] to verify P3 flag trimming at trailing edge
                    "start_ms": 12000,
                    "end_ms": 14200,
                    "text": "Ghé ngay PodsCare để vệ sinh miễn phí nhé!",
                    "reasoning": "CTA cuối video.",
                },
            ],
        }
        hooks_sample = {
            "project_id": "selftest_podscare_p6",
            "selected_option": "hook_02",
            "hooks": [
                {
                    "hook_id": "hook_01",
                    "beat_id": "beat_01",
                    "rank": 1,
                    "start_ms": 2000,
                    "end_ms": 2900,
                    "score": 88.0,
                    "text": "Tai nghe AirPods Pro bị rè một bên?",
                    "reasoning": "Phương án 1.",
                },
                {
                    "hook_id": "hook_02",
                    "beat_id": "beat_01",
                    "rank": 2,
                    "start_ms": 2000,
                    "end_ms": 2900,
                    "score": 95.5,
                    "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    "reasoning": "Phương án 2 đầy đủ câu hỏi thu hút 3s đầu.",
                    "selected": True,
                },
            ],
        }

        (ws / "state.json").write_text(json.dumps(state_sample, indent=2), encoding="utf-8")
        (ws / "beats.json").write_text(json.dumps(beats_sample, indent=2), encoding="utf-8")
        (ws / "words.json").write_text(json.dumps(words_sample, indent=2), encoding="utf-8")
        (ws / "flags.json").write_text(json.dumps(flags_sample, indent=2), encoding="utf-8")
        (ws / "takes.json").write_text(json.dumps(takes_sample, indent=2), encoding="utf-8")
        (ws / "hooks.json").write_text(json.dumps(hooks_sample, indent=2), encoding="utf-8")

        result = run_p6_cutlist(workspace_dir=ws, hook_option=2, pad_start_ms=80, pad_end_ms=120)
        cutlist_file = ws / "cutlist.json"
        assert cutlist_file.exists(), "cutlist.json must be created on disk"

        segs = result["segments"]
        # beat_01 (hook), beat_02+beat_03 (merged body because gap=100ms < 150ms), beat_04 (cta with fluff trimmed) -> 3 segments
        assert len(segs) == 3, f"Expected 3 segments after merging beat_02 & beat_03, got {len(segs)}"

        # 1. Verify Hook placement & padding (2000 - 80 = 1920, 2900 + 120 = 3020 -> frame aligned to 40ms at 25fps -> 3040 or 3000)
        seg_hook = segs[0]
        assert seg_hook["role"] == "hook"
        assert seg_hook["start_ms"] == 1920, f"Expected hook start_ms=1920, got {seg_hook['start_ms']}"
        assert seg_hook["start_ms"] % 40 == 0, "At 25fps (40ms/frame), start_ms must align to 40ms frame boundary"
        assert seg_hook["end_ms"] % 40 == 0, "At 25fps (40ms/frame), end_ms must align to 40ms frame boundary"
        assert seg_hook["audio_fade_in_ms"] == 30 and seg_hook["audio_fade_out_ms"] == 30

        # 2. Verify Merge (< merge_gap_ms = 150ms) on beat_02 [5000..6000] + beat_03 [6100..7200]
        seg_body = segs[1]
        assert seg_body["beat_ids"] == ["beat_02", "beat_03"], f"Expected merged beat_ids ['beat_02', 'beat_03'], got {seg_body['beat_ids']}"
        assert seg_body["merged_count"] == 2
        assert seg_body["raw_start_ms"] == 5000 and seg_body["raw_end_ms"] == 7200
        assert seg_body["start_ms"] == 4920 and seg_body["end_ms"] == 7320

        # 3. Verify P3 Fluff Flag [13600..14200] trimmed from beat_04 [12000..14200] -> raw_end_ms=13600
        seg_cta = segs[2]
        assert seg_cta["raw_end_ms"] == 13600, f"Expected trailing fluff trimmed to 13600, got {seg_cta['raw_end_ms']}"
        assert seg_cta["start_ms"] == 11920 and seg_cta["end_ms"] == 13720

        # 4. Verify contiguous target timeline (target_start_ms / target_end_ms)
        cursor = 0
        for s in segs:
            assert s["target_start_ms"] == cursor
            assert s["target_end_ms"] == cursor + s["duration_ms"]
            assert 0 <= s["start_ms"] < s["end_ms"] <= result["source_duration_ms"]
            cursor = s["target_end_ms"]
        assert result["total_duration_ms"] == cursor

        print(
            f"[PASS] Cutlist segments={len(segs)} | Merged beat_02+beat_03 | "
            f"Total duration={result['total_duration_ms']}ms | Frame aligned @ {result['fps']}fps | Fade=30ms"
        )
        print("=== [P6 Cutlist Builder] Self-Test PASSED (exit code 0) ===")
        return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Phase 6 Cutlist Builder: Merge flags.json (P3), takes.json (P4), and hooks.json (P5) into cutlist.json."
    )
    parser.add_argument("--workspace", "--project-dir", dest="workspace", type=str, default=None, help="Workspace directory.")
    parser.add_argument("--takes", dest="takes_path", type=str, default=None, help="Path to takes.json.")
    parser.add_argument("--hooks", dest="hooks_path", type=str, default=None, help="Path to hooks.json.")
    parser.add_argument("--flags", dest="flags_path", type=str, default=None, help="Path to flags.json.")
    parser.add_argument("--words", dest="words_path", type=str, default=None, help="Path to words.json.")
    parser.add_argument("--beats", dest="beats_path", type=str, default=None, help="Path to beats.json.")
    parser.add_argument("--state", dest="state_path", type=str, default=None, help="Path to state.json.")
    parser.add_argument("--profile", dest="profile_path", type=str, default=None, help="Path to profile.yaml.")
    parser.add_argument("--output", "-o", dest="output_path", type=str, default=None, help="Output path for cutlist.json.")
    parser.add_argument("--hook-option", dest="hook_option", type=str, default=None, help="Selected hook option (1, 2, 3 or hook_id).")
    parser.add_argument("--custom-hook-clip", dest="custom_hook_clip", type=str, default=None, help="Optional path to a custom opening hook video clip (.mp4/.mov).")
    parser.add_argument("--source-video", dest="source_video", type=str, default=None, help="Source video path.")
    parser.add_argument("--duration-ms", dest="duration_ms", type=int, default=None, help="Source video duration in ms.")
    parser.add_argument("--fps", dest="fps", type=float, default=None, help="Source video FPS for frame alignment.")
    parser.add_argument("--pad-start-ms", dest="pad_start_ms", type=int, default=None, help="Override pad_start_ms.")
    parser.add_argument("--pad-end-ms", dest="pad_end_ms", type=int, default=None, help="Override pad_end_ms.")
    parser.add_argument("--merge-gap-ms", dest="merge_gap_ms", type=int, default=None, help="Override merge_gap_ms.")
    parser.add_argument("--fade-ms", dest="fade_ms", type=int, default=None, help="Audio fade-in/out duration in ms (default 30).")
    parser.add_argument("--self-test", action="store_true", help="Run built-in mathematical & schema self-test.")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    if not args.workspace and not args.takes_path:
        parser.error("Either --workspace <dir>, --takes <path>, or --self-test is required.")

    cutlist = run_p6_cutlist(
        workspace_dir=args.workspace,
        takes_path=args.takes_path,
        hooks_path=args.hooks_path,
        flags_path=args.flags_path,
        words_path=args.words_path,
        beats_path=args.beats_path,
        state_path=args.state_path,
        profile_path=args.profile_path,
        output_path=args.output_path,
        hook_option=args.hook_option,
        source_video=args.source_video,
        source_duration_ms=args.duration_ms,
        fps=args.fps,
        pad_start_ms=args.pad_start_ms,
        pad_end_ms=args.pad_end_ms,
        merge_gap_ms=args.merge_gap_ms,
        fade_ms=args.fade_ms,
        custom_hook_clip_path=args.custom_hook_clip,
    )
    print(json.dumps({
        "phase": "P6",
        "status": "completed",
        "segments": len(cutlist.get("segments", [])),
        "total_duration_ms": cutlist.get("total_duration_ms", 0),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
