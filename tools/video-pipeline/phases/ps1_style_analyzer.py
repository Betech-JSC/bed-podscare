#!/usr/bin/env python3
"""Phase S1 Wrapper (`ps1_style_analyzer.py`).

Re-exports all public symbols from `phases/ps1_style_extract.py` so callers
referencing either `ps1_style_extract` or `ps1_style_analyzer` work identically.
"""

from __future__ import annotations

import sys
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from phases.ps1_style_extract import (  # noqa: E402,F401
    CAPTION_SAMPLE_STEP_MS,
    CAPTION_SAMPLE_WINDOW_MS,
    DEFAULT_SCENE_THRESHOLD,
    HOOK_MAX_WINDOW_MS,
    HOOK_MIN_WINDOW_MS,
    MAX_ANALYZE_MS,
    MAX_CAPTION_FRAMES,
    PHASE_ID,
    TITLECARD_WINDOW_MS,
    analyze_sample_video,
    build_arg_parser,
    build_synthetic_mp4_with_wav,
    extract_audio_signal,
    extract_captions_titlecard_punchin,
    extract_format_signal,
    extract_hook_signal,
    extract_pacing_signal,
    extract_style_profile,
    find_tesseract_binary,
    infer_aspect_ratio,
    infer_format_template,
    main,
    resolve_evidence_dir,
    resolve_styles_dir,
    run_phase,
    run_ps1_style_analyzer,
    run_ps1_style_extract,
    run_self_test,
    sanitize_style_id,
)

__all__ = [
    "PHASE_ID",
    "MAX_ANALYZE_MS",
    "CAPTION_SAMPLE_WINDOW_MS",
    "CAPTION_SAMPLE_STEP_MS",
    "MAX_CAPTION_FRAMES",
    "HOOK_MIN_WINDOW_MS",
    "HOOK_MAX_WINDOW_MS",
    "TITLECARD_WINDOW_MS",
    "DEFAULT_SCENE_THRESHOLD",
    "resolve_styles_dir",
    "resolve_evidence_dir",
    "sanitize_style_id",
    "infer_aspect_ratio",
    "infer_format_template",
    "find_tesseract_binary",
    "extract_format_signal",
    "extract_audio_signal",
    "extract_pacing_signal",
    "extract_hook_signal",
    "extract_captions_titlecard_punchin",
    "extract_style_profile",
    "analyze_sample_video",
    "run_ps1_style_analyzer",
    "run_ps1_style_extract",
    "run_phase",
    "build_synthetic_mp4_with_wav",
    "run_self_test",
    "build_arg_parser",
    "main",
]

if __name__ == "__main__":
    sys.exit(main())
