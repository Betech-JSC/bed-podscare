#!/usr/bin/env python3
"""
Unit & Integration Test Suite for Stage S2 (`ps2_style_apply.py` & Pipeline Integration)
Covers:
1. 4-tier style parameter priority (`user_override > sample_style > template > default_profile`)
2. Group toggles (`enabled_groups`: `pacing`, `hook`, `captions`, `audio`, `punchin`)
3. Safety guardrails:
   - `playback_speed == 1.0` invariant
   - Aspect ratio preservation on source vs sample mismatch (`16:9` vs `9:16`)
   - Audio loudness clamping (`target_lufs` in `[-23.0, -9.0]`, `true_peak_max_db <= -1.0`)
   - `captions.present == False` -> `captions.enabled == False`
   - Vietnamese font whitelist (`ALLOWED_VIETNAMESE_FONTS`) fallback
   - `punchin` disabled when `confidence == "assumed"` or `evidence` is empty
   - `hook_prompt` (`user_override`) takes priority over `sample_style` `preferred_style`
4. Downstream pipeline integration (`P3`, `P5`, `P6`, `P8` `style_match.json`, and `cli.py --phase PS2`)
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

import cli  # noqa: E402
from phases import (  # noqa: E402
    p3_acoustic_detect,
    p5_hook_agent,
    p6_cutlist,
    p8_qa,
    ps2_style_apply,
    ps2_style_applier,
)
from schemas.pipeline_schemas import (  # noqa: E402
    ALLOWED_VIETNAMESE_FONTS,
    validate_effective_profile,
    validate_profile_trace,
    validate_style_match,
)


def _make_sample_style_profile(
    *,
    style_id: str = "style_podscare_01",
    aspect_ratio: str = "9:16",
    captions_present: bool = True,
    font_class: str = "rounded_bold",
    lufs: float = -13.5,
    true_peak: float = -1.5,
    punchin_confidence: str = "measured",
    punchin_scale: float = 1.10,
    punchin_evidence: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return {
        "style_id": style_id,
        "name": "Mẫu Reels PodsCare",
        "source": {
            "sha256": "a" * 64,
            "duration_ms": 32000,
            "analyzed_ms": 32000,
        },
        "format": {
            "width": 1080 if aspect_ratio == "9:16" else 1920,
            "height": 1920 if aspect_ratio == "9:16" else 1080,
            "fps": 30.0,
            "aspect": aspect_ratio,
            "template": "podcast_vertical" if aspect_ratio == "9:16" else "podcast_horizontal",
        },
        "pacing": {
            "words_per_min": 175.0,
            "pause_median_ms": 240.0,
            "pause_p90_ms": 520.0,
            "max_silence_kept_ms": 650.0,
            "shots_per_min": 22.5,
            "jump_cut_ratio": 0.65,
        },
        "hook": {
            "duration_ms": 6200.0,
            "style": "teaser",
            "text_overlay": True,
            "repeated_later": True,
            "time_to_first_word_ms": 180.0,
        },
        "captions": {
            "present": captions_present,
            "position": "bottom_center",
            "words_per_line": 4,
            "lines": 2,
            "highlight": "keyword_color",
            "font_class": font_class,
            "text_color": "#FFEE00",
            "highlight_color": "#00FFAA",
        },
        "audio": {
            "lufs": lufs,
            "true_peak_db": true_peak,
            "lra": 6.5,
            "music_detected": False,
        },
        "titlecard": {
            "present": True,
        },
        "punchin": {
            "detected": True,
            "min_gap_s": 5.0,
            "scale": punchin_scale,
        },
        "confidence": {
            "format": "measured",
            "pacing": "measured",
            "hook": "estimated",
            "captions": "estimated",
            "audio": "measured",
            "titlecard": "estimated",
            "punchin": punchin_confidence,
        },
        "evidence": {
            "format": {"stream_index": 0},
            "pacing": {"pause_samples_ms": [200, 240, 520]},
            "hook": {"start_ms": 0, "end_ms": 6200},
            "captions": {"sampled_frames": [1000, 3000]},
            "audio": {"filter": "ebur128"},
            "titlecard": {"start_ms": 0, "end_ms": 1800},
            "punchin": (
                {"events": [{"at_ms": 3200, "scale": punchin_scale}]}
                if punchin_evidence is None
                else punchin_evidence
            ),
        },
    }


class TestPs2StyleApplyUnit(unittest.TestCase):
    """Unit tests for `ps2_style_apply.py` & `ps2_style_applier.py`."""

    def test_alias_module_exports(self) -> None:
        self.assertIs(ps2_style_apply.merge_style_profile, ps2_style_applier.merge_style_profile)
        self.assertIs(ps2_style_apply.run_ps2_style_apply, ps2_style_applier.run_ps2_style_apply)

    def test_priority_order_and_group_toggles(self) -> None:
        sample = _make_sample_style_profile()
        eff_obj, trace_obj = ps2_style_apply.merge_style_profile(
            project_id="proj_prio",
            style_profile=sample,
            enabled_groups={"pacing": True, "hook": True, "captions": True, "audio": False, "punchin": False},
            template="podcast_vertical",
            user_overrides={
                "hook_prompt": "Nhấn mạnh câu hỏi mở đầu bảo hành 6 tháng?",
                "pacing": {"pad_start_ms": 110},
            },
            source_video_meta={"width": 1080, "height": 1920, "aspect": "9:16"},
        )
        eff = eff_obj.to_dict()
        trace = trace_obj.to_dict()

        self.assertTrue(validate_effective_profile(eff, raise_on_error=True))
        self.assertTrue(validate_profile_trace(trace, raise_on_error=True))

        # 1. user_override beats sample_style on pad_start_ms and hook.preferred_style
        self.assertEqual(eff["pacing"]["pad_start_ms"], 110)
        self.assertEqual(eff["hook"]["preferred_style"], "question")

        # 2. sample_style beats template/default on enabled groups (pacing.silence_threshold_ms, captions)
        self.assertEqual(eff["pacing"]["silence_threshold_ms"], 520)
        self.assertEqual(eff["pacing"]["pad_end_ms"], 96)
        self.assertEqual(eff["captions"]["font_family"], "Manrope")
        self.assertEqual(eff["captions"]["words_per_line"], 4)

        # 3. template / default_profile used when group (audio) is disabled
        self.assertEqual(eff["audio"]["target_lufs"], -14.0)
        self.assertFalse(eff["punchin"]["enabled"])

        trace_by_param = {e["param"]: e for e in trace["entries"]}
        self.assertEqual(trace_by_param["pacing.pad_start_ms"]["source"], "user_override")
        self.assertEqual(trace_by_param["pacing.silence_threshold_ms"]["source"], "sample_style")
        self.assertEqual(trace_by_param["hook.preferred_style"]["source"], "user_override")
        self.assertIn(trace_by_param["audio.target_lufs"]["source"], ("template", "default_profile"))

    def test_disabled_group_toggles_exclude_sample_parameters_in_trace_and_effective(self) -> None:
        """
        Scenario 2 (Group Toggles): When a group toggle in `enabled_groups` is False,
        none of that group's parameters are applied from `sample_style` in either
        `effective_profile.json` or `profile_trace.json`.
        """
        sample = _make_sample_style_profile(
            lufs=-12.2,
            true_peak=-1.4,
            punchin_confidence="measured",
            punchin_scale=1.10,
            punchin_evidence={"events": [{"at_ms": 3200, "scale": 1.10}]},
        )
        eff_obj, trace_obj = ps2_style_apply.merge_style_profile(
            project_id="proj_disabled_groups",
            style_profile=sample,
            enabled_groups={
                "pacing": False,
                "hook": False,
                "captions": False,
                "audio": False,
                "punchin": False,
            },
            template="podcast_vertical",
            source_video_meta={"width": 1080, "height": 1920, "aspect": "9:16"},
        )
        eff = eff_obj.to_dict()
        trace = trace_obj.to_dict()

        self.assertTrue(validate_effective_profile(eff, raise_on_error=True))
        self.assertTrue(validate_profile_trace(trace, raise_on_error=True))

        # Verify effective_profile uses default/template values rather than sample values
        self.assertEqual(eff["pacing"]["silence_threshold_ms"], 400)  # Sample had 520
        self.assertEqual(eff["pacing"]["pad_start_ms"], 80)           # Sample had 72
        self.assertEqual(eff["pacing"]["pad_end_ms"], 100)            # Sample had 96
        self.assertEqual(eff["pacing"]["merge_gap_ms"], 150)          # Sample had 156
        self.assertEqual(eff["hook"]["target_ms"], 6500)              # Sample had 6200
        self.assertEqual(eff["hook"]["min_ms"], 5000)                 # Sample had 4700
        self.assertEqual(eff["hook"]["max_ms"], 10000)                # Sample had 7700
        self.assertEqual(eff["captions"]["words_per_line"], 3)        # Sample had 4
        self.assertEqual(eff["captions"]["font_family"], "Be Vietnam Pro")  # Sample had Manrope
        self.assertEqual(eff["audio"]["target_lufs"], -14.0)          # Sample had -12.2
        self.assertFalse(eff["punchin"]["enabled"])                   # Sample had True (1.10x)

        # Verify profile_trace never uses 'sample_style' for any toggle-controlled group
        toggle_groups = {"pacing", "hook", "captions", "audio", "punchin", "titlecard"}
        for entry in trace["entries"]:
            if entry["group"] in toggle_groups and entry["param"] != "playback_speed":
                self.assertNotEqual(
                    entry["source"],
                    "sample_style",
                    f"Parameter {entry['param']} must not come from sample_style when group {entry['group']} is disabled",
                )
                self.assertIn(entry["source"], ("template", "default_profile"))
                if "sample_style" in entry["skipped_sources"]:
                    self.assertIn("Người dùng tắt công tắc nhóm", entry["reason"])

    def test_session_user_override_hook_prompt_beats_sample_style_across_ps2_and_p5(self) -> None:
        """
        Scenario 3 (Session Override Priority): User's `hook_prompt` strictly overrides
        `sample_style` (`hook.style` / `preferred_style`) in both PS2 (`effective_profile.json`
        & `profile_trace.json`) and P5 (`hooks.json`).
        """
        sample = _make_sample_style_profile()
        self.assertEqual(sample["hook"]["style"], "teaser")

        user_prompt = "Mở đầu bằng câu hỏi tại sao tai nghe bị rè một bên?"
        eff_obj, trace_obj = ps2_style_apply.merge_style_profile(
            project_id="proj_hook_override",
            style_profile=sample,
            enabled_groups={"pacing": True, "hook": True, "captions": True, "audio": True, "punchin": True},
            user_overrides={"hook_prompt": user_prompt},
        )
        eff = eff_obj.to_dict()
        trace = trace_obj.to_dict()

        self.assertEqual(eff["hook"]["preferred_style"], "question")
        self.assertEqual(eff["hook"]["hook_prompt"], user_prompt)

        trace_by_param = {e["param"]: e for e in trace["entries"]}
        hook_style_entry = trace_by_param["hook.preferred_style"]
        self.assertEqual(hook_style_entry["source"], "user_override")
        self.assertEqual(hook_style_entry["effective_value"], "question")
        self.assertEqual(hook_style_entry["skipped_sources"].get("sample_style"), "teaser")

        # Verify P5 honors the user hook_prompt over the sample's teaser style
        takes_payload = {
            "project_id": "proj_hook_override",
            "takes": [
                {
                    "take_id": "beat_01_t01",
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "start_ms": 1000,
                    "end_ms": 6500,
                    "duration_ms": 5500,
                    "text": "Tại sao tai nghe bị rè một bên?",
                    "score": 4.8,
                },
                {
                    "take_id": "beat_02_t01",
                    "beat_id": "beat_02",
                    "section_type": "body",
                    "start_ms": 8000,
                    "end_ms": 14000,
                    "duration_ms": 6000,
                    "text": "Thay màng loa zin tại PodsCare lấy liền.",
                    "score": 4.8,
                },
            ],
        }
        p5_out = p5_hook_agent.generate_hooks(
            takes_data=takes_payload,
            effective_profile=eff,
        )
        self.assertEqual(p5_out["preferred_style"], "question")
        self.assertEqual(p5_out["selected_style"], "question")
        self.assertEqual(p5_out["selected_hook"]["style"], "question")
        self.assertIn(user_prompt, p5_out["selected_hook"]["rationale"])

    def test_guardrails_lufs_aspect_ratio_font_captions_punchin(self) -> None:
        unsafe_sample = _make_sample_style_profile(
            aspect_ratio="9:16",
            captions_present=False,
            lufs=-4.0,       # unsafe (> -9.0)
            true_peak=0.2,   # unsafe (> -1.0)
            punchin_confidence="assumed",
            punchin_scale=1.12,
            punchin_evidence={},
        )
        eff_obj, trace_obj = ps2_style_apply.merge_style_profile(
            project_id="proj_guard",
            style_profile=unsafe_sample,
            enabled_groups=["pacing", "hook", "captions", "audio", "punchin"],
            user_overrides={
                "playback_speed": 1.35,
                "captions.font_family": "Comic Sans MS",
            },
            source_video_meta={"width": 1920, "height": 1080, "aspect": "16:9"},
        )
        eff = eff_obj.to_dict()
        trace = trace_obj.to_dict()

        self.assertTrue(validate_effective_profile(eff, raise_on_error=True))
        self.assertTrue(validate_profile_trace(trace, raise_on_error=True))

        # Guardrail 1: playback_speed is strictly 1.0
        self.assertEqual(eff["playback_speed"], 1.0)

        # Guardrail 2: Source video aspect (16:9) is preserved despite 9:16 sample
        self.assertEqual(eff["format"]["aspect"], "16:9")
        self.assertTrue(any("9:16" in w and "16:9" in w for w in eff["warnings"]))

        # Guardrail 3: Audio LUFS clamped to [-23, -9] and True Peak <= -1.0
        self.assertEqual(eff["audio"]["target_lufs"], -9.0)
        self.assertEqual(eff["audio"]["true_peak_max_db"], -1.0)

        # Guardrail 4: captions.present == False forces captions.enabled == False
        self.assertFalse(eff["captions"]["enabled"])

        # Guardrail 5: Non-whitelisted font replaced by Vietnamese font from ALLOWED_VIETNAMESE_FONTS
        self.assertIn(eff["captions"]["font_family"], ALLOWED_VIETNAMESE_FONTS)
        self.assertEqual(eff["captions"]["font_family"], "Be Vietnam Pro")

        # Guardrail 6: Punch-in with confidence="assumed" / empty evidence is disabled
        self.assertFalse(eff["punchin"]["enabled"])

    def test_punchin_enabled_when_measured_with_evidence(self) -> None:
        sample = _make_sample_style_profile(
            punchin_confidence="measured",
            punchin_scale=1.10,
            punchin_evidence={"events": [{"at_ms": 3200, "scale": 1.10}]},
        )
        eff_obj, _ = ps2_style_apply.merge_style_profile(
            style_profile=sample,
            enabled_groups=["punchin"],
            source_video_meta={"width": 1080, "height": 1920},
        )
        eff = eff_obj.to_dict()
        self.assertTrue(eff["punchin"]["enabled"])
        self.assertEqual(eff["punchin"]["scale"], 1.10)


class TestPs2PipelineIntegration(unittest.TestCase):
    """Integration tests verifying PS2 -> P3 -> P5 -> P6 -> P8 and CLI."""

    def test_ps2_to_p3_p5_p6_p8_and_cli(self) -> None:
        with tempfile.TemporaryDirectory(prefix="test_s2_pipeline_") as tmp_dir:
            ws = Path(tmp_dir)
            sample = _make_sample_style_profile()
            (ws / "work").mkdir(parents=True, exist_ok=True)
            (ws / "work" / "style_profile.json").write_text(
                json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            (ws / "state.json").write_text(
                json.dumps(
                    {
                        "schema_version": "1.0",
                        "project_id": "test_s2",
                        "video_metadata": {
                            "width": 1080,
                            "height": 1920,
                            "fps": 30.0,
                            "duration_ms": 22000,
                        },
                        "phases": {},
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            # 1. Run PS2 via CLI run_single_phase
            ps2_res = cli.run_single_phase(
                "PS2",
                ws,
                enabled_groups=["pacing", "hook", "captions", "audio"],
                template="podcast_vertical",
            )
            self.assertEqual(ps2_res["status"], "completed")
            self.assertTrue((ws / "work" / "effective_profile.json").exists())
            self.assertTrue((ws / "work" / "profile_trace.json").exists())

            # 2. Verify P3 reads effective_profile.json (silence_threshold_ms=520)
            words_payload = {
                "project_id": "test_s2",
                "duration_ms": 22000,
                "words": [
                    {"word": "Tai", "start_ms": 1000, "end_ms": 1300, "confidence": 0.99},
                    {"word": "nghe", "start_ms": 1310, "end_ms": 1650, "confidence": 0.98},
                    {"word": "bị", "start_ms": 2250, "end_ms": 2550, "confidence": 0.98},  # 600ms gap (>520ms threshold)
                    {"word": "rè", "start_ms": 2560, "end_ms": 4100, "confidence": 0.99},
                    {"word": "Thay", "start_ms": 9500, "end_ms": 9900, "confidence": 0.99},
                    {"word": "màng", "start_ms": 10000, "end_ms": 15200, "confidence": 0.99},
                ],
            }
            (ws / "words.json").write_text(json.dumps(words_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            p3_res = p3_acoustic_detect.run_phase(workspace_dir=ws)
            self.assertEqual(p3_res["style_id"], "style_podscare_01")
            self.assertEqual(p3_res["silence_threshold_ms"], 520)

            # 3. Verify P5 reads effective_profile.json (preferred_style="teaser", min_ms=4700, max_ms=7700)
            beats_payload = {
                "project_id": "test_s2",
                "beats": [
                    {
                        "beat_id": "beat_01",
                        "section_type": "hook",
                        "expected_text": "Tai nghe bị rè một bên?",
                        "anchor_keywords": ["Tai nghe", "bị rè"],
                    },
                    {
                        "beat_id": "beat_02",
                        "section_type": "body",
                        "expected_text": "Thay màng loa zin tại PodsCare lấy liền.",
                        "anchor_keywords": ["Thay màng", "PodsCare"],
                    },
                ],
            }
            takes_payload = {
                "version": "1.0",
                "phase": "P4",
                "project_id": "test_s2",
                "max_duration_ms": 22000,
                "takes": [
                    {
                        "take_id": "beat_01_t01",
                        "beat_id": "beat_01",
                        "section_type": "hook",
                        "start_ms": 1000,
                        "end_ms": 4100,
                        "duration_ms": 3100,
                        "text": "Tai nghe bị rè một bên?",
                        "score": 4.7,
                        "reasoning": "Rõ chữ",
                        "selected_take": {"take_id": "beat_01_t01", "start_ms": 1000, "end_ms": 4100, "score": 4.7},
                    },
                    {
                        "take_id": "beat_02_t01",
                        "beat_id": "beat_02",
                        "section_type": "body",
                        "start_ms": 9500,
                        "end_ms": 15200,
                        "duration_ms": 5700,
                        "text": "Thay màng loa zin tại PodsCare lấy liền.",
                        "score": 4.85,
                        "reasoning": "Cao trào giải pháp",
                        "selected_take": {"take_id": "beat_02_t01", "start_ms": 9500, "end_ms": 15200, "score": 4.85},
                    },
                ],
            }
            (ws / "beats.json").write_text(json.dumps(beats_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            (ws / "takes.json").write_text(json.dumps(takes_payload, ensure_ascii=False, indent=2), encoding="utf-8")

            p5_res = p5_hook_agent.run_p5_hook_agent(workspace_dir=ws)
            self.assertEqual(p5_res["style_id"], "style_podscare_01")
            self.assertEqual(p5_res["preferred_style"], "teaser")
            self.assertEqual(p5_res["selected_style"], "teaser")
            self.assertEqual(p5_res["target_duration_range_ms"]["min_ms"], 4700)
            self.assertEqual(p5_res["target_duration_range_ms"]["max_ms"], 7700)

            # 4. Verify P6 reads effective_profile.json and keeps cold_open_duplicate beat in body
            p6_res = p6_cutlist.run_p6_cutlist(workspace_dir=ws)
            self.assertEqual(p6_res["style_id"], "style_podscare_01")
            self.assertEqual(p6_res["pad_start_ms"], 72)
            self.assertEqual(p6_res["pad_end_ms"], 96)
            self.assertEqual(p6_res["merge_gap_ms"], 156)
            self.assertEqual(p6_res["playback_speed"], 1.0)
            # Teaser hook pulled beat_02 to front as cold_open_duplicate, AND beat_01 + beat_02 remain in body
            beat_ids_in_cutlist = [s["beat_id"] for s in p6_res["segments"]]
            self.assertIn("beat_01", beat_ids_in_cutlist)
            self.assertEqual(beat_ids_in_cutlist[0], "beat_02")
            self.assertEqual(beat_ids_in_cutlist[-1], "beat_02")
            self.assertTrue(p6_res["segments"][0]["is_hook_preview"])

            # 5. Verify P8 generates work/style_match.json and shots_per_min is informational (never fails overall)
            segs = p6_res["segments"]
            srt_blocks = []
            cc_segs = []
            for idx, s in enumerate(segs, start=1):
                srt_blocks.append(
                    f"{idx}\n"
                    f"00:00:{s['target_start_ms']//1000:02d},{s['target_start_ms']%1000:03d} --> "
                    f"00:00:{s['target_end_ms']//1000:02d},{s['target_end_ms']%1000:03d}\n"
                    f"{s['text']}\n"
                )
                cc_segs.append(
                    {
                        "id": f"cc_{idx}",
                        "material_id": "mat_1",
                        "source_timerange": {"start": s["start_ms"] * 1000, "duration": s["duration_ms"] * 1000},
                        "target_timerange": {"start": s["target_start_ms"] * 1000, "duration": s["duration_ms"] * 1000},
                    }
                )
            (ws / "captions.srt").write_text("\n".join(srt_blocks), encoding="utf-8")
            (ws / "draft_content.json").write_text(
                json.dumps(
                    {
                        "duration": p6_res["total_duration_ms"] * 1000,
                        "materials": {"videos": [{"id": "mat_1", "path": "/tmp/v.mp4", "duration": 22_000_000}]},
                        "tracks": [{"id": "t1", "type": "video", "segments": cc_segs}],
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            # Force sample shots_per_min to 90.0 so actual_spm differs by >50%, verifying informational status
            sample["pacing"]["shots_per_min"] = 90.0
            (ws / "work" / "style_profile.json").write_text(
                json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            p8_res = p8_qa.run_p8_qa(ws, enable_network=False)
            self.assertEqual(p8_res["status"], "PASS")
            self.assertTrue((ws / "work" / "style_match.json").exists())

            style_match = p8_res["style_match"]
            self.assertTrue(validate_style_match(style_match, raise_on_error=True))
            self.assertEqual(style_match["overall_status"], "pass")

            items_by_metric = {it["metric"]: it for it in style_match["items"]}
            self.assertEqual(items_by_metric["shots_per_min"]["severity"], "informational")
            self.assertEqual(items_by_metric["shots_per_min"]["status"], "info")
            self.assertIn("chỉ số thông tin", style_match["summary"])

    def test_p5_short_take_boundary_safety(self) -> None:
        """When available take footage is shorter than hook.min_ms under effective_profile, P5 keeps real take end_ms and sets short_hook=True."""
        short_takes = {
            "project_id": "short_proj",
            "takes": [
                {
                    "take_id": "beat_01_t01",
                    "beat_id": "beat_01",
                    "section_type": "hook",
                    "start_ms": 500,
                    "end_ms": 2600,  # Only 2100ms available (< min_ms=4700)
                    "text": "AirPods bị rè?",
                    "score": 4.9,
                }
            ],
        }
        eff_obj, _ = ps2_style_apply.merge_style_profile(
            style_profile=_make_sample_style_profile(),
            enabled_groups=["hook"],
        )
        hooks_out = p5_hook_agent.generate_hooks(
            takes_data=short_takes,
            effective_profile=eff_obj.to_dict(),
        )
        for opt in hooks_out["hooks"]:
            self.assertTrue(opt["short_hook"])
            self.assertEqual(opt["start_ms"], 500)
            self.assertEqual(opt["end_ms"], 2600)
            self.assertEqual(opt["duration_ms"], 2100)

    def test_regression_no_style_id_matches_default_pipeline_behavior(self) -> None:
        """
        Scenario 1 (Regression): When NO `style_id` and NO `style_profile` are provided,
        running `PS2 -> P3 -> P5 -> P6 -> P8` preserves the exact default behavior and
        outputs of `P3`, `P5`, `P6`, and `P8` compared to the legacy pipeline without `PS2`,
        and `style_match.json` reports `overall_status == "pass"` with no false errors.
        """
        with tempfile.TemporaryDirectory(prefix="test_s2_regression_") as tmp_dir:
            root = Path(tmp_dir)
            ws_default = root / "ws_default"
            ws_no_style = root / "ws_no_style"
            ws_default.mkdir(parents=True, exist_ok=True)
            ws_no_style.mkdir(parents=True, exist_ok=True)

            state_payload = {
                "schema_version": "1.0",
                "project_id": "reg_proj",
                "video_metadata": {
                    "width": 1080,
                    "height": 1920,
                    "fps": 30.0,
                    "duration_ms": 22000,
                },
                "phases": {},
            }
            words_payload = {
                "project_id": "reg_proj",
                "duration_ms": 22000,
                "words": [
                    {"word": "Tai", "start_ms": 1000, "end_ms": 1300, "confidence": 0.99},
                    {"word": "nghe", "start_ms": 1310, "end_ms": 1650, "confidence": 0.98},
                    {"word": "bị", "start_ms": 2250, "end_ms": 2550, "confidence": 0.98},
                    {"word": "rè", "start_ms": 2560, "end_ms": 4100, "confidence": 0.99},
                    {"word": "Thay", "start_ms": 9500, "end_ms": 9900, "confidence": 0.99},
                    {"word": "màng", "start_ms": 10000, "end_ms": 15200, "confidence": 0.99},
                ],
            }
            beats_payload = {
                "project_id": "reg_proj",
                "beats": [
                    {
                        "beat_id": "beat_01",
                        "section_type": "hook",
                        "expected_text": "Tai nghe bị rè một bên?",
                        "anchor_keywords": ["Tai nghe", "bị rè"],
                    },
                    {
                        "beat_id": "beat_02",
                        "section_type": "body",
                        "expected_text": "Thay màng loa zin tại PodsCare lấy liền.",
                        "anchor_keywords": ["Thay màng", "PodsCare"],
                    },
                ],
            }
            takes_payload = {
                "version": "1.0",
                "phase": "P4",
                "project_id": "reg_proj",
                "max_duration_ms": 22000,
                "takes": [
                    {
                        "take_id": "beat_01_t01",
                        "beat_id": "beat_01",
                        "section_type": "hook",
                        "start_ms": 1000,
                        "end_ms": 4100,
                        "duration_ms": 3100,
                        "text": "Tai nghe bị rè một bên?",
                        "score": 4.7,
                        "reasoning": "Rõ chữ",
                        "selected_take": {"take_id": "beat_01_t01", "start_ms": 1000, "end_ms": 4100, "score": 4.7},
                    },
                    {
                        "take_id": "beat_02_t01",
                        "beat_id": "beat_02",
                        "section_type": "body",
                        "start_ms": 9500,
                        "end_ms": 15200,
                        "duration_ms": 5700,
                        "text": "Thay màng loa zin tại PodsCare lấy liền.",
                        "score": 4.85,
                        "reasoning": "Cao trào giải pháp",
                        "selected_take": {"take_id": "beat_02_t01", "start_ms": 9500, "end_ms": 15200, "score": 4.85},
                    },
                ],
            }

            for ws in (ws_default, ws_no_style):
                (ws / "state.json").write_text(json.dumps(state_payload, ensure_ascii=False, indent=2), encoding="utf-8")
                (ws / "words.json").write_text(json.dumps(words_payload, ensure_ascii=False, indent=2), encoding="utf-8")
                (ws / "beats.json").write_text(json.dumps(beats_payload, ensure_ascii=False, indent=2), encoding="utf-8")
                (ws / "takes.json").write_text(json.dumps(takes_payload, ensure_ascii=False, indent=2), encoding="utf-8")

            # Run PS2 on ws_no_style WITHOUT style_id or style_profile
            ps2_res = cli.run_single_phase("PS2", ws_no_style)
            self.assertEqual(ps2_res["status"], "completed")
            eff_no_style = ps2_res["result"]["effective_profile"]
            trace_no_style = ps2_res["result"]["profile_trace"]
            self.assertIsNone(eff_no_style["style_id"])
            self.assertFalse(any(eff_no_style["enabled_groups"].values()))
            self.assertTrue(all(e["source"] != "sample_style" for e in trace_no_style["entries"]))

            # 1. Compare P3 outputs
            p3_def = p3_acoustic_detect.run_phase(workspace_dir=ws_default)
            p3_nos = p3_acoustic_detect.run_phase(workspace_dir=ws_no_style)
            self.assertIsNone(p3_def["style_id"])
            self.assertIsNone(p3_nos["style_id"])
            self.assertEqual(p3_nos["silence_threshold_ms"], p3_def["silence_threshold_ms"])
            self.assertEqual(p3_nos["flags"], p3_def["flags"])
            self.assertEqual(
                (ws_no_style / "packed.txt").read_text(encoding="utf-8"),
                (ws_default / "packed.txt").read_text(encoding="utf-8"),
            )

            # 2. Compare P5 outputs
            p5_def = p5_hook_agent.run_p5_hook_agent(workspace_dir=ws_default)
            p5_nos = p5_hook_agent.run_p5_hook_agent(workspace_dir=ws_no_style)
            self.assertIsNone(p5_def["style_id"])
            self.assertIsNone(p5_nos["style_id"])
            self.assertEqual(p5_nos["preferred_style"], p5_def["preferred_style"])
            self.assertEqual(p5_nos["selected_style"], p5_def["selected_style"])
            self.assertEqual(p5_nos["target_duration_range_ms"], p5_def["target_duration_range_ms"])
            self.assertEqual(p5_nos["selected_hook"], p5_def["selected_hook"])
            self.assertEqual(p5_nos["hooks"], p5_def["hooks"])

            # 3. Compare P6 outputs
            p6_def = p6_cutlist.run_p6_cutlist(workspace_dir=ws_default)
            p6_nos = p6_cutlist.run_p6_cutlist(workspace_dir=ws_no_style)
            self.assertIsNone(p6_def["style_id"])
            self.assertIsNone(p6_nos["style_id"])
            self.assertEqual(p6_nos["pad_start_ms"], p6_def["pad_start_ms"])
            self.assertEqual(p6_nos["pad_end_ms"], p6_def["pad_end_ms"])
            self.assertEqual(p6_nos["merge_gap_ms"], p6_def["merge_gap_ms"])
            self.assertEqual(p6_nos["playback_speed"], p6_def["playback_speed"])
            self.assertEqual(p6_nos["total_duration_ms"], p6_def["total_duration_ms"])
            self.assertEqual(p6_nos["segments"], p6_def["segments"])

            # 4. Prepare SRT and CapCut draft for both workspaces and compare P8 outputs
            for ws, p6_out in ((ws_default, p6_def), (ws_no_style, p6_nos)):
                segs = p6_out["segments"]
                srt_blocks = []
                cc_segs = []
                for idx, s in enumerate(segs, start=1):
                    srt_blocks.append(
                        f"{idx}\n"
                        f"00:00:{s['target_start_ms']//1000:02d},{s['target_start_ms']%1000:03d} --> "
                        f"00:00:{s['target_end_ms']//1000:02d},{s['target_end_ms']%1000:03d}\n"
                        f"{s['text']}\n"
                    )
                    cc_segs.append(
                        {
                            "id": f"cc_{idx}",
                            "material_id": "mat_1",
                            "source_timerange": {"start": s["start_ms"] * 1000, "duration": s["duration_ms"] * 1000},
                            "target_timerange": {"start": s["target_start_ms"] * 1000, "duration": s["duration_ms"] * 1000},
                        }
                    )
                (ws / "captions.srt").write_text("\n".join(srt_blocks), encoding="utf-8")
                (ws / "draft_content.json").write_text(
                    json.dumps(
                        {
                            "duration": p6_out["total_duration_ms"] * 1000,
                            "materials": {"videos": [{"id": "mat_1", "path": "/tmp/v.mp4", "duration": 22_000_000}]},
                            "tracks": [{"id": "t1", "type": "video", "segments": cc_segs}],
                        },
                        indent=2,
                    ),
                    encoding="utf-8",
                )

            p8_def = p8_qa.run_p8_qa(ws_default, enable_network=False)
            p8_nos = p8_qa.run_p8_qa(ws_no_style, enable_network=False)
            self.assertEqual(p8_def["status"], "PASS")
            self.assertEqual(p8_nos["status"], "PASS")
            self.assertEqual(p8_nos["issue_count"], 0)
            self.assertEqual(p8_nos["style_match"]["style_id"], "default_profile")
            self.assertEqual(p8_nos["style_match"]["overall_status"], "pass")
            self.assertEqual(p8_nos["style_match"], p8_def["style_match"])


if __name__ == "__main__":
    unittest.main()
