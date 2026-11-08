#!/usr/bin/env python3
"""Unit tests for Stage S1 (`ps1_style_extract.py` & `ps1_style_analyzer.py`).

Covers:
1. Full 7-group StyleProfile extraction from a spoken sample video + words.json
   and validation via `StyleProfile.from_dict(...)` / `validate_artifact("style_profile", ...)`.
2. 5-minute analysis window cap (`duration_ms > 300_000` -> `analyzed_ms == 300_000` + warning).
3. Non-speech / silent sample video graceful handling (`confidence["pacing"] == "assumed"`,
   `confidence["hook"] == "assumed"`, no crash, clear warning).
4. SHA-256 style cache under `memory/styles/` (`cache_hit == True` on second call,
   and `no_cache=True` / `force=True` bypass).
5. Graceful degradation when `tesseract` OCR is unavailable (`confidence["captions"] == "assumed"`,
   `evidence["captions"]["ocr_available"] is False`).
6. Backwards compatibility via `ps1_style_analyzer.py` and downstream compatibility
   with `ps2_style_apply.py` (`apply_style_to_profile`).
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict
from unittest import mock

PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from phases import ps1_style_analyzer, ps1_style_extract  # noqa: E402
from phases.ps1_style_extract import (  # noqa: E402
    MAX_ANALYZE_MS,
    build_synthetic_mp4_with_wav,
    extract_style_profile,
    list_saved_style_profiles,
    load_style_profile,
)
from phases.ps2_style_apply import merge_style_profile  # noqa: E402
from schemas.pipeline_schemas import (  # noqa: E402
    STYLE_CONFIDENCE_LEVELS,
    STYLE_GROUPS,
    StyleProfile,
    validate_artifact,
)


def _sample_words_payload() -> Dict[str, Any]:
    return {
        "words": [
            {"word": "Tại", "start_ms": 160, "end_ms": 350},
            {"word": "sao", "start_ms": 370, "end_ms": 560},
            {"word": "tai", "start_ms": 580, "end_ms": 780},
            {"word": "nghe", "start_ms": 800, "end_ms": 1020},
            {"word": "AirPods", "start_ms": 1050, "end_ms": 1350},
            {"word": "Pro", "start_ms": 1380, "end_ms": 1620},
            {"word": "bị", "start_ms": 1650, "end_ms": 1860},
            {"word": "rè", "start_ms": 1880, "end_ms": 2120},
            {"word": "một", "start_ms": 2350, "end_ms": 2580},
            {"word": "bên?", "start_ms": 2600, "end_ms": 2920},
            {"word": "Nguyên", "start_ms": 6200, "end_ms": 6500},
            {"word": "nhân", "start_ms": 6520, "end_ms": 6800},
            {"word": "chính", "start_ms": 7100, "end_ms": 7400},
            {"word": "là", "start_ms": 7420, "end_ms": 7650},
            {"word": "màng", "start_ms": 7680, "end_ms": 7980},
            {"word": "loa.", "start_ms": 8000, "end_ms": 8300},
            # Repeat opening hook after 10s
            {"word": "Tại", "start_ms": 13500, "end_ms": 13700},
            {"word": "sao", "start_ms": 13720, "end_ms": 13920},
            {"word": "tai", "start_ms": 13940, "end_ms": 14140},
            {"word": "nghe", "start_ms": 14160, "end_ms": 14380},
            {"word": "AirPods", "start_ms": 14400, "end_ms": 14700},
            {"word": "Pro", "start_ms": 14720, "end_ms": 14950},
            {"word": "bị", "start_ms": 14980, "end_ms": 15200},
            {"word": "rè", "start_ms": 15220, "end_ms": 15500},
        ]
    }


class TestPS1StyleExtract(unittest.TestCase):
    """Test suite for Stage S1 (`ps1_style_extract.py` & `ps1_style_analyzer.py`)."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(prefix="test_ps1_")
        self.tmp_path = Path(self._tmp.name)
        self.styles_dir = self.tmp_path / "styles"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_extract_spoken_sample_and_schema_validation(self) -> None:
        """Verify 7-group extraction on spoken vertical MP4 + words.json and schema validation."""
        sample_mp4 = build_synthetic_mp4_with_wav(
            self.tmp_path / "sample_vertical.mp4",
            width=1080,
            height=1920,
            fps=30,
            duration_ms=26_000,
            speech_pattern=True,
            music_bed_amp=850,
        )
        words_file = self.tmp_path / "sample_vertical.words.json"
        words_file.write_text(
            json.dumps(_sample_words_payload(), ensure_ascii=False), encoding="utf-8"
        )
        cuts_file = self.tmp_path / "sample_vertical.cuts.json"
        cuts_file.write_text(json.dumps([1800, 6100, 12800, 16500]), encoding="utf-8")

        profile = extract_style_profile(
            video_path=sample_mp4,
            style_id="style_test_vertical",
            name="Phong cách Podcast Dọc Test",
            styles_dir=self.styles_dir,
            words_json_path=words_file,
            no_cache=True,
        )

        payload = profile.to_dict()
        self.assertTrue(validate_artifact("style_profile", payload))
        roundtrip = StyleProfile.from_dict(payload)
        self.assertEqual(roundtrip.style_id, "style_test_vertical")
        self.assertEqual(roundtrip.format.width, 1080)
        self.assertEqual(roundtrip.format.height, 1920)
        self.assertEqual(roundtrip.format.aspect, "9:16")
        self.assertEqual(roundtrip.format.template, "podcast_vertical")
        self.assertGreater(roundtrip.pacing.words_per_min, 0)
        self.assertGreater(roundtrip.pacing.shots_per_min, 0)
        self.assertEqual(roundtrip.hook.style, "question")
        self.assertTrue(roundtrip.hook.repeated_later)
        self.assertAlmostEqual(roundtrip.hook.time_to_first_word_ms, 160.0, places=1)
        self.assertEqual(set(roundtrip.confidence.keys()), STYLE_GROUPS)
        self.assertTrue(
            all(val in STYLE_CONFIDENCE_LEVELS for val in roundtrip.confidence.values())
        )
        self.assertTrue((self.styles_dir / "style_test_vertical.json").is_file())
        self.assertTrue(
            (self.styles_dir / "evidence" / "style_test_vertical" / "evidence.json").is_file()
        )

    def test_five_minute_analysis_cap_and_warning(self) -> None:
        """Verify videos longer than 5 minutes (`> 300_000 ms`) are capped at `300_000 ms` with a warning."""
        long_mp4 = build_synthetic_mp4_with_wav(
            self.tmp_path / "sample_long_6min.mp4",
            width=1920,
            height=1080,
            fps=30,
            duration_ms=360_000,
            audio_duration_ms=6_000,
            speech_pattern=True,
        )
        profile = extract_style_profile(
            video_path=long_mp4,
            style_id="style_long_cap",
            styles_dir=self.styles_dir,
            no_cache=True,
        )
        self.assertEqual(profile.source.duration_ms, 360_000)
        self.assertEqual(profile.source.analyzed_ms, MAX_ANALYZE_MS)
        self.assertEqual(profile.source.analyzed_ms, 300_000)
        warnings = getattr(profile, "warnings", [])
        self.assertTrue(any("5 phút" in w for w in warnings))

    def test_non_speech_video_graceful_fallback(self) -> None:
        """Verify non-speech / silent sample video does not crash and marks pacing & hook as assumed."""
        silent_mp4 = build_synthetic_mp4_with_wav(
            self.tmp_path / "sample_non_speech.mp4",
            width=1080,
            height=1920,
            fps=30,
            duration_ms=14_000,
            speech_pattern=False,
        )
        profile = extract_style_profile(
            video_path=silent_mp4,
            style_id="style_non_speech",
            styles_dir=self.styles_dir,
            no_cache=True,
        )
        self.assertTrue(validate_artifact("style_profile", profile.to_dict()))
        self.assertEqual(profile.confidence["pacing"], "assumed")
        self.assertEqual(profile.confidence["hook"], "assumed")
        self.assertTrue(profile.evidence["pacing"]["no_speech"])
        warnings = getattr(profile, "warnings", [])
        self.assertTrue(any("non-speech" in w for w in warnings))

    def test_sha256_cache_hit_and_force_bypass(self) -> None:
        """Verify SHA-256 caching in `memory/styles/` and `--no-cache` / `force=True` bypass."""
        sample_mp4 = build_synthetic_mp4_with_wav(
            self.tmp_path / "sample_cache.mp4",
            width=1080,
            height=1920,
            fps=30,
            duration_ms=12_000,
            speech_pattern=True,
        )
        first = extract_style_profile(
            video_path=sample_mp4,
            style_id="style_cached_01",
            styles_dir=self.styles_dir,
            no_cache=True,
        )
        self.assertFalse(first.evidence.get("_meta", {}).get("cache_hit"))

        second = extract_style_profile(
            video_path=sample_mp4,
            styles_dir=self.styles_dir,
            no_cache=False,
        )
        self.assertTrue(second.evidence.get("_meta", {}).get("cache_hit"))
        self.assertEqual(second.source.sha256, first.source.sha256)
        self.assertEqual(second.style_id, "style_cached_01")

        forced = extract_style_profile(
            video_path=sample_mp4,
            style_id="style_cached_01",
            styles_dir=self.styles_dir,
            force=True,
        )
        self.assertFalse(forced.evidence.get("_meta", {}).get("cache_hit"))

        listed = list_saved_style_profiles(styles_dir=self.styles_dir)
        self.assertTrue(any(item["style_id"] == "style_cached_01" for item in listed))
        loaded = load_style_profile("style_cached_01", styles_dir=self.styles_dir)
        self.assertEqual(loaded.source.sha256, first.source.sha256)

    def test_missing_tesseract_ocr_degrades_with_warning(self) -> None:
        """Verify missing `tesseract` sets `confidence['captions'] == 'assumed'` and `ocr_available=False`."""
        sample_mp4 = build_synthetic_mp4_with_wav(
            self.tmp_path / "sample_no_ocr.mp4",
            width=1080,
            height=1920,
            fps=30,
            duration_ms=10_000,
            speech_pattern=True,
        )
        with mock.patch.object(ps1_style_extract, "find_tesseract_binary", return_value=None):
            profile = extract_style_profile(
                video_path=sample_mp4,
                style_id="style_no_ocr",
                styles_dir=self.styles_dir,
                no_cache=True,
            )
        self.assertEqual(profile.confidence["captions"], "assumed")
        self.assertFalse(profile.evidence["captions"]["ocr_available"])
        warnings = getattr(profile, "warnings", [])
        self.assertTrue(any("OCR" in w or "tesseract" in w for w in warnings))

    def test_analyzer_reexport_and_ps2_apply_compatibility(self) -> None:
        """Verify `ps1_style_analyzer` wrapper and downstream `ps2_style_apply.apply_style_to_profile`."""
        sample_mp4 = build_synthetic_mp4_with_wav(
            self.tmp_path / "sample_compat.mp4",
            width=1080,
            height=1920,
            fps=30,
            duration_ms=16_000,
            speech_pattern=True,
        )
        profile = ps1_style_analyzer.analyze_sample_video(
            video_path=sample_mp4,
            style_id="style_compat",
            styles_dir=self.styles_dir,
            no_cache=True,
        )
        effective, trace = merge_style_profile(
            project_id="proj_compat_test",
            style_profile=profile,
            user_overrides={"pacing": {"pad_start_ms": 95}},
        )
        self.assertTrue(validate_artifact("effective_profile", effective.to_dict()))
        self.assertTrue(validate_artifact("profile_trace", trace.to_dict()))
        self.assertEqual(effective.style_id, "style_compat")
        self.assertEqual(effective.pacing["pad_start_ms"], 95)


if __name__ == "__main__":
    unittest.main()
