#!/usr/bin/env python3
"""
Alias module `ps2_style_applier.py` -> re-exports `ps2_style_apply.py` for full
compatibility with callers and specs referencing either filename.
"""

from __future__ import annotations

import sys
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from phases.ps2_style_apply import (  # noqa: F401
    DEFAULT_ENABLED_GROUPS,
    FONT_CLASS_TO_VIETNAMESE_FONT,
    TEMPLATE_PRESETS,
    build_arg_parser,
    execute,
    infer_aspect_ratio,
    load_effective_profile_for_workspace,
    main,
    merge_style_profile,
    run_phase,
    run_ps2_style_applier,
    run_ps2_style_apply,
    run_self_test,
)

if __name__ == "__main__":
    sys.exit(main())
