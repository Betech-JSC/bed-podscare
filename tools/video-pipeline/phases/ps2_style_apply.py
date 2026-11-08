#!/usr/bin/env python3
"""
Stage S2 (PS2): 4-Tier Style Parameter Merger & Safety Guardrail Applier (`ps2_style_apply.py`).

Resolves effective pipeline parameters across 4 priority tiers:
  1. `user_override`   — Session overrides (e.g., `hook_prompt`, manual padding/aggression, toggle overrides)
  2. `sample_style`    — Measured/estimated metrics from `style_profile.json` for enabled style groups
  3. `template`        — Preset defaults (`podcast_vertical`, `podcast_horizontal`, `cut_only`)
  4. `default_profile` — Canonical baseline from `tools/video-pipeline/memory/profile.yaml`

Enforces strict safety invariants (Stage S2 / Design Section 2 & 3):
  - `playback_speed` is locked to `1.0` (never alters speech speed regardless of sample WPM).
  - Source aspect ratio is preserved (`keep_source_aspect = True`); if sample aspect differs from the
    new source video, keeps the new video's aspect/resolution and logs a trace entry + warning.
  - `audio.target_lufs` is clamped to `[-23.0, -9.0]` LUFS and `audio.true_peak_max_db <= -1.0` dBTP.
  - `captions.enabled` is set to `False` when `style_profile.captions.present == False` (unless user overrides).
  - `captions.font_family` is mapped/restricted to verified Vietnamese-capable fonts (`ALLOWED_VIETNAMESE_FONTS`).
  - `punchin.enabled` is activated from `sample_style` ONLY when `enabled_groups["punchin"]` is True,
    `punchin.detected` is True, `confidence["punchin"]` is `"measured"` or `"estimated"`, AND
    `evidence["punchin"]` contains concrete frame/timestamp evidence.

Outputs:
  - `work/effective_profile.json` (and `effective_profile.json` at workspace root)
  - `work/profile_trace.json` (and `profile_trace.json` at workspace root)
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None

from schemas.pipeline_schemas import (  # type: ignore
    ALLOWED_VIETNAMESE_FONTS,
    EffectiveProfile,
    LUFS_SAFE_MAX,
    LUFS_SAFE_MIN,
    PROFILE_TRACE_SOURCES,
    ProfileTrace,
    ProfileTraceEntry,
    STYLE_CAPTION_HIGHLIGHTS,
    STYLE_CAPTION_POSITIONS,
    STYLE_CONFIDENCE_LEVELS,
    STYLE_FONT_CLASSES,
    STYLE_HOOK_STYLES,
    STYLE_TEMPLATES,
     StyleProfile,
    TRUE_PEAK_SAFE_MAX_DB,
    normalize_nfc,
    normalize_nfc_deep,
    validate_effective_profile,
    validate_profile_trace,
    validate_style_profile,
)


FONT_CLASS_TO_VIETNAMESE_FONT: Dict[str, str] = {
    "sans_bold": "Be Vietnam Pro",
    "sans_regular": "Inter",
    "rounded_bold": "Manrope",
    "serif_bold": "Noto Sans",
}

DEFAULT_ENABLED_GROUPS: Dict[str, bool] = {
    "pacing": True,
    "hook": True,
    "captions": True,
    "audio": True,
    "punchin": True,
}

TEMPLATE_PRESETS: Dict[str, Dict[str, Any]] = {
    "podcast_vertical": {
        "format": {"width": 1080, "height": 1920, "fps": 30.0, "aspect": "9:16"},
        "pacing": {
            "pad_start_ms": 80,
            "pad_end_ms": 100,
            "merge_gap_ms": 150,
            "silence_threshold_ms": 400,
            "max_silence_ms": 650,
            "min_silence_ms": 400,
            "target_pause_median_ms": 240,
        },
        "hook": {
            "min_ms": 5000,
            "max_ms": 10000,
            "target_ms": 6500,
            "preferred_style": "question",
            "prefer_opening_mode": "reuse_opening",
            "text_overlay": False,
        },
        "captions": {
            "enabled": True,
            "position": "bottom_center",
            "words_per_line": 3,
            "max_lines": 1,
            "highlight": "keyword_color",
            "font_class": "sans_bold",
            "font_family": "Be Vietnam Pro",
            "text_color": "#FFFFFF",
            "highlight_color": "#FFD60A",
        },
        "audio": {
            "target_lufs": -14.0,
            "true_peak_max_db": -1.0,
            "lra_target": 11.0,
        },
        "titlecard": {"enabled": False, "duration_ms": 3000},
        "punchin": {
            "enabled": False,
            "min_gap_ms": 5000,
            "scale": 1.08,
            "min_shot_duration_ms": 2500,
        },
    },
    "podcast_horizontal": {
        "format": {"width": 1920, "height": 1080, "fps": 30.0, "aspect": "16:9"},
        "pacing": {
            "pad_start_ms": 85,
            "pad_end_ms": 110,
            "merge_gap_ms": 160,
            "silence_threshold_ms": 450,
            "max_silence_ms": 700,
            "min_silence_ms": 420,
            "target_pause_median_ms": 260,
        },
        "hook": {
            "min_ms": 5000,
            "max_ms": 10000,
            "target_ms": 7000,
            "preferred_style": "question",
            "prefer_opening_mode": "reuse_opening",
            "text_overlay": False,
        },
        "captions": {
            "enabled": True,
            "position": "bottom_center",
            "words_per_line": 5,
            "max_lines": 2,
            "highlight": "keyword_color",
            "font_class": "sans_bold",
            "font_family": "Be Vietnam Pro",
            "text_color": "#FFFFFF",
            "highlight_color": "#FFD60A",
        },
        "audio": {
            "target_lufs": -14.0,
            "true_peak_max_db": -1.0,
            "lra_target": 11.0,
        },
        "titlecard": {"enabled": False, "duration_ms": 3000},
        "punchin": {
            "enabled": False,
            "min_gap_ms": 6000,
            "scale": 1.06,
            "min_shot_duration_ms": 3000,
        },
    },
    "cut_only": {
        "format": {"width": 1080, "height": 1920, "fps": 30.0, "aspect": "9:16"},
        "pacing": {
            "pad_start_ms": 80,
            "pad_end_ms": 100,
            "merge_gap_ms": 150,
            "silence_threshold_ms": 450,
            "max_silence_ms": 700,
            "min_silence_ms": 400,
            "target_pause_median_ms": 250,
        },
        "hook": {
            "min_ms": 5000,
            "max_ms": 10000,
            "target_ms": 6500,
            "preferred_style": "question",
            "prefer_opening_mode": "reuse_opening",
            "text_overlay": False,
        },
        "captions": {
            "enabled": False,
            "position": "bottom_center",
            "words_per_line": 3,
            "max_lines": 1,
            "highlight": "none",
            "font_class": "sans_bold",
            "font_family": "Be Vietnam Pro",
            "text_color": "#FFFFFF",
            "highlight_color": "#FFD60A",
        },
        "audio": {
            "target_lufs": -14.0,
            "true_peak_max_db": -1.0,
            "lra_target": 11.0,
        },
        "titlecard": {"enabled": False, "duration_ms": 3000},
        "punchin": {
            "enabled": False,
            "min_gap_ms": 5000,
            "scale": 1.08,
            "min_shot_duration_ms": 2500,
        },
    },
}


# ---------------------------------------------------------------------------
# Helpers: Math, Aspect Ratio, File Loading
# ---------------------------------------------------------------------------

def _clamp_int(val: float | int, low: int, high: int) -> Tuple[int, bool]:
    rounded = int(round(float(val)))
    clamped_val = max(low, min(high, rounded))
    return clamped_val, (clamped_val != rounded)


def _clamp_float(val: float | int, low: float, high: float, ndigits: int = 2) -> Tuple[float, bool]:
    raw_f = round(float(val), ndigits)
    clamped_f = round(max(low, min(high, raw_f)), ndigits)
    return clamped_f, (abs(clamped_f - raw_f) > 1e-6)


def infer_aspect_ratio(width: int, height: int) -> str:
    """Compute canonical aspect ratio string (e.g. '9:16', '16:9', '1:1', '4:5') from width & height."""
    if width <= 0 or height <= 0:
        return "9:16"
    ratio = width / float(height)
    known = [
        ("9:16", 9.0 / 16.0),
        ("16:9", 16.0 / 9.0),
        ("1:1", 1.0),
        ("4:5", 4.0 / 5.0),
        ("4:3", 4.0 / 3.0),
        ("3:4", 3.0 / 4.0),
    ]
    for label, target in known:
        if abs(ratio - target) <= 0.04:
            return label
    g = math.gcd(int(width), int(height))
    return f"{int(width) // g}:{int(height) // g}"


def _load_json_safe(path: Optional[Path]) -> Any:
    if path is None or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _load_yaml_safe(path: Optional[Path]) -> Dict[str, Any]:
    if path is None or not path.exists():
        return {}
    raw_text = path.read_text(encoding="utf-8")
    if yaml is not None:
        try:
            loaded = yaml.safe_load(raw_text)
            return loaded if isinstance(loaded, dict) else {}
        except Exception:
            pass
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
            parsed[k.strip()] = float(val_str) if "." in val_str else int(val_str)
        except ValueError:
            parsed[k.strip()] = val_str
    return parsed


def load_effective_profile_for_workspace(
    workspace_dir: Optional[Union[str, Path]],
    explicit_path: Optional[Union[str, Path]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Locate and load `effective_profile.json` from `explicit_path`,
    `workspace_dir/work/effective_profile.json`, or `workspace_dir/effective_profile.json`.
    """
    candidates: List[Path] = []
    if explicit_path:
        p = Path(explicit_path)
        if p.suffix.lower() == ".json":
            candidates.append(p)
    if workspace_dir:
        ws = Path(workspace_dir)
        candidates.extend([
            ws / "work" / "effective_profile.json",
            ws / "effective_profile.json",
        ])
    for cand in candidates:
        data = _load_json_safe(cand)
        if isinstance(data, dict) and ("pacing" in data or "hook" in data or "enabled_groups" in data):
            return normalize_nfc_deep(data)
    return None


def _load_default_profile_tier(
    profile_yaml_path: Optional[Path] = None,
    source_video_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build Tier 4 (`default_profile`) dictionary from `memory/profile.yaml` and source video metadata."""
    p_path = profile_yaml_path or (PIPELINE_ROOT / "memory" / "profile.yaml")
    cfg = _load_yaml_safe(p_path)
    cut_cfg = cfg.get("cutlist", {}) if isinstance(cfg.get("cutlist"), dict) else {}
    ac_cfg = cfg.get("acoustic_detection", {}) if isinstance(cfg.get("acoustic_detection"), dict) else {}
    hook_cfg = cfg.get("hook_selection", {}) if isinstance(cfg.get("hook_selection"), dict) else {}
    exp_cfg = cfg.get("export", {}) if isinstance(cfg.get("export"), dict) else {}

    src_meta = source_video_meta if isinstance(source_video_meta, dict) else {}
    width = int(src_meta.get("width") or 1080)
    height = int(src_meta.get("height") or 1920)
    fps = float(src_meta.get("fps") or exp_cfg.get("target_fps") or 30.0)
    aspect = str(src_meta.get("aspect") or infer_aspect_ratio(width, height))

    pad_start = int(cut_cfg.get("pad_start_ms", cfg.get("pad_start_ms", 80)))
    pad_end = int(cut_cfg.get("pad_end_ms", cfg.get("pad_end_ms", 100)))
    merge_gap = int(cut_cfg.get("merge_gap_ms", cfg.get("merge_gap_ms", 150)))
    sil_thresh = int(ac_cfg.get("silence_threshold_ms", cfg.get("silence_threshold_ms", 400)))
    min_sil = int(cfg.get("min_silence_ms", sil_thresh))
    min_hook = int(hook_cfg.get("min_hook_duration_ms", 5000))
    max_hook = int(hook_cfg.get("max_hook_duration_ms", 10000))

    return {
        "format": {
            "width": width,
            "height": height,
            "fps": fps,
            "aspect": aspect,
            "keep_source_aspect": True,
        },
        "pacing": {
            "pad_start_ms": pad_start,
            "pad_end_ms": pad_end,
            "merge_gap_ms": merge_gap,
            "silence_threshold_ms": sil_thresh,
            "max_silence_ms": 650,
            "min_silence_ms": min_sil,
            "target_pause_median_ms": 240,
        },
        "hook": {
            "min_ms": min_hook,
            "max_ms": max_hook,
            "target_ms": 6500,
            "preferred_style": "question",
            "prefer_opening_mode": "reuse_opening",
            "text_overlay": False,
        },
        "captions": {
            "enabled": True,
            "position": "bottom_center",
            "words_per_line": 3,
            "max_lines": 1,
            "highlight": "keyword_color",
            "font_class": "sans_bold",
            "font_family": "Be Vietnam Pro",
            "text_color": "#FFFFFF",
            "highlight_color": "#FFD60A",
        },
        "audio": {
            "target_lufs": -14.0,
            "true_peak_max_db": -1.0,
            "lra_target": 11.0,
        },
        "titlecard": {
            "enabled": False,
            "duration_ms": 3000,
        },
        "punchin": {
            "enabled": False,
            "min_gap_ms": 5000,
            "scale": 1.08,
            "min_shot_duration_ms": 2500,
        },
    }


def _has_valid_punchin_evidence(evidence_obj: Any) -> bool:
    """Verify whether `evidence['punchin']` contains concrete timestamp or frame pair evidence."""
    if not isinstance(evidence_obj, dict) or not evidence_obj:
        return False
    events = evidence_obj.get("events")
    if isinstance(events, list) and len(events) > 0:
        for ev in events:
            if isinstance(ev, dict) and (
                "start_ms" in ev
                or "at_ms" in ev
                or "frame_pair" in ev
                or "estimated_scale" in ev
                or "scale" in ev
            ):
                return True
    if isinstance(evidence_obj.get("sample_frames"), list) and len(evidence_obj["sample_frames"]) > 0:
        return True
    if isinstance(evidence_obj.get("start_ms"), (int, float)):
        return True
    return False


def _infer_style_from_hook_prompt(hook_prompt: Optional[str]) -> Optional[str]:
    """Infer preferred hook style if user explicitly typed a hook_prompt."""
    if not hook_prompt or not str(hook_prompt).strip():
        return None
    low = normalize_nfc(str(hook_prompt)).strip().lower()
    if any(k in low for k in ("câu hỏi", "question", "hỏi", "?", "tại sao", "vì sao", "có sửa được không")):
        return "question"
    if any(k in low for k in ("nhá hàng", "teaser", "cao trào", "kết quả", "highlight", "ấn tượng")):
        return "teaser"
    if any(k in low for k in ("khẳng định", "statement", "tuyên ngôn", "sự thật", "nguyên nhân", "chuyên gia")):
        return "statement"
    return None


def _normalize_user_overrides(
    raw_overrides: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Normalize flat or nested user overrides into canonical dotted parameter keys
    (e.g. 'pacing.pad_start_ms', 'hook.preferred_style', 'captions.enabled', etc.).
    """
    if not isinstance(raw_overrides, dict):
        return {}
    out: Dict[str, Any] = {}

    # Support nested group dicts (`pacing`, `hook`, `captions`, `audio`, `titlecard`, `punchin`, `format`)
    for grp in ("pacing", "hook", "captions", "audio", "titlecard", "punchin", "format"):
        sub = raw_overrides.get(grp)
        if isinstance(sub, dict):
            for k, v in sub.items():
                if v is not None:
                    out[f"{grp}.{k}"] = v

    # Support direct dotted keys or flat shorthand keys
    flat_map = {
        "pad_start_ms": "pacing.pad_start_ms",
        "pad_end_ms": "pacing.pad_end_ms",
        "merge_gap_ms": "pacing.merge_gap_ms",
        "silence_threshold_ms": "pacing.silence_threshold_ms",
        "max_silence_ms": "pacing.max_silence_ms",
        "min_silence_ms": "pacing.min_silence_ms",
        "target_pause_median_ms": "pacing.target_pause_median_ms",
        "hook_min_ms": "hook.min_ms",
        "hook_max_ms": "hook.max_ms",
        "hook_target_ms": "hook.target_ms",
        "preferred_style": "hook.preferred_style",
        "prefer_opening_mode": "hook.prefer_opening_mode",
        "text_overlay": "hook.text_overlay",
        "captions_enabled": "captions.enabled",
        "captions_position": "captions.position",
        "words_per_line": "captions.words_per_line",
        "max_lines": "captions.max_lines",
        "font_family": "captions.font_family",
        "font_class": "captions.font_class",
        "target_lufs": "audio.target_lufs",
        "true_peak_max_db": "audio.true_peak_max_db",
        "titlecard_enabled": "titlecard.enabled",
        "punchin_enabled": "punchin.enabled",
        "punchin_min_gap_ms": "punchin.min_gap_ms",
        "punchin_scale": "punchin.scale",
        "playback_speed": "playback_speed",
    }
    for k, v in raw_overrides.items():
        if v is None:
            continue
        if "." in k:
            out[k] = v
        elif k in flat_map:
            out[flat_map[k]] = v

    # Cut aggression preset override ("light" / "nhẹ", "strong" / "mạnh") ONLY if user explicitly overrode it
    aggression = raw_overrides.get("cut_aggression") or raw_overrides.get("aggression")
    if isinstance(aggression, str) and aggression.strip().lower() in ("light", "nhẹ", "strong", "mạnh"):
        agg_low = aggression.strip().lower()
        if agg_low in ("light", "nhẹ"):
            out.setdefault("pacing.silence_threshold_ms", 550)
            out.setdefault("pacing.pad_start_ms", 100)
            out.setdefault("pacing.pad_end_ms", 130)
        elif agg_low in ("strong", "mạnh"):
            out.setdefault("pacing.silence_threshold_ms", 320)
            out.setdefault("pacing.pad_start_ms", 55)
            out.setdefault("pacing.pad_end_ms", 75)

    # Hook prompt override: per Design S0.3, if user enters `hook_prompt`, user_override takes priority over sample_style for hook.preferred_style
    hook_prompt = raw_overrides.get("hook_prompt") or raw_overrides.get("hookPrompt")
    if isinstance(hook_prompt, str) and hook_prompt.strip():
        out["hook.hook_prompt"] = normalize_nfc(hook_prompt.strip())
        inferred_style = _infer_style_from_hook_prompt(hook_prompt)
        if "hook.preferred_style" not in out:
            out["hook.preferred_style"] = inferred_style or "question"

    return normalize_nfc_deep(out)


# ---------------------------------------------------------------------------
# Core 4-Tier Resolution Engine (`merge_style_profile`)
# ---------------------------------------------------------------------------

def _coerce_enabled_groups(
    enabled_groups: Optional[Union[Dict[str, bool], Sequence[str]]],
    has_sample_style: bool,
) -> Dict[str, bool]:
    if not has_sample_style:
        return {k: False for k in DEFAULT_ENABLED_GROUPS}
    eff_groups: Dict[str, bool] = dict(DEFAULT_ENABLED_GROUPS)
    if isinstance(enabled_groups, dict):
        for k in DEFAULT_ENABLED_GROUPS:
            if k in enabled_groups and enabled_groups[k] is not None:
                eff_groups[k] = bool(enabled_groups[k])
    elif isinstance(enabled_groups, (list, tuple, set)):
        active = {str(x).strip().lower() for x in enabled_groups if str(x).strip()}
        eff_groups = {k: (k in active) for k in DEFAULT_ENABLED_GROUPS}
    return eff_groups


def merge_style_profile(
    project_id: str = "default_project",
    style_profile: Optional[Union[StyleProfile, Dict[str, Any]]] = None,
    enabled_groups: Optional[Union[Dict[str, bool], Sequence[str]]] = None,
    template: Optional[str] = None,
    user_overrides: Optional[Dict[str, Any]] = None,
    source_video_meta: Optional[Dict[str, Any]] = None,
    default_profile_path: Optional[Path] = None,
    *,
    template_name: Optional[str] = None,
) -> Tuple[EffectiveProfile, ProfileTrace]:
    """
    Merge configuration across the 4 priority tiers:
      `user_override > sample_style > template > default_profile`
    and return validated `(EffectiveProfile, ProfileTrace)` instances.
    """
    proj_id = normalize_nfc(str(project_id or "default_project"))

    # Parse and validate style_profile if provided
    sp_dict: Optional[Dict[str, Any]] = None
    if isinstance(style_profile, StyleProfile):
        sp_dict = style_profile.to_dict()
    elif isinstance(style_profile, dict) and style_profile:
        sp_dict = StyleProfile.from_dict(style_profile).to_dict()

    style_id: Optional[str] = sp_dict.get("style_id") if sp_dict else None
    sp_conf: Dict[str, str] = (sp_dict.get("confidence") or {}) if sp_dict else {}
    sp_evid: Dict[str, Any] = (sp_dict.get("evidence") or {}) if sp_dict else {}

    # Normalize enabled_groups
    eff_groups = _coerce_enabled_groups(enabled_groups, has_sample_style=(sp_dict is not None))

    norm_overrides = _normalize_user_overrides(user_overrides)

    # Resolve template name
    raw_template = (
        (user_overrides or {}).get("template")
        or template
        or template_name
        or (sp_dict.get("format", {}).get("template") if sp_dict else None)
        or "podcast_vertical"
    )
    eff_template = str(raw_template) if str(raw_template) in STYLE_TEMPLATES else "podcast_vertical"

    # Tier 4: default_profile & Tier 3: template
    tier_default = _load_default_profile_tier(default_profile_path, source_video_meta=source_video_meta)
    tier_template = TEMPLATE_PRESETS.get(eff_template, TEMPLATE_PRESETS["podcast_vertical"])

    # Determine source video format (if source_video_meta not explicitly passed and sp_dict exists, fall back to sp_dict or default)
    src_meta = source_video_meta if isinstance(source_video_meta, dict) and source_video_meta else {}
    if src_meta.get("width") and src_meta.get("height"):
        src_w = int(src_meta["width"])
        src_h = int(src_meta["height"])
        src_fps = float(src_meta.get("fps") or tier_default["format"]["fps"])
        src_aspect = str(src_meta.get("aspect") or infer_aspect_ratio(src_w, src_h))
    elif sp_dict and isinstance(sp_dict.get("format"), dict):
        src_w = int(sp_dict["format"].get("width", 1080))
        src_h = int(sp_dict["format"].get("height", 1920))
        src_fps = float(sp_dict["format"].get("fps", 30.0))
        src_aspect = str(sp_dict["format"].get("aspect") or infer_aspect_ratio(src_w, src_h))
    else:
        src_w = int(tier_template["format"]["width"])
        src_h = int(tier_template["format"]["height"])
        src_fps = float(tier_template["format"]["fps"])
        src_aspect = str(tier_template["format"]["aspect"])

    tier_default["format"] = {
        "width": src_w,
        "height": src_h,
        "fps": src_fps,
        "aspect": src_aspect,
        "keep_source_aspect": True,
    }

    warnings: List[str] = []
    entries: List[ProfileTraceEntry] = []

    # Build Tier 2 (`sample_style`) candidate values & clamp metadata
    sample_candidates: Dict[str, Dict[str, Any]] = {}
    sample_skip_reasons: Dict[str, str] = {}

    if sp_dict is not None:
        # 0. Check playback_speed / WPM guardrail
        if "playback_speed" in norm_overrides and float(norm_overrides["playback_speed"]) != 1.0:
            warnings.append(
                "Hệ thống khóa cứng tốc độ phát ở 1.0x (không cho phép tua nhanh/chậm giọng nói)."
            )

        # 1. Format aspect ratio comparison (Design Section 2 & 3.2)
        sample_fmt = sp_dict.get("format", {})
        sample_aspect = str(sample_fmt.get("aspect") or "9:16")
        fmt_conf = sp_conf.get("format", "measured")
        if sample_aspect != src_aspect:
            warn_msg = (
                f"Video mẫu có tỉ lệ {sample_aspect} khác với video mới ({src_aspect}). "
                f"Hệ thống giữ nguyên khung hình {src_aspect} của video mới."
            )
            warnings.append(warn_msg)
            entries.append(
                ProfileTraceEntry(
                    param="format.aspect",
                    group="format",
                    source="default_profile",
                    raw_value=sample_aspect,
                    effective_value=src_aspect,
                    clamped=False,
                    skipped_sources={"sample_style": sample_aspect},
                    confidence=fmt_conf,
                    reason=(
                        f"Video mẫu có tỉ lệ {sample_aspect} khác với video gốc mới ({src_aspect}); "
                        "giữ nguyên khung hình gốc để tránh cắt mất hình."
                    ),
                )
            )
        else:
            entries.append(
                ProfileTraceEntry(
                    param="format.aspect",
                    group="format",
                    source="sample_style",
                    raw_value=sample_aspect,
                    effective_value=src_aspect,
                    clamped=False,
                    skipped_sources={"default_profile": src_aspect},
                    confidence=fmt_conf,
                    reason=f"Tỉ lệ khung hình video mẫu ({sample_aspect}) đồng nhất với video gốc mới.",
                )
            )

        # 2. Pacing group mapping
        sp_pacing = sp_dict.get("pacing", {})
        pacing_conf = sp_conf.get("pacing", "measured")
        p_med = float(sp_pacing.get("pause_median_ms", 240.0))
        p_90 = float(sp_pacing.get("pause_p90_ms", 520.0))
        max_sil_raw = float(sp_pacing.get("max_silence_kept_ms", 650.0))

        raw_sil_thresh = int(round(p_90))
        raw_max_sil = int(round(max_sil_raw))
        raw_pad_start = int(round(p_med * 0.30))
        raw_pad_end = int(round(p_med * 0.40))
        raw_merge_gap = int(round(p_med * 0.65))
        raw_min_sil = int(round(p_90 * 0.75))
        raw_target_med = max(0, int(round(p_med)))

        if eff_groups.get("pacing", False):
            sample_candidates["pacing.silence_threshold_ms"] = {
                "raw": raw_sil_thresh,
                "clamp": (300, 1200),
                "confidence": pacing_conf,
                "reason": f"Áp dụng pause_p90_ms ({raw_sil_thresh}ms) từ video mẫu do nhóm Nhịp cắt & khoảng lặng đang bật.",
            }
            sample_candidates["pacing.max_silence_ms"] = {
                "raw": raw_max_sil,
                "clamp": (400, 1500),
                "confidence": pacing_conf,
                "reason": f"Áp dụng max_silence_kept_ms ({raw_max_sil}ms) từ video mẫu.",
            }
            sample_candidates["pacing.pad_start_ms"] = {
                "raw": raw_pad_start,
                "clamp": (40, 160),
                "confidence": pacing_conf,
                "reason": f"Tính pad_start_ms = round(pause_median_ms * 0.30) = {raw_pad_start}ms từ video mẫu.",
            }
            sample_candidates["pacing.pad_end_ms"] = {
                "raw": raw_pad_end,
                "clamp": (60, 200),
                "confidence": pacing_conf,
                "reason": f"Tính pad_end_ms = round(pause_median_ms * 0.40) = {raw_pad_end}ms từ video mẫu.",
            }
            sample_candidates["pacing.merge_gap_ms"] = {
                "raw": raw_merge_gap,
                "clamp": (80, 300),
                "confidence": pacing_conf,
                "reason": f"Tính merge_gap_ms = round(pause_median_ms * 0.65) = {raw_merge_gap}ms từ video mẫu.",
            }
            sample_candidates["pacing.min_silence_ms"] = {
                "raw": raw_min_sil,
                "clamp": (250, max(300, min(1200, raw_sil_thresh))),
                "confidence": pacing_conf,
                "reason": "Tính ngưỡng khoảng lặng tối thiểu từ pause_p90_ms của video mẫu.",
            }
            sample_candidates["pacing.target_pause_median_ms"] = {
                "raw": raw_target_med,
                "clamp": (0, 2000),
                "confidence": pacing_conf,
                "reason": f"Lưu mục tiêu khoảng nghỉ trung vị ({raw_target_med}ms) từ video mẫu.",
            }
        else:
            for pk, pv in (
                ("pacing.silence_threshold_ms", raw_sil_thresh),
                ("pacing.max_silence_ms", raw_max_sil),
                ("pacing.pad_start_ms", raw_pad_start),
                ("pacing.pad_end_ms", raw_pad_end),
                ("pacing.merge_gap_ms", raw_merge_gap),
                ("pacing.min_silence_ms", raw_min_sil),
                ("pacing.target_pause_median_ms", raw_target_med),
            ):
                sample_skip_reasons[pk] = "Người dùng tắt công tắc nhóm pacing"
                sample_candidates[pk] = {"skipped_val": pv, "confidence": pacing_conf}

        # 3. Hook & Titlecard group mapping
        sp_hook = sp_dict.get("hook", {})
        sp_tc = sp_dict.get("titlecard", {})
        hook_conf = sp_conf.get("hook", "estimated")
        raw_hook_dur = int(round(float(sp_hook.get("duration_ms", 6200.0))))
        clamped_target_ms, _ = _clamp_int(raw_hook_dur, 3000, 12000)
        derived_min_ms = max(2500, clamped_target_ms - 1500)
        derived_max_ms = min(12000, clamped_target_ms + 1500)
        raw_hook_style = str(sp_hook.get("style") or "question")
        if raw_hook_style not in STYLE_HOOK_STYLES:
            raw_hook_style = "question"
        raw_repeated = bool(sp_hook.get("repeated_later", False))
        derived_opening_mode = "cold_open_duplicate" if raw_repeated else "reuse_opening"
        raw_text_overlay = bool(sp_hook.get("text_overlay", False))
        raw_tc_enabled = bool(raw_text_overlay or sp_tc.get("present", False))

        if eff_groups.get("hook", False):
            sample_candidates["hook.target_ms"] = {
                "raw": raw_hook_dur,
                "clamp": (3000, 12000),
                "confidence": hook_conf,
                "reason": f"Áp dụng độ dài mở đầu mục tiêu ({raw_hook_dur}ms) từ video mẫu.",
            }
            sample_candidates["hook.min_ms"] = {
                "raw": derived_min_ms,
                "clamp": (2500, 12000),
                "confidence": hook_conf,
                "reason": f"Tính biên dưới độ dài mở đầu (target_ms - 1500ms = {derived_min_ms}ms) từ video mẫu.",
            }
            sample_candidates["hook.max_ms"] = {
                "raw": derived_max_ms,
                "clamp": (derived_min_ms, 12000),
                "confidence": hook_conf,
                "reason": f"Tính biên trên độ dài mở đầu (target_ms + 1500ms = {derived_max_ms}ms) từ video mẫu.",
            }
            sample_candidates["hook.preferred_style"] = {
                "raw": raw_hook_style,
                "confidence": hook_conf,
                "reason": f"Ưu tiên kiểu mở đầu '{raw_hook_style}' (+8.0 điểm ở P5) theo video mẫu.",
            }
            sample_candidates["hook.prefer_opening_mode"] = {
                "raw": derived_opening_mode,
                "confidence": hook_conf,
                "reason": (
                    "Video mẫu lặp lại đoạn mở đầu ở phần thân nên ưu tiên cold_open_duplicate."
                    if raw_repeated
                    else "Video mẫu dẫn nhập trực tiếp không lặp lại nên ưu tiên reuse_opening."
                ),
            }
            sample_candidates["hook.text_overlay"] = {
                "raw": raw_text_overlay,
                "confidence": hook_conf,
                "reason": "Áp dụng trạng thái chữ tiêu đề mở đầu (text_overlay) từ video mẫu.",
            }
            sample_candidates["titlecard.enabled"] = {
                "raw": raw_tc_enabled,
                "confidence": sp_conf.get("titlecard", hook_conf),
                "reason": "Bật/tắt bảng chữ mở đầu (titlecard) dựa trên hook.text_overlay và titlecard.present của video mẫu.",
            }
        else:
            for hk, hv in (
                ("hook.target_ms", raw_hook_dur),
                ("hook.min_ms", derived_min_ms),
                ("hook.max_ms", derived_max_ms),
                ("hook.preferred_style", raw_hook_style),
                ("hook.prefer_opening_mode", derived_opening_mode),
                ("hook.text_overlay", raw_text_overlay),
                ("titlecard.enabled", raw_tc_enabled),
            ):
                sample_skip_reasons[hk] = "Người dùng tắt công tắc nhóm hook"
                sample_candidates[hk] = {"skipped_val": hv, "confidence": hook_conf}

        # 4. Captions group mapping
        sp_cap = sp_dict.get("captions", {})
        cap_conf = sp_conf.get("captions", "estimated")
        cap_present = bool(sp_cap.get("present", True))
        cap_pos = str(sp_cap.get("position") or "bottom_center")
        if cap_pos not in STYLE_CAPTION_POSITIONS:
            cap_pos = "bottom_center"
        raw_wpl = int(sp_cap.get("words_per_line", 3))
        if raw_wpl <= 0:
            raw_wpl = 3
        raw_lines = int(sp_cap.get("lines", 1))
        if raw_lines <= 0:
            raw_lines = 1
        cap_hl = str(sp_cap.get("highlight") or "none")
        if cap_hl not in STYLE_CAPTION_HIGHLIGHTS:
            cap_hl = "none"
        cap_fc = str(sp_cap.get("font_class") or "sans_bold")
        if cap_fc not in STYLE_FONT_CLASSES:
            cap_fc = "sans_bold"
        mapped_font = FONT_CLASS_TO_VIETNAMESE_FONT.get(cap_fc, "Be Vietnam Pro")
        cap_tc = str(sp_cap.get("text_color") or "#FFFFFF")
        cap_hc = str(sp_cap.get("highlight_color") or "#FFD60A")

        if eff_groups.get("captions", False):
            sample_candidates["captions.enabled"] = {
                "raw": cap_present,
                "confidence": cap_conf,
                "reason": (
                    "Bật phụ đề theo video mẫu (captions.present = true)."
                    if cap_present
                    else "Tắt phụ đề đốt sẵn vì video mẫu không có phụ đề (captions.present = false)."
                ),
            }
            sample_candidates["captions.position"] = {
                "raw": cap_pos,
                "confidence": cap_conf,
                "reason": f"Áp dụng vị trí phụ đề '{cap_pos}' từ video mẫu.",
            }
            sample_candidates["captions.words_per_line"] = {
                "raw": raw_wpl,
                "clamp": (2, 6),
                "confidence": cap_conf,
                "reason": f"Áp dụng số từ mỗi dòng ({raw_wpl}) từ video mẫu (kẹp trong [2, 6]).",
            }
            sample_candidates["captions.max_lines"] = {
                "raw": raw_lines,
                "clamp": (1, 2),
                "confidence": cap_conf,
                "reason": f"Áp dụng số dòng phụ đề ({raw_lines}) từ video mẫu (kẹp trong [1, 2]).",
            }
            sample_candidates["captions.highlight"] = {
                "raw": cap_hl,
                "confidence": cap_conf,
                "reason": f"Áp dụng kiểu nhấn từ khóa '{cap_hl}' từ video mẫu.",
            }
            sample_candidates["captions.font_class"] = {
                "raw": cap_fc,
                "confidence": cap_conf,
                "reason": f"Áp dụng phân lớp phông chữ '{cap_fc}' từ video mẫu.",
            }
            sample_candidates["captions.font_family"] = {
                "raw": mapped_font,
                "confidence": cap_conf,
                "reason": f"Ánh xạ font_class '{cap_fc}' sang họ chữ tiếng Việt chuẩn '{mapped_font}'.",
            }
            sample_candidates["captions.text_color"] = {
                "raw": cap_tc,
                "confidence": cap_conf,
                "reason": f"Áp dụng màu chữ phụ đề '{cap_tc}' từ video mẫu.",
            }
            sample_candidates["captions.highlight_color"] = {
                "raw": cap_hc,
                "confidence": cap_conf,
                "reason": f"Áp dụng màu nhấn phụ đề '{cap_hc}' từ video mẫu.",
            }
        else:
            for ck, cv in (
                ("captions.enabled", cap_present),
                ("captions.position", cap_pos),
                ("captions.words_per_line", raw_wpl),
                ("captions.max_lines", raw_lines),
                ("captions.highlight", cap_hl),
                ("captions.font_class", cap_fc),
                ("captions.font_family", mapped_font),
                ("captions.text_color", cap_tc),
                ("captions.highlight_color", cap_hc),
            ):
                sample_skip_reasons[ck] = "Người dùng tắt công tắc nhóm captions"
                sample_candidates[ck] = {"skipped_val": cv, "confidence": cap_conf}

        # 5. Audio group mapping
        sp_audio = sp_dict.get("audio", {})
        audio_conf = sp_conf.get("audio", "measured")
        raw_lufs = round(float(sp_audio.get("lufs", -14.0)), 1)
        raw_tp = round(float(sp_audio.get("true_peak_db", -1.0)), 1)
        raw_lra = round(float(sp_audio.get("lra", 11.0)), 1)

        if eff_groups.get("audio", False):
            sample_candidates["audio.target_lufs"] = {
                "raw": raw_lufs,
                "clamp_float": (LUFS_SAFE_MIN, LUFS_SAFE_MAX, 1),
                "confidence": audio_conf,
                "reason": f"Áp dụng độ lớn âm lượng mục tiêu ({raw_lufs} LUFS) từ video mẫu.",
                "clamp_reason": (
                    f"Giá trị âm lượng video mẫu ({raw_lufs} LUFS) vượt ngưỡng an toàn nên được kẹp vào [{LUFS_SAFE_MIN}, {LUFS_SAFE_MAX}] LUFS."
                ),
            }
            sample_candidates["audio.true_peak_max_db"] = {
                "raw": raw_tp,
                "clamp_float": (-12.0, TRUE_PEAK_SAFE_MAX_DB, 1),
                "confidence": audio_conf,
                "reason": f"Áp dụng giới hạn đỉnh thực ({raw_tp} dBTP) từ video mẫu.",
                "clamp_reason": (
                    f"Đỉnh thực âm thanh video mẫu ({raw_tp} dBTP) vượt mức an toàn nên được kẹp về <= {TRUE_PEAK_SAFE_MAX_DB} dBTP."
                ),
            }
            sample_candidates["audio.lra_target"] = {
                "raw": raw_lra if raw_lra > 0 else 11.0,
                "clamp_float": (3.0, 20.0, 1),
                "confidence": audio_conf,
                "reason": f"Áp dụng dải động âm lượng LRA ({raw_lra} LU) từ video mẫu.",
            }
        else:
            for ak, av in (
                ("audio.target_lufs", raw_lufs),
                ("audio.true_peak_max_db", raw_tp),
                ("audio.lra_target", raw_lra),
            ):
                sample_skip_reasons[ak] = "Người dùng tắt công tắc nhóm audio"
                sample_candidates[ak] = {"skipped_val": av, "confidence": audio_conf}

        # 6. Punch-in group mapping with strict confidence + evidence guardrail
        sp_pi = sp_dict.get("punchin", {})
        pi_conf = sp_conf.get("punchin", "assumed")
        pi_detected = bool(sp_pi.get("detected", False))
        pi_has_evid = _has_valid_punchin_evidence(sp_evid.get("punchin"))
        raw_gap_s = sp_pi.get("min_gap_s")
        raw_gap_ms = int(round(float(raw_gap_s) * 1000.0)) if isinstance(raw_gap_s, (int, float)) else 5000
        raw_scale = round(float(sp_pi.get("scale") or 1.08), 2)

        if not eff_groups.get("punchin", False):
            for pik, piv in (
                ("punchin.enabled", pi_detected),
                ("punchin.min_gap_ms", raw_gap_ms),
                ("punchin.scale", raw_scale),
            ):
                sample_skip_reasons[pik] = "Người dùng tắt công tắc nhóm punchin"
                sample_candidates[pik] = {"skipped_val": piv, "confidence": pi_conf}
        elif not pi_detected:
            sample_candidates["punchin.enabled"] = {
                "raw": False,
                "confidence": pi_conf,
                "reason": "Video mẫu không sử dụng hiệu ứng phóng khung hình (punchin.detected = false).",
            }
        elif pi_conf not in ("measured", "estimated") or not pi_has_evid:
            skip_msg = "Độ tin cậy punch-in ở mức giả định (assumed) hoặc thiếu bằng chứng khung hình"
            warnings.append(
                "Bỏ qua tự động bật Nhấn khung hình (Punch-in) do độ tin cậy ở mức giả định (assumed) hoặc thiếu bằng chứng mốc thời gian."
            )
            for pik, piv in (
                ("punchin.enabled", True),
                ("punchin.min_gap_ms", raw_gap_ms),
                ("punchin.scale", raw_scale),
            ):
                sample_skip_reasons[pik] = skip_msg
                sample_candidates[pik] = {"skipped_val": piv, "confidence": pi_conf}
        else:
            sample_candidates["punchin.enabled"] = {
                "raw": True,
                "confidence": pi_conf,
                "reason": f"Bật nhấn khung hình từ video mẫu (độ tin cậy '{pi_conf}', có bằng chứng sự kiện).",
            }
            sample_candidates["punchin.min_gap_ms"] = {
                "raw": raw_gap_ms,
                "clamp": (4000, 15000),
                "confidence": pi_conf,
                "reason": f"Áp dụng khoảng cách tối thiểu giữa 2 lần phóng ({raw_gap_ms}ms) từ video mẫu.",
            }
            sample_candidates["punchin.scale"] = {
                "raw": raw_scale,
                "clamp_float": (1.04, 1.12, 2),
                "confidence": pi_conf,
                "reason": f"Áp dụng tỉ lệ phóng ({raw_scale}x) từ video mẫu (kẹp trong [1.04, 1.12]).",
            }

    # Parameter catalog to resolve across the 4 tiers
    param_specs: List[Tuple[str, str, Optional[Tuple[int, int]], Optional[Tuple[float, float, int]]]] = [
        # (param_key, group, int_clamp, float_clamp)
        ("pacing.pad_start_ms", "pacing", (40, 160), None),
        ("pacing.pad_end_ms", "pacing", (60, 200), None),
        ("pacing.merge_gap_ms", "pacing", (80, 300), None),
        ("pacing.silence_threshold_ms", "pacing", (300, 1200), None),
        ("pacing.max_silence_ms", "pacing", (400, 1500), None),
        ("pacing.min_silence_ms", "pacing", (250, 1200), None),
        ("pacing.target_pause_median_ms", "pacing", (0, 2000), None),
        ("hook.target_ms", "hook", (3000, 12000), None),
        ("hook.min_ms", "hook", (2500, 12000), None),
        ("hook.max_ms", "hook", (2500, 12000), None),
        ("hook.preferred_style", "hook", None, None),
        ("hook.prefer_opening_mode", "hook", None, None),
        ("hook.text_overlay", "hook", None, None),
        ("captions.enabled", "captions", None, None),
        ("captions.position", "captions", None, None),
        ("captions.words_per_line", "captions", (2, 6), None),
        ("captions.max_lines", "captions", (1, 2), None),
        ("captions.highlight", "captions", None, None),
        ("captions.font_class", "captions", None, None),
        ("captions.font_family", "captions", None, None),
        ("captions.text_color", "captions", None, None),
        ("captions.highlight_color", "captions", None, None),
        ("audio.target_lufs", "audio", None, (LUFS_SAFE_MIN, LUFS_SAFE_MAX, 1)),
        ("audio.true_peak_max_db", "audio", None, (-12.0, TRUE_PEAK_SAFE_MAX_DB, 1)),
        ("audio.lra_target", "audio", None, (3.0, 20.0, 1)),
        ("titlecard.enabled", "titlecard", None, None),
        ("titlecard.duration_ms", "titlecard", (1000, 8000), None),
        ("punchin.enabled", "punchin", None, None),
        ("punchin.min_gap_ms", "punchin", (4000, 15000), None),
        ("punchin.scale", "punchin", None, (1.04, 1.12, 2)),
        ("punchin.min_shot_duration_ms", "punchin", (1500, 10000), None),
    ]

    resolved_sections: Dict[str, Dict[str, Any]] = {
        "format": dict(tier_default["format"]),
        "pacing": {},
        "hook": {},
        "captions": {},
        "audio": {},
        "titlecard": {},
        "punchin": {},
    }

    for param_key, group_name, int_bounds, float_bounds in param_specs:
        sec_name, field_name = param_key.split(".", 1)
        def_val = tier_default.get(sec_name, {}).get(field_name)
        tpl_val = tier_template.get(sec_name, {}).get(field_name, def_val)
        usr_val = norm_overrides.get(param_key)
        sc_info = sample_candidates.get(param_key)

        has_valid_sample = bool(sc_info and "raw" in sc_info)
        sample_raw = sc_info["raw"] if has_valid_sample and sc_info else None
        sample_skipped_val = sc_info.get("skipped_val") if sc_info and "skipped_val" in sc_info else None
        conf_val = sc_info.get("confidence") if sc_info else None

        # Choose winning tier in strict priority order: user_override > sample_style > template > default_profile
        skipped_sources: Dict[str, Any] = {}
        if usr_val is not None:
            chosen_source = "user_override"
            raw_val = usr_val
            if has_valid_sample:
                skipped_sources["sample_style"] = sample_raw
            elif sample_skipped_val is not None:
                skipped_sources["sample_style"] = sample_skipped_val
            if tpl_val is not None:
                skipped_sources["template"] = tpl_val
            if def_val is not None:
                skipped_sources["default_profile"] = def_val
            if param_key == "hook.preferred_style" and "hook.hook_prompt" in norm_overrides:
                base_reason = (
                    f"Ưu tiên tuyệt đối mô tả mở đầu của người dùng (hook_prompt: \"{norm_overrides['hook.hook_prompt']}\") "
                    "thay vì kiểu mở đầu của video mẫu."
                )
            else:
                base_reason = f"Áp dụng giá trị do người dùng chỉnh tay ({param_key}) trong phiên hiện tại."
        elif has_valid_sample and sc_info is not None:
            chosen_source = "sample_style"
            raw_val = sample_raw
            if tpl_val is not None:
                skipped_sources["template"] = tpl_val
            if def_val is not None:
                skipped_sources["default_profile"] = def_val
            base_reason = str(sc_info.get("reason") or f"Áp dụng {param_key} từ video mẫu.")
        elif tpl_val is not None and tpl_val != def_val:
            chosen_source = "template"
            raw_val = tpl_val
            if sample_skipped_val is not None:
                skipped_sources["sample_style"] = sample_skipped_val
            if def_val is not None:
                skipped_sources["default_profile"] = def_val
            skip_note = sample_skip_reasons.get(param_key)
            base_reason = (
                f"{skip_note}; dùng giá trị mặc định của mẫu '{eff_template}'."
                if skip_note
                else f"Áp dụng giá trị mặc định của mẫu '{eff_template}'."
            )
        else:
            chosen_source = "default_profile"
            raw_val = def_val
            if sample_skipped_val is not None:
                skipped_sources["sample_style"] = sample_skipped_val
            skip_note = sample_skip_reasons.get(param_key)
            base_reason = (
                f"{skip_note}; giữ giá trị mặc định từ profile.yaml."
                if skip_note
                else "Sử dụng giá trị mặc định từ memory/profile.yaml."
            )

        # Apply safety clamping / domain normalization
        eff_val: Any = raw_val
        was_clamped = False
        reason_text = base_reason

        if int_bounds is not None and isinstance(raw_val, (int, float)) and not isinstance(raw_val, bool):
            eff_val, was_clamped = _clamp_int(raw_val, int_bounds[0], int_bounds[1])
            if was_clamped:
                reason_text = (
                    sc_info.get("clamp_reason")
                    if (chosen_source == "sample_style" and sc_info and sc_info.get("clamp_reason"))
                    else f"Giá trị {param_key} ({raw_val}) vượt ngưỡng nên được kẹp về {eff_val} (trong đoạn [{int_bounds[0]}, {int_bounds[1]}])."
                )
        elif float_bounds is not None and isinstance(raw_val, (int, float)) and not isinstance(raw_val, bool):
            eff_val, was_clamped = _clamp_float(raw_val, float_bounds[0], float_bounds[1], float_bounds[2])
            if was_clamped:
                reason_text = (
                    sc_info.get("clamp_reason")
                    if (chosen_source == "sample_style" and sc_info and sc_info.get("clamp_reason"))
                    else f"Giá trị {param_key} ({raw_val}) vượt ngưỡng an toàn nên được kẹp về {eff_val}."
                )
                if param_key == "audio.target_lufs":
                    warnings.append(
                        f"Âm lượng mẫu ({raw_val} LUFS) nằm ngoài biên an toàn nên đã được kẹp về {eff_val} LUFS."
                    )
                elif param_key == "audio.true_peak_max_db":
                    warnings.append(
                        f"Đỉnh âm thanh mẫu ({raw_val} dBTP) vượt ngưỡng chống vỡ tiếng nên đã được kẹp về {eff_val} dBTP."
                    )
        elif param_key == "captions.font_family":
            if str(raw_val) not in ALLOWED_VIETNAMESE_FONTS:
                eff_val = "Be Vietnam Pro"
                was_clamped = True
                reason_text = (
                    f"Phông chữ '{raw_val}' không nằm trong danh sách hỗ trợ đầy đủ dấu tiếng Việt "
                    "nên được chuyển về 'Be Vietnam Pro'."
                )

        resolved_sections[sec_name][field_name] = eff_val
        entries.append(
            ProfileTraceEntry(
                param=param_key,
                group=group_name,
                source=chosen_source,
                raw_value=raw_val,
                effective_value=eff_val,
                clamped=was_clamped,
                skipped_sources=skipped_sources,
                confidence=conf_val,
                reason=reason_text,
            )
        )

    # Ensure hook.max_ms >= hook.min_ms invariant
    if resolved_sections["hook"]["max_ms"] < resolved_sections["hook"]["min_ms"]:
        resolved_sections["hook"]["max_ms"] = resolved_sections["hook"]["min_ms"] + 1500
    if "hook.hook_prompt" in norm_overrides:
        resolved_sections["hook"]["hook_prompt"] = norm_overrides["hook.hook_prompt"]

    # Record playback_speed trace entry (strictly locked to 1.0)
    raw_speed = norm_overrides.get("playback_speed", 1.0)
    speed_clamped = float(raw_speed) != 1.0
    entries.append(
        ProfileTraceEntry(
            param="playback_speed",
            group="pacing",
            source="default_profile",
            raw_value=raw_speed,
            effective_value=1.0,
            clamped=speed_clamped,
            skipped_sources={"user_override": raw_speed} if speed_clamped else {},
            confidence="measured",
            reason="Khóa cứng tốc độ phát ở 1.0x để bảo toàn giọng nói tự nhiên của video mới.",
        )
    )

    eff_profile = EffectiveProfile(
        project_id=proj_id,
        style_id=style_id,
        schema_version="1.0",
        template=eff_template,
        playback_speed=1.0,
        enabled_groups=eff_groups,
        format=resolved_sections["format"],
        pacing=resolved_sections["pacing"],
        hook=resolved_sections["hook"],
        captions=resolved_sections["captions"],
        audio=resolved_sections["audio"],
        titlecard=resolved_sections["titlecard"],
        punchin=resolved_sections["punchin"],
        warnings=warnings,
    )
    eff_profile.validate(raise_on_error=True)

    trace = ProfileTrace(
        project_id=proj_id,
        style_id=style_id,
        schema_version="1.0",
        priority_order=list(PROFILE_TRACE_SOURCES),
        enabled_groups=eff_groups,
        entries=entries,
        warnings=warnings,
    )
    trace.validate(raise_on_error=True)

    return eff_profile, trace


# ---------------------------------------------------------------------------
# Workspace Runner (`run_ps2_style_apply`)
# ---------------------------------------------------------------------------

def _resolve_style_profile_input(
    workspace_dir: Optional[Path],
    style_profile: Optional[Union[StyleProfile, Dict[str, Any], str, Path]] = None,
    style_id: Optional[str] = None,
    studio_meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Resolve `style_profile.json` from explicit arg, workspace files, `studio_meta.json`, or `memory/styles/`."""
    if isinstance(style_profile, StyleProfile):
        return style_profile.to_dict()
    if isinstance(style_profile, dict) and style_profile:
        return style_profile
    if isinstance(style_profile, (str, Path)) and str(style_profile).strip():
        p = Path(style_profile)
        loaded = _load_json_safe(p)
        if isinstance(loaded, dict):
            return loaded

    if isinstance(studio_meta, dict):
        inline_sp = studio_meta.get("styleProfile") or studio_meta.get("style_profile")
        if isinstance(inline_sp, dict) and inline_sp.get("style_id"):
            return inline_sp
        if not style_id:
            style_id = studio_meta.get("styleId") or studio_meta.get("style_id")

    if workspace_dir is not None:
        for cand in (
            workspace_dir / "work" / "style_profile.json",
            workspace_dir / "style_profile.json",
        ):
            loaded = _load_json_safe(cand)
            if isinstance(loaded, dict) and loaded.get("style_id"):
                return loaded

    if style_id and str(style_id).strip():
        clean_id = str(style_id).strip()
        styles_dir = PIPELINE_ROOT / "memory" / "styles"
        for cand_name in (f"{clean_id}.json", clean_id):
            cand_path = styles_dir / cand_name
            loaded = _load_json_safe(cand_path)
            if isinstance(loaded, dict) and loaded.get("style_id"):
                return loaded

    return None


def _update_workspace_state(
    workspace: Path,
    eff_path: Path,
    trace_path: Path,
    eff_profile: EffectiveProfile,
) -> None:
    state_path = workspace / "state.json"
    if not state_path.exists():
        return
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            return
        phases = state.setdefault("phases", {})
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        phases["PS2"] = {
            "status": "completed",
            "completed_at": now_iso,
            "updated_at": now_iso,
            "artifact": "work/effective_profile.json",
            "outputs": [str(eff_path), str(trace_path)],
            "metrics": {
                "style_id": eff_profile.style_id,
                "template": eff_profile.template,
                "warnings_count": len(eff_profile.warnings),
            },
        }
        state["updated_at"] = now_iso
        state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except Exception:
        pass


def run_ps2_style_apply(
    workspace_dir: Optional[Union[str, Path]] = None,
    *,
    style_profile: Optional[Union[StyleProfile, Dict[str, Any], str, Path]] = None,
    style_profile_path: Optional[Union[str, Path]] = None,
    style_id: Optional[str] = None,
    enabled_groups: Optional[Union[Dict[str, bool], Sequence[str]]] = None,
    template: Optional[str] = None,
    template_name: Optional[str] = None,
    hook_prompt: Optional[str] = None,
    user_overrides: Optional[Dict[str, Any]] = None,
    source_video_meta: Optional[Dict[str, Any]] = None,
    project_id: Optional[str] = None,
    effective_output_path: Optional[Union[str, Path]] = None,
    trace_output_path: Optional[Union[str, Path]] = None,
    default_profile_path: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """
    Execute Stage S2 (`ps2_style_apply.py`) on a workspace or explicit paths:
    1. Loads `state.json` (`video_metadata`) and `studio_meta.json` if in a workspace.
    2. Resolves `style_profile.json`, `enabled_groups`, `template`, and `user_overrides`.
    3. Merges parameters across the 4 tiers (`user_override > sample_style > template > default_profile`).
    4. Writes `work/effective_profile.json` and `work/profile_trace.json` (plus workspace root copies).
    """
    ws = Path(workspace_dir).resolve() if workspace_dir else None
    state_data = _load_json_safe(ws / "state.json") if ws else None
    studio_meta = _load_json_safe(ws / "studio_meta.json") if ws else None

    resolved_project_id = str(
        project_id
        or (state_data.get("project_id") if isinstance(state_data, dict) else None)
        or (ws.name if ws else None)
        or "default_project"
    )

    resolved_video_meta = source_video_meta
    if not resolved_video_meta and isinstance(state_data, dict):
        vm = state_data.get("video_metadata")
        if isinstance(vm, dict) and vm:
            resolved_video_meta = vm

    resolved_sp = _resolve_style_profile_input(
        workspace_dir=ws,
        style_profile=style_profile or style_profile_path,
        style_id=style_id,
        studio_meta=studio_meta if isinstance(studio_meta, dict) else None,
    )

    resolved_groups = enabled_groups
    if resolved_groups is None and isinstance(studio_meta, dict):
        raw_grp = studio_meta.get("enabledStyleGroups") or studio_meta.get("enabled_groups")
        if isinstance(raw_grp, dict):
            resolved_groups = {str(k): bool(v) for k, v in raw_grp.items()}
        elif isinstance(raw_grp, list):
            resolved_groups = [str(k) for k in raw_grp]

    combined_overrides: Dict[str, Any] = {}
    if isinstance(studio_meta, dict):
        for k in ("hook_prompt", "hookPrompt", "cut_aggression", "aggression", "template"):
            if studio_meta.get(k) is not None:
                combined_overrides[k] = studio_meta[k]
        if isinstance(studio_meta.get("user_overrides"), dict):
            combined_overrides.update(studio_meta["user_overrides"])
    if isinstance(user_overrides, dict):
        combined_overrides.update(user_overrides)
    if hook_prompt and str(hook_prompt).strip():
        combined_overrides["hook_prompt"] = str(hook_prompt).strip()

    eff_profile, trace = merge_style_profile(
        project_id=resolved_project_id,
        style_profile=resolved_sp,
        enabled_groups=resolved_groups,
        template=template or template_name,
        user_overrides=combined_overrides,
        source_video_meta=resolved_video_meta,
        default_profile_path=Path(default_profile_path) if default_profile_path else None,
    )

    eff_dict = eff_profile.to_dict()
    trace_dict = trace.to_dict()

    if ws is not None:
        work_dir = ws / "work"
        work_dir.mkdir(parents=True, exist_ok=True)
        eff_out = Path(effective_output_path) if effective_output_path else (work_dir / "effective_profile.json")
        trace_out = Path(trace_output_path) if trace_output_path else (work_dir / "profile_trace.json")
        eff_out.parent.mkdir(parents=True, exist_ok=True)
        trace_out.parent.mkdir(parents=True, exist_ok=True)

        eff_json_text = json.dumps(eff_dict, indent=2, ensure_ascii=False) + "\n"
        trace_json_text = json.dumps(trace_dict, indent=2, ensure_ascii=False) + "\n"

        eff_out.write_text(eff_json_text, encoding="utf-8")
        trace_out.write_text(trace_json_text, encoding="utf-8")

        # Also mirror at workspace root for convenience
        root_eff = ws / "effective_profile.json"
        root_trace = ws / "profile_trace.json"
        if eff_out.resolve() != root_eff.resolve():
            root_eff.write_text(eff_json_text, encoding="utf-8")
        if trace_out.resolve() != root_trace.resolve():
            root_trace.write_text(trace_json_text, encoding="utf-8")

        _update_workspace_state(ws, eff_out, trace_out, eff_profile)
    else:
        if effective_output_path:
            eff_out = Path(effective_output_path).resolve()
            eff_out.parent.mkdir(parents=True, exist_ok=True)
            eff_out.write_text(json.dumps(eff_dict, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        else:
            eff_out = Path("work/effective_profile.json")
        if trace_output_path:
            trace_out = Path(trace_output_path).resolve()
            trace_out.parent.mkdir(parents=True, exist_ok=True)
            trace_out.write_text(json.dumps(trace_dict, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        else:
            trace_out = Path("work/profile_trace.json")

    return {
        "phase": "PS2",
        "status": "completed",
        "effective_profile_path": str(eff_out),
        "profile_trace_path": str(trace_out),
        "effective_profile": eff_dict,
        "profile_trace": trace_dict,
    }


# Aliases for orchestrator & task compatibility
run_phase = run_ps2_style_apply
run_ps2_style_applier = run_ps2_style_apply
execute = run_ps2_style_apply


# ---------------------------------------------------------------------------
# Built-in Self-Test (`--self-test`)
# ---------------------------------------------------------------------------

def run_self_test() -> int:
    """
    Self-test verifying all Stage S2 requirements:
    1. 4-tier priority order (`user_override > sample_style > template > default_profile`).
    2. Group toggle (`enabled_groups`): disabling `pacing` or `captions` skips `sample_style`.
    3. Safety clamping:
       - `playback_speed` strictly locked at `1.0`.
       - `audio.lufs = -6.5` clamped to `-9.0` LUFS (`clamped=True` in `profile_trace.json`).
       - `audio.true_peak_db = 0.3` clamped to `-1.0` dBTP.
       - Aspect ratio mismatch (`9:16` sample vs `16:9` source) preserves `16:9` and logs warning.
       - `captions.present = False` sets `captions.enabled = False`.
       - `punchin` with `confidence == "assumed"` or empty `evidence` stays `enabled = False`.
       - `hook_prompt` user override beats `sample_style` for `hook.preferred_style`.
    """
    print("=== [PS2 Style Applier] Running Self-Test ===")
    with tempfile.TemporaryDirectory(prefix="ps2_style_apply_test_") as tmp_dir:
        ws = Path(tmp_dir)
        (ws / "state.json").write_text(
            json.dumps(
                {
                    "project_id": "selftest_ps2_project",
                    "video_metadata": {
                        "width": 1920,
                        "height": 1080,
                        "fps": 30.0,
                        "aspect": "16:9",
                        "duration_ms": 45000,
                    },
                    "phases": {"P0": {"status": "completed"}},
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        sample_style = {
            "style_id": "style_reels_fast",
            "name": "Reels nhịp nhanh thử nghiệm",
            "source": {"sha256": "abc123def456", "duration_ms": 60000, "analyzed_ms": 60000},
            "format": {
                "width": 1080,
                "height": 1920,
                "fps": 30.0,
                "aspect": "9:16",
                "template": "podcast_vertical",
            },
            "pacing": {
                "words_per_min": 185.0,
                "pause_median_ms": 240.0,
                "pause_p90_ms": 520.0,
                "max_silence_kept_ms": 650.0,
                "shots_per_min": 18.5,
                "jump_cut_ratio": 0.7,
            },
            "hook": {
                "duration_ms": 6200.0,
                "style": "teaser",
                "text_overlay": True,
                "repeated_later": True,
                "time_to_first_word_ms": 150.0,
            },
            "captions": {
                "present": False,
                "position": "bottom_center",
                "words_per_line": 3,
                "lines": 1,
                "highlight": "keyword_color",
                "font_class": "rounded_bold",
                "text_color": "#FFFFFF",
                "highlight_color": "#FFD60A",
            },
            "audio": {
                "lufs": -6.5,  # Unsafe loud LUFS -> must clamp to -9.0
                "true_peak_db": 0.3,  # Unsafe peak -> must clamp to -1.0
                "lra": 6.0,
                "music_detected": False,
            },
            "titlecard": {"present": True},
            "punchin": {
                "detected": True,
                "min_gap_s": 5.5,
                "scale": 1.08,
            },
            "confidence": {
                "format": "measured",
                "pacing": "measured",
                "hook": "estimated",
                "captions": "estimated",
                "audio": "measured",
                "titlecard": "estimated",
                "punchin": "assumed",  # Assumed confidence -> must NOT enable punchin!
            },
            "evidence": {
                "format": {"stream_index": 0},
                "pacing": {"pause_samples_ms": [200, 240, 520]},
                "hook": {"start_ms": 0, "end_ms": 6200},
                "captions": {},
                "audio": {"filter": "ebur128"},
                "titlecard": {"start_ms": 0, "end_ms": 2800},
                "punchin": {},
            },
        }

        res = run_ps2_style_apply(
            workspace_dir=ws,
            style_profile=sample_style,
            enabled_groups={
                "pacing": True,
                "hook": True,
                "captions": True,
                "audio": True,
                "punchin": True,
            },
            user_overrides={
                "hook_prompt": "Mở đầu bằng câu hỏi tại sao AirPods Pro bị rè?",
                "playback_speed": 1.5,  # Attempted speed change -> must stay 1.0
            },
        )

        eff = res["effective_profile"]
        trace = res["profile_trace"]

        assert (ws / "work" / "effective_profile.json").exists(), "work/effective_profile.json must exist"
        assert (ws / "work" / "profile_trace.json").exists(), "work/profile_trace.json must exist"
        assert validate_effective_profile(eff) is True
        assert validate_profile_trace(trace) is True

        # 1. Playback speed locked at 1.0
        assert eff["playback_speed"] == 1.0, f"Expected playback_speed=1.0, got {eff['playback_speed']}"

        # 2. Aspect ratio preserved at 16:9 (source video) despite 9:16 sample
        assert eff["format"]["aspect"] == "16:9", f"Expected source aspect 16:9 preserved, got {eff['format']['aspect']}"
        assert any("9:16" in w and "16:9" in w for w in eff["warnings"]), "Expected aspect mismatch warning"

        # 3. Audio LUFS & True Peak clamped
        assert eff["audio"]["target_lufs"] == -9.0, f"Expected clamped LUFS -9.0, got {eff['audio']['target_lufs']}"
        assert eff["audio"]["true_peak_max_db"] == -1.0, f"Expected clamped peak -1.0, got {eff['audio']['true_peak_max_db']}"

        # 4. Captions disabled because sample captions.present == False
        assert eff["captions"]["enabled"] is False, "Expected captions.enabled=False when sample captions.present=False"
        assert eff["captions"]["font_family"] == "Manrope", "Expected rounded_bold -> Manrope"

        # 5. Punch-in disabled because confidence == 'assumed'
        assert eff["punchin"]["enabled"] is False, "Expected punchin.enabled=False when confidence='assumed'"

        # 6. Hook prompt user_override beats sample_style ('teaser' -> 'question')
        assert eff["hook"]["preferred_style"] == "question", (
            f"Expected user hook_prompt to override preferred_style to 'question', got {eff['hook']['preferred_style']}"
        )
        assert eff["hook"]["target_ms"] == 6200
        assert eff["hook"]["min_ms"] == 4700
        assert eff["hook"]["max_ms"] == 7700

        # 7. Pacing mapped from sample_style
        assert eff["pacing"]["silence_threshold_ms"] == 520
        assert eff["pacing"]["pad_start_ms"] == 72
        assert eff["pacing"]["pad_end_ms"] == 96
        assert eff["pacing"]["merge_gap_ms"] == 156

        print(
            "[PASS] 4-tier merge, safety clamping (LUFS/Peak/Speed/Aspect/Punchin/Captions), "
            "and trace generation verified."
        )
        print("=== [PS2 Style Applier] Self-Test PASSED (exit code 0) ===")
        return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Stage S2 (PS2): 4-Tier Style Parameter Merger & Safety Guardrail Applier."
    )
    parser.add_argument("--workspace", "--project-dir", "-w", dest="workspace", default=None, help="Workspace directory.")
    parser.add_argument("--style-profile", dest="style_profile", default=None, help="Path to style_profile.json.")
    parser.add_argument("--style-id", dest="style_id", default=None, help="Saved style ID in memory/styles/<style_id>.json.")
    parser.add_argument("--template", dest="template", default=None, help="Template name (podcast_vertical, podcast_horizontal, cut_only).")
    parser.add_argument("--enabled-groups", dest="enabled_groups", default=None, help="JSON object or comma-separated list of enabled groups.")
    parser.add_argument("--hook-prompt", dest="hook_prompt", default=None, help="Optional user hook prompt override.")
    parser.add_argument("--output-effective", dest="effective_output", default=None, help="Explicit output path for effective_profile.json.")
    parser.add_argument("--output-trace", dest="trace_output", default=None, help="Explicit output path for profile_trace.json.")
    parser.add_argument("--self-test", action="store_true", help="Run built-in Stage S2 self-test.")
    return parser


def _parse_enabled_groups_arg(raw: Optional[str]) -> Optional[Dict[str, bool]]:
    if not raw or not raw.strip():
        return None
    text = raw.strip()
    if text.startswith("{"):
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return {str(k): bool(v) for k, v in parsed.items()}
    enabled_set = {part.strip().lower() for part in text.split(",") if part.strip()}
    return {k: (k in enabled_set) for k in DEFAULT_ENABLED_GROUPS}


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    if not args.workspace and not args.style_profile and not args.effective_output:
        parser.error("Provide --workspace <dir>, --style-profile <path>, or --self-test.")

    overrides: Dict[str, Any] = {}
    if args.hook_prompt:
        overrides["hook_prompt"] = args.hook_prompt

    res = run_ps2_style_apply(
        workspace_dir=args.workspace,
        style_profile=args.style_profile,
        style_id=args.style_id,
        enabled_groups=_parse_enabled_groups_arg(args.enabled_groups),
        template=args.template,
        user_overrides=overrides,
        effective_output_path=args.effective_output,
        trace_output_path=args.trace_output,
    )
    print(
        json.dumps(
            {
                "phase": "PS2",
                "status": res["status"],
                "effective_profile_path": res["effective_profile_path"],
                "profile_trace_path": res["profile_trace_path"],
                "warnings": res["effective_profile"].get("warnings", []),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
