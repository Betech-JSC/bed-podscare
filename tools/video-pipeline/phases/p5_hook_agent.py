#!/usr/bin/env python3
"""
Phase 5 (P5): Hook Agent (`p5_hook_agent.py`)

Reads `takes.json` (P4) and `beats.json` (P1) and composes 3 distinct opening
hook options (target duration 5–10 seconds / 5000ms–10000ms) from available
footage for Human Checkpoint 1 (Điểm dừng 1):
  1. `teaser`: Đoạn nhá hàng cao trào / kết quả ấn tượng nhất.
  2. `question`: Đoạn đặt câu hỏi / nêu vấn đề gợi tò mò.
  3. `statement`: Đoạn khẳng định mạnh mẽ / tuyên ngôn giá trị cốt lõi.

Outputs `hooks.json` validated against `schemas/pipeline_schemas.py`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

sys.dont_write_bytecode = True

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

try:
    from schemas.pipeline_schemas import validate_hooks as validate_hooks_schema  # type: ignore
except Exception:
    validate_hooks_schema = None

HOOK_STYLES: Tuple[str, ...] = ("teaser", "question", "statement")
TARGET_MIN_DURATION_MS = 5000
TARGET_MAX_DURATION_MS = 10000

QUESTION_CUES = (
    "?",
    "tại sao",
    "vì sao",
    "có sửa được không",
    "bạn có biết",
    "bao giờ chưa",
    "làm sao",
    "như thế nào",
    "có nên",
)

TEASER_CUES = (
    "hoàn toàn có thể",
    "bí quyết",
    "kết quả",
    "chỉ cần",
    "ngay tại",
    "100%",
    "zin",
    "miễn phí",
    "cứu",
    "thay màng loa",
    "vệ sinh",
)

STATEMENT_CUES = (
    "nguyên nhân",
    "sự thật",
    "đừng bao giờ",
    "sai lầm",
    "chính là",
    "tuy nhiên",
    "quan trọng nhất",
    "cam kết",
)


def _extract_beats_map(beats_data: Any) -> Dict[str, Dict[str, Any]]:
    """Map `beat_id` -> beat dict from `beats.json`."""
    beats_map: Dict[str, Dict[str, Any]] = {}
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
            "index": idx,
            "section_type": str(b.get("section_type") or b.get("beat_type") or "body").lower(),
            "expected_text": str(b.get("expected_text") or b.get("text") or ""),
            "anchor_keywords": list(b.get("anchor_keywords") or []),
            "hook_candidate": bool(b.get("hook_candidate", idx == 0)),
        }
    return beats_map


def _extract_available_footage(
    takes_data: Any,
    beats_map: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Extract ordered list of selected clean takes from `takes.json`."""
    raw_entries: List[Any] = []
    if isinstance(takes_data, list):
        raw_entries = takes_data
    elif isinstance(takes_data, dict):
        for key in ("takes", "beats", "selections", "items"):
            if isinstance(takes_data.get(key), list):
                raw_entries = takes_data[key]
                break

    footage: List[Dict[str, Any]] = []
    for idx, entry in enumerate(raw_entries):
        if not isinstance(entry, dict):
            continue
        beat_id = str(entry.get("beat_id") or entry.get("id") or f"beat_{idx + 1:02d}")
        sel = entry.get("selected_take") if isinstance(entry.get("selected_take"), dict) else entry

        s_ms = sel.get("start_ms", entry.get("start_ms"))
        e_ms = sel.get("end_ms", entry.get("end_ms"))
        if not isinstance(s_ms, (int, float)) or not isinstance(e_ms, (int, float)):
            continue
        start_ms = max(0, int(round(s_ms)))
        end_ms = int(round(e_ms))
        if end_ms <= start_ms:
            continue

        beat_meta = beats_map.get(beat_id, {})
        section_type = str(
            sel.get("section_type")
            or entry.get("section_type")
            or beat_meta.get("section_type")
            or ("hook" if idx == 0 else "body")
        ).lower()
        text = str(
            sel.get("text")
            or entry.get("text")
            or entry.get("expected_text")
            or beat_meta.get("expected_text")
            or ""
        ).strip()
        take_id = str(
            sel.get("take_id")
            or entry.get("selected_take_id")
            or entry.get("take_id")
            or f"{beat_id}_t01"
        )
        raw_score = float(sel.get("score", entry.get("score", 4.5)) or 4.5)
        score_5 = raw_score if raw_score <= 5.0 else round(raw_score / 20.0, 2)

        footage.append(
            {
                "index": idx,
                "beat_id": beat_id,
                "take_id": take_id,
                "section_type": section_type,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": end_ms - start_ms,
                "text": text,
                "anchor_keywords": list(
                    entry.get("anchor_keywords") or beat_meta.get("anchor_keywords") or []
                ),
                "take_score_5": score_5,
            }
        )

    return footage


def _extract_prompt_keywords(hook_prompt: Optional[str]) -> List[str]:
    """Extract lowercase keywords (len >= 2) from a user-provided hook description."""
    if not hook_prompt or not str(hook_prompt).strip():
        return []
    import re as _re
    tokens = _re.findall(r"[0-9A-Za-zÀ-ỹ]+", str(hook_prompt).lower())
    stopwords = {"và", "hoặc", "cho", "với", "các", "những", "một", "được", "trong", "của", "là", "có", "để", "này", "đó"}
    return [t for t in tokens if len(t) >= 2 and t not in stopwords]


def _score_clip_for_style(
    clip: Dict[str, Any],
    style: str,
    total_clips: int,
    hook_prompt: Optional[str] = None,
) -> float:
    """Compute how well a footage clip serves as the lead segment for `style`."""
    low = clip["text"].lower()
    sec = clip["section_type"]
    idx = clip["index"]
    base = clip.get("take_score_5", 4.5) * 10.0  # 0..50

    prompt_bonus = 0.0
    if hook_prompt:
        kws = _extract_prompt_keywords(hook_prompt)
        if kws:
            anchor_low = " ".join(str(k).lower() for k in clip.get("anchor_keywords", []))
            combined_text = f"{low} {anchor_low}"
            hit_count = sum(1 for kw in kws if kw in combined_text)
            prompt_bonus = hit_count * 16.0

    if style == "question":
        cue_hits = sum(1 for cue in QUESTION_CUES if cue in low)
        pos_bonus = 25.0 if idx == 0 else (15.0 if sec == "hook" else 5.0)
        return base + cue_hits * 12.0 + pos_bonus + prompt_bonus

    if style == "teaser":
        cue_hits = sum(1 for cue in TEASER_CUES if cue in low)
        # Teaser prefers climax / solution / body payoff beats (middle or later beats)
        if sec == "body" and idx > 0:
            pos_bonus = 24.0
        elif idx == total_clips - 1 and total_clips > 1:
            pos_bonus = 18.0
        else:
            pos_bonus = 10.0
        return base + cue_hits * 10.0 + pos_bonus + prompt_bonus

    # style == "statement"
    cue_hits = sum(1 for cue in STATEMENT_CUES if cue in low)
    not_question_bonus = 12.0 if "?" not in low else 0.0
    pos_bonus = 20.0 if (sec in ("body", "hook") and "?" not in low) else 12.0
    return base + cue_hits * 10.0 + not_question_bonus + pos_bonus + prompt_bonus


def _compose_segments_for_style(
    style: str,
    footage: Sequence[Dict[str, Any]],
    min_duration_ms: int = TARGET_MIN_DURATION_MS,
    max_duration_ms: int = TARGET_MAX_DURATION_MS,
    hook_prompt: Optional[str] = None,
    allow_short_hook: bool = False,
) -> List[Dict[str, Any]]:
    """
    Select and combine footage clips into a hook sequence whose total duration
    is within `[min_duration_ms, max_duration_ms]` (default 5000ms–10000ms).
    When `allow_short_hook=True` (e.g. under S2 `effective_profile.json` boundary safety),
    if total available footage is shorter than `min_duration_ms`, keeps real take boundaries
    instead of extending `end_ms` past the take end and sets `short_hook=True`.
    """
    if not footage:
        return [
            {
                "segment_id": f"{style}_seg_01",
                "beat_id": "beat_01",
                "take_id": "beat_01_t01",
                "start_ms": 0,
                "end_ms": 6000,
                "duration_ms": 6000,
                "text": "Đoạn mở đầu mặc định (Hook).",
            }
        ]

    total_clips = len(footage)
    ranked_indices = sorted(
        range(total_clips),
        key=lambda i: (-_score_clip_for_style(footage[i], style, total_clips, hook_prompt=hook_prompt), i),
    )

    # If user provided a hook_prompt and the top-ranked clip strongly matches it, allow it to lead
    prompt_kws = _extract_prompt_keywords(hook_prompt)
    best_prompt_idx: Optional[int] = None
    if prompt_kws:
        best_hits = 0
        for i, clip in enumerate(footage):
            low_txt = f"{clip['text'].lower()} {' '.join(str(k).lower() for k in clip.get('anchor_keywords', []))}"
            hits = sum(1 for kw in prompt_kws if kw in low_txt)
            if hits > best_hits:
                best_hits = hits
                best_prompt_idx = i

    # Pick distinct lead clip order preference per style while keeping chronology natural
    if style == "question":
        # Question hook starts from the opening hook beat (or best question beat)
        lead_idx = 0 if "?" in footage[0]["text"] or footage[0]["section_type"] == "hook" else ranked_indices[0]
        candidate_order = [lead_idx] + [i for i in range(total_clips) if i != lead_idx]
    elif style == "teaser":
        # Teaser starts with climax/payoff beat (preferring best_prompt_idx or index >= 1 if available)
        if best_prompt_idx is not None and best_prompt_idx > 0:
            lead_idx = best_prompt_idx
        else:
            non_first = [i for i in ranked_indices if i > 0]
            lead_idx = non_first[0] if non_first else ranked_indices[0]
        candidate_order = [lead_idx] + [i for i in range(total_clips) if i != lead_idx]
    else:
        # Statement starts with strong declarative beat (or opening beat + core body statement)
        if best_prompt_idx is not None and "?" not in footage[best_prompt_idx]["text"]:
            lead_idx = best_prompt_idx
        else:
            decl_indices = [i for i in ranked_indices if "?" not in footage[i]["text"]]
            lead_idx = decl_indices[0] if decl_indices else ranked_indices[0]
        candidate_order = [lead_idx] + [i for i in range(total_clips) if i != lead_idx]

    composed: List[Dict[str, Any]] = []
    accumulated_ms = 0

    for c_idx in candidate_order:
        if accumulated_ms >= min_duration_ms:
            break
        clip = footage[c_idx]
        clip_s = int(clip["start_ms"])
        clip_e = int(clip["end_ms"])
        clip_dur = clip_e - clip_s
        if clip_dur <= 0:
            continue

        remaining_to_max = max_duration_ms - accumulated_ms
        if remaining_to_max <= 0:
            break

        if clip_dur > remaining_to_max:
            # Trim clip end_ms so total duration stays <= max_duration_ms (10000ms)
            target_dur = max(min_duration_ms - accumulated_ms, min(clip_dur, remaining_to_max))
            target_dur = min(target_dur, remaining_to_max)
            clip_e = clip_s + target_dur
            clip_dur = clip_e - clip_s

        composed.append(
            {
                "segment_id": f"{style}_seg_{len(composed) + 1:02d}",
                "beat_id": clip["beat_id"],
                "take_id": clip["take_id"],
                "section_type": clip["section_type"],
                "start_ms": clip_s,
                "end_ms": clip_e,
                "duration_ms": clip_dur,
                "text": clip["text"],
            }
        )
        accumulated_ms += clip_dur

    # If total footage across all takes was shorter than min_duration_ms:
    # - When allow_short_hook=True (S2 guardrail): never extend end_ms past real take boundary;
    #   mark short_hook=True instead.
    # - Otherwise (legacy): extend last segment window to min_duration_ms.
    if composed and accumulated_ms < min_duration_ms:
        if allow_short_hook:
            composed[-1]["short_hook"] = True
        else:
            needed_ms = min_duration_ms - accumulated_ms
            last_seg = composed[-1]
            last_seg["end_ms"] = int(last_seg["end_ms"] + needed_ms)
            last_seg["duration_ms"] = int(last_seg["end_ms"] - last_seg["start_ms"])

    return composed


def build_hook_option(
    style: str,
    footage: Sequence[Dict[str, Any]],
    min_duration_ms: int = TARGET_MIN_DURATION_MS,
    max_duration_ms: int = TARGET_MAX_DURATION_MS,
    hook_prompt: Optional[str] = None,
    preferred_style: Optional[str] = None,
    prefer_opening_mode: str = "cold_open_duplicate",
    text_overlay: bool = False,
    allow_short_hook: bool = False,
) -> Dict[str, Any]:
    """Build a single hook option (`teaser`, `question`, or `statement`) with target duration."""
    segments = _compose_segments_for_style(
        style=style,
        footage=footage,
        min_duration_ms=min_duration_ms,
        max_duration_ms=max_duration_ms,
        hook_prompt=hook_prompt,
        allow_short_hook=allow_short_hook,
    )
    total_duration_ms = sum(int(s["duration_ms"]) for s in segments)
    is_short_hook = bool(
        (allow_short_hook and total_duration_ms < min_duration_ms)
        or any(bool(s.get("short_hook")) for s in segments)
    )
    hook_text = " ".join(s["text"].strip() for s in segments if s.get("text")).strip()

    first_seg = segments[0]
    # Primary segment start_ms and end_ms (guaranteed start_ms < end_ms and aligned to take boundary)
    primary_start_ms = int(first_seg["start_ms"])
    if len(segments) == 1:
        primary_end_ms = int(first_seg["end_ms"])
    else:
        # Keep primary start_ms/end_ms aligned with the lead beat take so downstream P6 cutlist
        # never slices mid-word or overlaps subsequent body beats, while `duration_ms` and
        # `segments` carry the full hook composition.
        primary_end_ms = int(first_seg["end_ms"])

    if primary_end_ms <= primary_start_ms:
        primary_end_ms = primary_start_ms + total_duration_ms

    lead_beat_id = str(first_seg["beat_id"])
    first_footage_beat_id = str(footage[0]["beat_id"]) if footage else lead_beat_id
    is_teaser_cold_open = bool(
        (style == "teaser" or prefer_opening_mode == "cold_open_duplicate")
        and lead_beat_id != first_footage_beat_id
    )

    if style == "question":
        title = "Phương án Câu hỏi (Question Hook) - Khơi gợi tò mò & nỗi đau người xem"
        score = 94.5 if "?" in hook_text else 90.5
        rationale = (
            f"Mở đầu bằng câu hỏi trực diện vào vấn đề của người xem ({total_duration_ms / 1000:.1f}s), "
            f"kích thích sự tò mò ngay trong 3 giây đầu và giữ chân người xem chờ câu trả lời."
        )
    elif style == "teaser":
        title = "Phương án Nhá hàng Cao trào (Teaser Hook) - Đẩy kết quả ấn tượng lên đầu"
        score = 92.0
        rationale = (
            f"Đưa đoạn cao trào/giải pháp giá trị nhất lên mở đầu ({total_duration_ms / 1000:.1f}s) "
            f"để tạo hiệu ứng bất ngờ (cold-open teaser) trước khi đi vào chi tiết."
        )
    else:
        title = "Phương án Khẳng định Giá trị (Statement Hook) - Tuyên ngôn chuyên môn đanh thép"
        score = 89.5
        rationale = (
            f"Mở đầu bằng nhận định chuyên môn rõ ràng, nhịp độ dứt khoát ({total_duration_ms / 1000:.1f}s), "
            f"xây dựng ngay uy tín thương hiệu từ những giây đầu tiên."
        )

    has_user_prompt = bool(hook_prompt and str(hook_prompt).strip())
    if has_user_prompt:
        clean_prompt = str(hook_prompt).strip()
        kws = _extract_prompt_keywords(clean_prompt)
        low_hook = hook_text.lower()
        low_prompt = clean_prompt.lower()
        hits = sum(1 for kw in kws if kw in low_hook)
        style_bonus = 0.0
        if style == "question" and any(c in low_prompt for c in ("câu hỏi", "question", "hỏi", "?")):
            style_bonus = 6.5
        elif style == "teaser" and any(c in low_prompt for c in ("cao trào", "teaser", "nhá hàng", "kết quả", "giải pháp")):
            style_bonus = 7.0
        elif style == "statement" and any(c in low_prompt for c in ("khẳng định", "statement", "chuyên gia", "tuyên bố")):
            style_bonus = 8.0
        if hits > 0 or style_bonus > 0:
            score = min(99.5, score + min(5.5, hits * 1.5) + style_bonus)
            rationale = f'[Ưu tiên theo mô tả Hook: "{clean_prompt}"] {rationale}'
    elif preferred_style and str(preferred_style).strip().lower() == style:
        score = min(98.5, score + 8.0)
        rationale = f'[Ưu tiên theo phong cách mẫu: "{style}"] {rationale}'

    if is_short_hook:
        rationale = f"[Giữ nguyên ranh giới take thực tế ({total_duration_ms}ms < min_ms={min_duration_ms}ms)] {rationale}"

    option_id = f"hook_{style}"
    return {
        "option_id": option_id,
        "hook_id": option_id,
        "style": style,
        "title": title,
        "beat_id": lead_beat_id,
        "start_ms": primary_start_ms,
        "end_ms": primary_end_ms,
        "duration_ms": int(total_duration_ms),
        "hook_text": hook_text,
        "text": first_seg["text"] if len(segments) > 1 else hook_text,
        "full_hook_text": hook_text,
        "segments": segments,
        "score": round(score, 2),
        "score_5": round(score / 20.0, 2),
        "rationale": rationale,
        "reasoning": rationale,
        "reason": rationale,
        "explanation": rationale,
        "is_teaser": is_teaser_cold_open,
        "short_hook": is_short_hook,
        "opening_mode": prefer_opening_mode,
        "text_overlay": bool(text_overlay),
        "selected": False,
    }


def _load_effective_profile_from_workspace(ws_dir: Optional[Path]) -> Optional[Dict[str, Any]]:
    """Read `work/effective_profile.json` or `effective_profile.json` from workspace if present."""
    if ws_dir is None:
        return None
    for candidate in (
        ws_dir / "work" / "effective_profile.json",
        ws_dir / "effective_profile.json",
    ):
        if candidate.exists() and candidate.is_file():
            try:
                loaded = json.loads(candidate.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    return loaded
            except Exception:
                pass
    return None


def generate_hooks(
    takes_data: Any,
    beats_data: Optional[Any] = None,
    select_style: Optional[Union[str, int]] = None,
    min_duration_ms: int = TARGET_MIN_DURATION_MS,
    max_duration_ms: int = TARGET_MAX_DURATION_MS,
    project_id: Optional[str] = None,
    hook_prompt: Optional[str] = None,
    custom_hook_clip_path: Optional[str] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
    allow_short_hook: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Generate `hooks.json` payload with all 3 required hook styles (`teaser`, `question`, `statement`),
    each having `duration_ms` in `[min_duration_ms, max_duration_ms]` and `start_ms < end_ms`.
    Supports optional `hook_prompt` (description-guided scoring), `custom_hook_clip_path` (separate hook video file),
    and `effective_profile` (from Phase S2 `ps2_style_apply.py`).
    """
    beats_map = _extract_beats_map(beats_data)
    footage = _extract_available_footage(takes_data, beats_map)

    resolved_project_id = str(
        project_id
        or (takes_data.get("project_id") if isinstance(takes_data, dict) else None)
        or (beats_data.get("project_id") if isinstance(beats_data, dict) else None)
        or "default"
    )

    preferred_style: Optional[str] = None
    prefer_opening_mode: str = "cold_open_duplicate"
    text_overlay: bool = False
    style_id: Optional[str] = None
    eff_min_ms = int(min_duration_ms)
    eff_max_ms = int(max_duration_ms)

    if isinstance(effective_profile, dict):
        style_id = effective_profile.get("style_id")
        eff_groups = (
            effective_profile.get("enabled_groups")
            if isinstance(effective_profile.get("enabled_groups"), dict)
            else {}
        )
        hook_group_active = bool(eff_groups.get("hook", bool(style_id)))
        hook_cfg = effective_profile.get("hook")
        if isinstance(hook_cfg, dict):
            if min_duration_ms == TARGET_MIN_DURATION_MS and isinstance(hook_cfg.get("min_ms"), (int, float)):
                eff_min_ms = max(500, int(hook_cfg["min_ms"]))
            if max_duration_ms == TARGET_MAX_DURATION_MS and isinstance(hook_cfg.get("max_ms"), (int, float)):
                eff_max_ms = max(eff_min_ms, int(hook_cfg["max_ms"]))
            if not hook_prompt and isinstance(hook_cfg.get("hook_prompt"), str) and hook_cfg["hook_prompt"].strip():
                hook_prompt = hook_cfg["hook_prompt"].strip()
            if (hook_group_active or hook_prompt) and isinstance(hook_cfg.get("preferred_style"), str) and hook_cfg["preferred_style"].strip():
                preferred_style = hook_cfg["preferred_style"].strip().lower()
            if hook_group_active and isinstance(hook_cfg.get("prefer_opening_mode"), str) and hook_cfg["prefer_opening_mode"].strip():
                prefer_opening_mode = hook_cfg["prefer_opening_mode"].strip()
            if isinstance(hook_cfg.get("text_overlay"), bool):
                text_overlay = hook_cfg["text_overlay"]

    resolved_allow_short_hook = (
        bool(allow_short_hook)
        if allow_short_hook is not None
        else bool(
            isinstance(effective_profile, dict)
            and (
                effective_profile.get("style_id")
                or (
                    isinstance(effective_profile.get("enabled_groups"), dict)
                    and effective_profile["enabled_groups"].get("hook")
                )
            )
        )
    )

    clean_hook_prompt = str(hook_prompt).strip() if hook_prompt and str(hook_prompt).strip() else None
    clean_custom_clip = (
        str(custom_hook_clip_path).strip()
        if custom_hook_clip_path and str(custom_hook_clip_path).strip()
        else None
    )

    options_by_style: Dict[str, Dict[str, Any]] = {}
    for style in HOOK_STYLES:
        options_by_style[style] = build_hook_option(
            style=style,
            footage=footage,
            min_duration_ms=eff_min_ms,
            max_duration_ms=eff_max_ms,
            hook_prompt=clean_hook_prompt,
            preferred_style=preferred_style,
            prefer_opening_mode=prefer_opening_mode,
            text_overlay=text_overlay,
            allow_short_hook=resolved_allow_short_hook,
        )

    # Order options by score descending and assign 1-based rank
    ordered_options = sorted(
        options_by_style.values(),
        key=lambda opt: (-opt["score"], HOOK_STYLES.index(opt["style"])),
    )
    for idx, opt in enumerate(ordered_options, start=1):
        opt["rank"] = idx

    # Determine selected hook for Human Checkpoint 1 (Điểm dừng 1)
    chosen_opt = ordered_options[0]
    checkpoint_status = "pending_human_review"

    if select_style is not None:
        sel_raw = str(select_style).strip().lower()
        if sel_raw in ("custom", "custom_clip", "hook_custom_clip"):
            checkpoint_status = "approved"
        else:
            for opt in ordered_options:
                if (
                    opt["style"] == sel_raw
                    or opt["option_id"].lower() == sel_raw
                    or str(opt["rank"]) == sel_raw
                ):
                    chosen_opt = opt
                    checkpoint_status = "approved"
                    break

    if clean_custom_clip:
        chosen_opt["custom_clip_path"] = clean_custom_clip

    for opt in ordered_options:
        opt["selected"] = opt["option_id"] == chosen_opt["option_id"]

    selected_hook_obj: Dict[str, Any] = {
        "option_id": chosen_opt["option_id"],
        "hook_id": chosen_opt["hook_id"],
        "style": chosen_opt["style"],
        "title": chosen_opt["title"],
        "beat_id": chosen_opt["beat_id"],
        "start_ms": chosen_opt["start_ms"],
        "end_ms": chosen_opt["end_ms"],
        "duration_ms": chosen_opt["duration_ms"],
        "hook_text": chosen_opt["hook_text"],
        "score": chosen_opt["score"],
        "rationale": chosen_opt["rationale"],
        "segments": chosen_opt["segments"],
        "short_hook": bool(chosen_opt.get("short_hook", False)),
        "opening_mode": chosen_opt.get("opening_mode", prefer_opening_mode),
        "text_overlay": bool(chosen_opt.get("text_overlay", text_overlay)),
    }
    if clean_custom_clip:
        selected_hook_obj["custom_clip_path"] = clean_custom_clip
    if clean_hook_prompt:
        selected_hook_obj["hook_prompt"] = clean_hook_prompt

    payload: Dict[str, Any] = {
        "version": "1.0",
        "phase": "P5",
        "project_id": resolved_project_id,
        "style_id": style_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "checkpoint": "human_checkpoint_1",
        "checkpoint_status": checkpoint_status,
        "target_duration_range_ms": {
            "min_ms": eff_min_ms,
            "max_ms": eff_max_ms,
        },
        "preferred_style": preferred_style,
        "prefer_opening_mode": prefer_opening_mode,
        "text_overlay": text_overlay,
        "hook_prompt": clean_hook_prompt,
        "custom_hook_clip_path": clean_custom_clip,
        "selected_hook_id": chosen_opt["option_id"],
        "selected_option": chosen_opt["option_id"],
        "selected_style": chosen_opt["style"],
        "selected_hook": selected_hook_obj,
        "hooks": ordered_options,
        "options": ordered_options,
        "candidates": ordered_options,
    }

    if validate_hooks_schema is not None:
        validate_hooks_schema(payload, raise_on_error=True)

    return payload


def _update_workspace_state(workspace_dir: Path, output_path: Path, hooks_payload: Dict[str, Any]) -> None:
    state_path = workspace_dir / "state.json"
    if not state_path.exists():
        return
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if isinstance(state, dict):
            phases = state.setdefault("phases", {})
            phases["P5"] = {
                "status": "completed",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "artifact": str(output_path),
                "metrics": {
                    "options_count": len(hooks_payload.get("hooks", [])),
                    "selected_hook_id": hooks_payload.get("selected_hook_id"),
                    "checkpoint_status": hooks_payload.get("checkpoint_status"),
                    "hook_prompt": hooks_payload.get("hook_prompt"),
                    "custom_hook_clip_path": hooks_payload.get("custom_hook_clip_path"),
                    "style_id": hooks_payload.get("style_id"),
                    "preferred_style": hooks_payload.get("preferred_style"),
                },
            }
            state["current_phase"] = "P5"
            state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        pass


def _resolve_workspace_hook_extras(
    ws_dir: Path,
    hook_prompt: Optional[str] = None,
    custom_hook_clip_path: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Read `hook_prompt` and `custom_hook_clip_path` from `studio_meta.json`, `effective_profile.json`, or `state.json` if not passed."""
    resolved_prompt = hook_prompt
    resolved_clip = custom_hook_clip_path

    for meta_rel in ("studio_meta.json", "work/effective_profile.json", "effective_profile.json", "state.json"):
        meta_path = ws_dir / meta_rel
        if not meta_path.exists():
            continue
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                if not resolved_prompt:
                    resolved_prompt = (
                        data.get("hook_prompt")
                        or data.get("hookPrompt")
                        or (data.get("hook", {}).get("hook_prompt") if isinstance(data.get("hook"), dict) else None)
                    )
                if not resolved_clip:
                    resolved_clip = (
                        data.get("custom_hook_clip_path")
                        or data.get("customHookClipPath")
                        or data.get("hook_clip_path")
                        or data.get("hookClipPath")
                    )
        except Exception:
            pass

    if not resolved_clip:
        for cand_name in ("custom_hook_clip.mp4", "custom_hook_clip.mov"):
            cand_file = ws_dir / cand_name
            if cand_file.exists():
                resolved_clip = str(cand_file.resolve())
                break

    return (
        str(resolved_prompt).strip() if resolved_prompt and str(resolved_prompt).strip() else None,
        str(resolved_clip).strip() if resolved_clip and str(resolved_clip).strip() else None,
    )


def run_hook_agent_files(
    takes_path: Path | str,
    beats_path: Optional[Path | str] = None,
    output_path: Optional[Path | str] = None,
    select_style: Optional[Union[str, int]] = None,
    min_duration_ms: int = TARGET_MIN_DURATION_MS,
    max_duration_ms: int = TARGET_MAX_DURATION_MS,
    hook_prompt: Optional[str] = None,
    custom_hook_clip_path: Optional[str] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
    allow_short_hook: Optional[bool] = None,
) -> Dict[str, Any]:
    """Load `takes.json` and `beats.json` from disk, generate 3 hook options, and write `hooks.json`."""
    t_path = Path(takes_path)
    if not t_path.exists():
        raise FileNotFoundError(f"takes.json not found at: {t_path}")

    takes_data = json.loads(t_path.read_text(encoding="utf-8"))
    b_path = Path(beats_path) if beats_path else (t_path.parent / "beats.json")
    beats_data = json.loads(b_path.read_text(encoding="utf-8")) if b_path.exists() else None

    eff_prof = (
        effective_profile
        if isinstance(effective_profile, dict)
        else _load_effective_profile_from_workspace(t_path.parent)
    )

    eff_prompt, eff_clip = _resolve_workspace_hook_extras(
        t_path.parent,
        hook_prompt=hook_prompt,
        custom_hook_clip_path=custom_hook_clip_path,
    )

    result = generate_hooks(
        takes_data=takes_data,
        beats_data=beats_data,
        select_style=select_style,
        min_duration_ms=min_duration_ms,
        max_duration_ms=max_duration_ms,
        project_id=t_path.parent.name or "default",
        hook_prompt=eff_prompt,
        custom_hook_clip_path=eff_clip,
        effective_profile=eff_prof,
        allow_short_hook=allow_short_hook,
    )

    out_file = Path(output_path) if output_path else (t_path.parent / "hooks.json")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _update_workspace_state(out_file.parent, out_file, result)
    return result


def run_p5_hook_agent(
    workspace_dir: Optional[Path | str] = None,
    takes_path: Optional[Path | str] = None,
    beats_path: Optional[Path | str] = None,
    output_path: Optional[Path | str] = None,
    select_style: Optional[Union[str, int]] = None,
    min_duration_ms: int = TARGET_MIN_DURATION_MS,
    max_duration_ms: int = TARGET_MAX_DURATION_MS,
    hook_prompt: Optional[str] = None,
    custom_hook_clip_path: Optional[str] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
    allow_short_hook: Optional[bool] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Workspace-aware entry point for CLI orchestrators (`run_phase` / `execute`)."""
    ws = Path(workspace_dir) if workspace_dir else None
    t_path = takes_path or (ws / "takes.json" if ws else None)
    if not t_path:
        raise ValueError("Either workspace_dir or takes_path must be provided.")
    return run_hook_agent_files(
        takes_path=t_path,
        beats_path=beats_path or (ws / "beats.json" if ws else None),
        output_path=output_path or (ws / "hooks.json" if ws else None),
        select_style=select_style,
        min_duration_ms=min_duration_ms,
        max_duration_ms=max_duration_ms,
        hook_prompt=hook_prompt,
        custom_hook_clip_path=custom_hook_clip_path,
        effective_profile=effective_profile or _load_effective_profile_from_workspace(ws),
        allow_short_hook=allow_short_hook,
    )


run_phase = run_p5_hook_agent
execute = run_p5_hook_agent


# ---------------------------------------------------------------------------
# Self-Test Suite
# ---------------------------------------------------------------------------


def run_self_test() -> int:
    """
    Self-test for `p5_hook_agent.py`:
    - Reads sample `takes.json` and `beats.json` from a temporary directory.
    - Generates `hooks.json` and verifies:
      1. Exactly 3 options covering all 3 styles (`teaser`, `question`, `statement`).
      2. Every option has `5000 <= duration_ms <= 10000` (5–10 seconds).
      3. Every option and segment satisfies `0 <= start_ms < end_ms`.
      4. Human Checkpoint 1 metadata (`selected_hook`, `checkpoint_status`) is populated.
    """
    print("=== Running p5_hook_agent.py --self-test ===")
    with tempfile.TemporaryDirectory(prefix="p5_hook_agent_test_") as tmp_dir:
        tmp = Path(tmp_dir)

        beats_sample = {
            "project_id": "test_p5_proj",
            "beats": [
                {
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "expected_text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    "anchor_keywords": ["AirPods Pro", "bị rè", "sửa"],
                },
                {
                    "beat_id": "beat_02",
                    "section_type": "body",
                    "expected_text": "Nguyên nhân chính là do màng loa bị rách hoặc bám bẩn lâu ngày.",
                    "anchor_keywords": ["Nguyên nhân", "màng loa"],
                },
                {
                    "beat_id": "beat_03",
                    "section_type": "body",
                    "expected_text": "Tuy nhiên bạn hoàn toàn có thể vệ sinh và thay màng loa zin ngay tại PodsCare.",
                    "anchor_keywords": ["hoàn toàn có thể", "thay màng loa", "PodsCare"],
                },
                {
                    "beat_id": "beat_04",
                    "section_type": "cta",
                    "expected_text": "Nhắn tin ngay cho PodsCare để được kiểm tra miễn phí 100% nhé!",
                    "anchor_keywords": ["PodsCare", "miễn phí"],
                },
            ],
        }

        takes_sample = {
            "version": "1.0",
            "phase": "P4",
            "project_id": "test_p5_proj",
            "max_duration_ms": 25000,
            "takes": [
                {
                    "take_id": "beat_01_t02",
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "start_ms": 1000,
                    "end_ms": 4200,
                    "duration_ms": 3200,
                    "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                    "score": 4.9,
                    "reasoning": "Take hoàn chỉnh không vấp.",
                    "selected_take": {
                        "take_id": "beat_01_t02",
                        "start_ms": 1000,
                        "end_ms": 4200,
                        "text": "Tai nghe AirPods Pro bị rè một bên có sửa được không?",
                        "score": 4.9,
                    },
                },
                {
                    "take_id": "beat_02_t01",
                    "beat_id": "beat_02",
                    "section_type": "body",
                    "start_ms": 5000,
                    "end_ms": 8600,
                    "duration_ms": 3600,
                    "text": "Nguyên nhân chính là do màng loa bị rách hoặc bám bẩn lâu ngày.",
                    "score": 4.7,
                    "reasoning": "Giải thích nguyên nhân rõ ràng.",
                    "selected_take": {
                        "take_id": "beat_02_t01",
                        "start_ms": 5000,
                        "end_ms": 8600,
                        "text": "Nguyên nhân chính là do màng loa bị rách hoặc bám bẩn lâu ngày.",
                        "score": 4.7,
                    },
                },
                {
                    "take_id": "beat_03_t02",
                    "beat_id": "beat_03",
                    "section_type": "body",
                    "start_ms": 9500,
                    "end_ms": 15200,
                    "duration_ms": 5700,
                    "text": "Tuy nhiên bạn hoàn toàn có thể vệ sinh và thay màng loa zin ngay tại PodsCare.",
                    "score": 4.85,
                    "reasoning": "Đoạn cao trào giải pháp rõ chữ.",
                    "selected_take": {
                        "take_id": "beat_03_t02",
                        "start_ms": 9500,
                        "end_ms": 15200,
                        "text": "Tuy nhiên bạn hoàn toàn có thể vệ sinh và thay màng loa zin ngay tại PodsCare.",
                        "score": 4.85,
                    },
                },
                {
                    "take_id": "beat_04_t01",
                    "beat_id": "beat_04",
                    "section_type": "cta",
                    "start_ms": 16000,
                    "end_ms": 19500,
                    "duration_ms": 3500,
                    "text": "Nhắn tin ngay cho PodsCare để được kiểm tra miễn phí 100% nhé!",
                    "score": 4.8,
                    "reasoning": "CTA dứt khoát.",
                    "selected_take": {
                        "take_id": "beat_04_t01",
                        "start_ms": 16000,
                        "end_ms": 19500,
                        "text": "Nhắn tin ngay cho PodsCare để được kiểm tra miễn phí 100% nhé!",
                        "score": 4.8,
                    },
                },
            ],
        }

        takes_file = tmp / "takes.json"
        beats_file = tmp / "beats.json"
        hooks_file = tmp / "hooks.json"

        takes_file.write_text(json.dumps(takes_sample, ensure_ascii=False, indent=2), encoding="utf-8")
        beats_file.write_text(json.dumps(beats_sample, ensure_ascii=False, indent=2), encoding="utf-8")

        result = run_hook_agent_files(
            takes_path=takes_file,
            beats_path=beats_file,
            output_path=hooks_file,
        )

        assert hooks_file.exists(), "hooks.json was not written to disk"
        options = result["options"]
        assert len(options) == 3, f"Expected 3 hook options, got {len(options)}"

        styles_found = {opt["style"] for opt in options}
        assert styles_found == {"teaser", "question", "statement"}, (
            f"Expected styles {{'teaser', 'question', 'statement'}}, got {styles_found}"
        )

        for opt in options:
            dur = opt["duration_ms"]
            assert 5000 <= dur <= 10000, (
                f"Hook option '{opt['style']}' duration_ms={dur} outside 5000..10000ms range"
            )
            assert 0 <= opt["start_ms"] < opt["end_ms"], (
                f"Invalid start_ms/end_ms on '{opt['style']}': {opt['start_ms']}..{opt['end_ms']}"
            )
            assert isinstance(opt["segments"], list) and len(opt["segments"]) >= 1
            for seg in opt["segments"]:
                assert 0 <= seg["start_ms"] < seg["end_ms"]
            print(
                f"  [PASS] Style='{opt['style']}' | duration={dur}ms (in 5000..10000ms) | "
                f"score={opt['score']} | segments={len(opt['segments'])}"
            )

        assert result["checkpoint"] == "human_checkpoint_1"
        assert result["checkpoint_status"] == "pending_human_review"
        assert isinstance(result["selected_hook"], dict)
        print(
            f"[PASS] Human Checkpoint 1 metadata verified (recommended={result['selected_hook_id']})."
        )

    print("=== p5_hook_agent.py --self-test: ALL CHECKS PASSED ===")
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Phase 5 (P5): Generate 3 opening hook options (teaser, question, statement) of 5-10s duration from takes.json and beats.json."
    )
    parser.add_argument("--workspace", "-w", help="Workspace directory containing takes.json and beats.json")
    parser.add_argument("--takes", "-t", help="Path to takes.json")
    parser.add_argument("--beats", "-b", help="Path to beats.json")
    parser.add_argument("--output", "-o", help="Output path for hooks.json")
    parser.add_argument(
        "--select-style",
        "--hook-option",
        dest="select_style",
        help="Optional pre-selected hook style ('teaser', 'question', 'statement' or 1..3)",
    )
    parser.add_argument(
        "--hook-prompt",
        dest="hook_prompt",
        default=None,
        help="Optional user description/prompt for desired hook (e.g. 'Nhấn mạnh bảo hành 6 tháng')",
    )
    parser.add_argument(
        "--custom-hook-clip",
        dest="custom_hook_clip",
        default=None,
        help="Optional path to a custom opening hook video clip (.mp4/.mov)",
    )
    parser.add_argument("--min-duration-ms", type=int, default=TARGET_MIN_DURATION_MS, help="Minimum hook duration in ms (default: 5000)")
    parser.add_argument("--max-duration-ms", type=int, default=TARGET_MAX_DURATION_MS, help="Maximum hook duration in ms (default: 10000)")
    parser.add_argument("--self-test", action="store_true", help="Run built-in self-test suite")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    ws = Path(args.workspace) if args.workspace else None
    takes_path = args.takes or (str(ws / "takes.json") if ws else None)
    if not takes_path:
        parser.error("Provide --workspace <dir> or --takes <path> (or --self-test).")

    beats_path = args.beats or (str(ws / "beats.json") if ws else None)
    output_path = args.output or (str(ws / "hooks.json") if ws else None)

    result = run_hook_agent_files(
        takes_path=takes_path,
        beats_path=beats_path,
        output_path=output_path,
        select_style=args.select_style,
        min_duration_ms=args.min_duration_ms,
        max_duration_ms=args.max_duration_ms,
        hook_prompt=args.hook_prompt,
        custom_hook_clip_path=args.custom_hook_clip,
    )
    print(
        f"[P5 Hook Agent] Generated hooks.json with {len(result['hooks'])} options "
        f"(recommended={result['selected_hook_id']}) -> {output_path or (Path(takes_path).parent / 'hooks.json')}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
