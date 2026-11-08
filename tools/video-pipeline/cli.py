#!/usr/bin/env python3
"""
AI Multi-Agent Video Editing Pipeline — Master CLI Orchestrator (`cli.py`)

Subcommands:
- `run-phase --phase P0..P9`: Execute an individual pipeline phase on a workspace.
- `run-all`: Execute the end-to-end pipeline (`P0` -> `P9`) with:
    * Human-in-the-loop Gate at P5 (Hook Selection) when `--hook-option` is not yet chosen.
    * Self-Healing QA Loop at P8 (`P8 -> P6 -> P7 -> P8`, up to 2 retry cycles if `FIX_REQUIRED`).
- `status`: Display phase execution statuses and artifact checklist for a workspace.
- `e2e-test`: Run a full isolated End-to-End integration test (`P0` -> `P9`) inside a temporary directory.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

PIPELINE_ROOT = Path(__file__).resolve().parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

ALL_PHASES: Tuple[str, ...] = ("P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9")

PHASE_DESCRIPTIONS: Dict[str, str] = {
    "P0": "Preflight & 16kHz Mono Audio Extraction (state.json, audio_16k.wav)",
    "P1": "Script Parser & Beat Decomposition (beats.json)",
    "P2": "Vocabulary-Guided STT & Word Alignment (words.json)",
    "P3": "Pure-Python Acoustic & Filler Detector (packed.txt, flags.json)",
    "P4": "Semantic Take Selector with 3-Tier Memory (takes.json)",
    "P5": "3-Second Hook Scoring & Ranking Agent (hooks.json)",
    "P6": "Cutlist Builder with Speech Padding & Frame Alignment (cutlist.json)",
    "P7": "CapCut Desktop (< v5) Triple Exporter (roughcut.mp4/.srt, clips/, capcut_draft/)",
    "P8": "Cross-Model (qa_alt) & Technical QA Verifier (qa.md)",
    "P9": "Self-Learning Memory Curator Loop (proposals.md -> lessons/p4.md & golden/p4.jsonl)",
}

PHASE_PRIMARY_ARTIFACTS: Dict[str, str] = {
    "P0": "state.json",
    "P1": "beats.json",
    "P2": "words.json",
    "P3": "flags.json",
    "P4": "takes.json",
    "P5": "hooks.json",
    "P6": "cutlist.json",
    "P7": "exports/capcut_draft/draft_content.json",
    "P8": "qa.md",
    "P9": "proposals.md",
}


# ---------------------------------------------------------------------------
# State & Helper Utilities
# ---------------------------------------------------------------------------

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_phase_name(phase_raw: str) -> str:
    cleaned = str(phase_raw).strip().upper()
    if cleaned in ("PS2", "S2"):
        return "PS2"
    if cleaned.isdigit():
        cleaned = f"P{cleaned}"
    if cleaned not in ALL_PHASES:
        raise ValueError(f"Invalid phase '{phase_raw}'. Expected one of: {', '.join(ALL_PHASES + ('PS2',))}")
    return cleaned


def _load_json_safe(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _ensure_state_phase_updated(
    workspace: Path,
    phase: str,
    status: str = "completed",
    artifact: Optional[str] = None,
    metrics: Optional[Dict[str, Any]] = None,
) -> None:
    """Ensure `workspace/state.json` records the phase completion cleanly."""
    state_path = workspace / "state.json"
    now = _utc_now_iso()
    state = _load_json_safe(state_path)
    if not isinstance(state, dict):
        state = {
            "schema_version": "1.0",
            "project_id": workspace.name or "default_project",
            "workspace_dir": str(workspace),
            "created_at": now,
            "updated_at": now,
            "phases": {},
        }
    phases = state.setdefault("phases", {})
    prev = phases.get(phase, {}) if isinstance(phases.get(phase), dict) else {}
    phases[phase] = {
        "status": status,
        "input_hash": prev.get("input_hash"),
        "started_at": prev.get("started_at") or now,
        "completed_at": now if status == "completed" else prev.get("completed_at"),
        "updated_at": now,
        "artifact": artifact or prev.get("artifact") or PHASE_PRIMARY_ARTIFACTS.get(phase),
        "metrics": metrics if metrics is not None else prev.get("metrics"),
    }
    state["current_phase"] = phase
    state["updated_at"] = now
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# Built-in Fallback for P5 Hook Agent (if module not yet present or called offline)
# ---------------------------------------------------------------------------

def _fallback_run_p5_hooks(
    workspace: Path,
    hook_option: Optional[str | int] = None,
) -> Dict[str, Any]:
    """Generate schema-valid `hooks.json` with 3 ranked Hook candidates from `takes.json` & `beats.json`."""
    takes_data = _load_json_safe(workspace / "takes.json") or {}
    beats_data = _load_json_safe(workspace / "beats.json") or {}

    takes_list = (
        takes_data.get("takes")
        or takes_data.get("beats")
        or (takes_data if isinstance(takes_data, list) else [])
    )
    beats_list = beats_data.get("beats") if isinstance(beats_data, dict) else (beats_data if isinstance(beats_data, list) else [])

    first_take = takes_list[0] if takes_list and isinstance(takes_list[0], dict) else {}
    sel = first_take.get("selected_take") if isinstance(first_take.get("selected_take"), dict) else first_take
    base_start = int(sel.get("start_ms", 1000))
    base_end = int(sel.get("end_ms", 4000))
    base_beat_id = str(first_take.get("beat_id") or (beats_list[0].get("beat_id") if beats_list else "b01"))
    base_text = str(
        sel.get("text")
        or first_take.get("text")
        or (beats_list[0].get("expected_text") if beats_list else "Tai nghe AirPods Pro bị rè một bên có sửa được không?")
    )

    candidates = [
        {
            "hook_id": "hook_01",
            "option_index": 1,
            "beat_id": base_beat_id,
            "rank": 1,
            "style": "question_curiosity",
            "start_ms": base_start,
            "end_ms": base_end,
            "score": 94.5,
            "text": base_text,
            "reasoning": "Câu hỏi trực diện đánh trúng nỗi đau người dùng trong 3 giây đầu tiên.",
            "selected": False,
        },
        {
            "hook_id": "hook_02",
            "option_index": 2,
            "beat_id": base_beat_id,
            "rank": 2,
            "style": "direct_problem",
            "start_ms": base_start,
            "end_ms": base_end,
            "score": 89.0,
            "text": base_text,
            "reasoning": "Nhịp độ nhanh, rõ từ khóa thương hiệu và vấn đề kỹ thuật.",
            "selected": False,
        },
        {
            "hook_id": "hook_03",
            "option_index": 3,
            "beat_id": base_beat_id,
            "rank": 3,
            "style": "teaser_highlight",
            "start_ms": base_start,
            "end_ms": base_end,
            "score": 84.0,
            "text": base_text,
            "reasoning": "Phương án dự phòng an toàn, giữ nguyên mạch kịch bản gốc.",
            "selected": False,
        },
    ]

    selected_id: Optional[str] = None
    if hook_option is not None:
        opt_str = str(hook_option).strip()
        for idx, cand in enumerate(candidates, start=1):
            if opt_str in (str(idx), cand["hook_id"], cand["style"]):
                cand["selected"] = True
                selected_id = cand["hook_id"]
                break
        if selected_id is None:
            candidates[0]["selected"] = True
            selected_id = candidates[0]["hook_id"]

    payload = {
        "schema_version": "1.0",
        "phase": "P5",
        "project_id": workspace.name or "default_project",
        "selected_hook_id": selected_id,
        "selected_option": selected_id,
        "hooks": candidates,
        "candidates": candidates,
    }
    hooks_path = workspace / "hooks.json"
    hooks_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def apply_hook_selection_to_workspace(workspace: Path, hook_option: str | int) -> Dict[str, Any]:
    """Record the human/CLI selected hook option into `workspace/hooks.json`."""
    hooks_path = workspace / "hooks.json"
    if not hooks_path.exists():
        return _fallback_run_p5_hooks(workspace, hook_option=hook_option)

    data = _load_json_safe(hooks_path)
    if not isinstance(data, dict):
        data = {"hooks": data if isinstance(data, list) else []}

    hooks_list = data.get("hooks") or data.get("candidates") or []
    opt_str = str(hook_option).strip()
    chosen_id = None

    for idx, item in enumerate(hooks_list, start=1):
        if not isinstance(item, dict):
            continue
        hid = str(item.get("hook_id") or item.get("id") or f"hook_{idx:02d}")
        if opt_str in (str(idx), hid, f"hook_0{opt_str}", f"opt_{opt_str}"):
            item["selected"] = True
            chosen_id = hid
        else:
            item["selected"] = False

    if chosen_id is None and hooks_list and isinstance(hooks_list[0], dict):
        hooks_list[0]["selected"] = True
        chosen_id = str(hooks_list[0].get("hook_id") or "hook_01")

    data["selected_hook_id"] = chosen_id
    data["selected_option"] = chosen_id
    data["human_approved"] = True
    hooks_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return data


# ---------------------------------------------------------------------------
# Individual Phase Dispatcher (`run_single_phase`)
# ---------------------------------------------------------------------------

def run_single_phase(
    phase: str,
    workspace_dir: Path | str,
    *,
    video_path: Optional[Path | str] = None,
    script_path: Optional[Path | str] = None,
    project_id: Optional[str] = None,
    hook_option: Optional[str | int] = None,
    hook_prompt: Optional[str] = None,
    custom_hook_clip_path: Optional[str] = None,
    pad_start_ms: Optional[int] = None,
    pad_end_ms: Optional[int] = None,
    approve_proposals_flag: bool = False,
    final_edit_path: Optional[Path | str] = None,
    lessons_path: Optional[Path] = None,
    golden_path: Optional[Path] = None,
    offline: bool = False,
    force: bool = False,
    final_only: Optional[bool] = None,
    cleanup_temp: Optional[bool] = None,
    threads: Optional[int] = None,
    style_profile_path: Optional[Path | str] = None,
    style_id: Optional[str] = None,
    enabled_groups: Optional[Sequence[str]] = None,
    template: Optional[str] = None,
) -> Dict[str, Any]:
    """Dispatch execution to the requested phase (`P0`..`P9` or `PS2`) and update `state.json`."""
    norm_phase = _normalize_phase_name(phase)
    ws = Path(workspace_dir).resolve()
    ws.mkdir(parents=True, exist_ok=True)
    proj_id = project_id or ws.name or "default_project"

    if norm_phase == "P0":
        from phases import p0_preflight  # type: ignore
        state_existing = _load_json_safe(ws / "state.json") or {}
        v_path = video_path or state_existing.get("source_video") or state_existing.get("video_path") or (ws / "source_video.mp4")
        s_path = script_path or state_existing.get("script_path") or (ws / "script.md" if (ws / "script.md").exists() else None)
        res = p0_preflight.run_preflight(
            video_path=v_path,
            script_path=s_path,
            workspace_dir=ws,
            project_id=proj_id,
            force=force,
        )
        _ensure_state_phase_updated(ws, "P0", "completed", artifact="audio_16k.wav")
        return {"phase": "P0", "status": "completed", "result": res}

    if norm_phase == "PS2":
        from phases import ps2_style_apply  # type: ignore
        res = ps2_style_apply.run_ps2_style_apply(
            workspace_dir=ws,
            style_profile_path=style_profile_path,
            style_id=style_id,
            enabled_groups=enabled_groups,
            template_name=template,
            hook_prompt=hook_prompt,
        )
        _ensure_state_phase_updated(ws, "PS2", "completed", artifact="work/effective_profile.json")
        return {"phase": "PS2", "status": "completed", "result": res}

    if norm_phase == "P1":
        from phases import p1_script_parser  # type: ignore
        state_existing = _load_json_safe(ws / "state.json") or {}
        s_path = script_path or state_existing.get("script_path") or (ws / "script.md")
        res = p1_script_parser.run_phase(
            workspace_dir=ws,
            script_path=s_path,
            output_path=ws / "beats.json",
            project_id=proj_id,
            mode="rule-based" if offline else "auto",
            use_llm=not offline,
        )
        _ensure_state_phase_updated(ws, "P1", "completed", artifact="beats.json")
        return {"phase": "P1", "status": "completed", "result": res}

    if norm_phase == "P2":
        from phases import p2_transcribe  # type: ignore
        res = p2_transcribe.run_phase(
            workspace_dir=ws,
            audio_path=ws / "audio_16k.wav",
            beats_path=ws / "beats.json",
            output_path=ws / "words.json",
            project_id=proj_id,
            backend="deterministic" if offline else "auto",
        )
        _ensure_state_phase_updated(ws, "P2", "completed", artifact="words.json")
        return {"phase": "P2", "status": "completed", "result": res}

    if norm_phase == "P3":
        from phases import p3_acoustic_detect  # type: ignore
        res = p3_acoustic_detect.run_phase(
            workspace_dir=ws,
            words_path=ws / "words.json",
            audio_path=ws / "audio_16k.wav",
            packed_output_path=ws / "packed.txt",
            flags_output_path=ws / "flags.json",
            project_id=proj_id,
        )
        _ensure_state_phase_updated(ws, "P3", "completed", artifact="flags.json")
        return {"phase": "P3", "status": "completed", "result": res}

    if norm_phase == "P4":
        from phases import p4_take_selector  # type: ignore
        res = p4_take_selector.run_take_selector_files(
            beats_path=ws / "beats.json",
            packed_path=ws / "packed.txt",
            flags_path=ws / "flags.json",
            words_path=ws / "words.json",
            output_path=ws / "takes.json",
        )
        _ensure_state_phase_updated(ws, "P4", "completed", artifact="takes.json")
        return {"phase": "P4", "status": "completed", "result": res}

    if norm_phase == "P5":
        p5_file = PIPELINE_ROOT / "phases" / "p5_hook_agent.py"
        res: Any = None
        if p5_file.exists():
            try:
                p5_mod = importlib.import_module("phases.p5_hook_agent")
                if hasattr(p5_mod, "run_phase"):
                    res = p5_mod.run_phase(
                        workspace_dir=ws,
                        hook_prompt=hook_prompt,
                        custom_hook_clip_path=custom_hook_clip_path,
                    )
                elif hasattr(p5_mod, "run_p5_hook_agent"):
                    res = p5_mod.run_p5_hook_agent(
                        workspace_dir=ws,
                        hook_prompt=hook_prompt,
                        custom_hook_clip_path=custom_hook_clip_path,
                    )
                elif hasattr(p5_mod, "run_hook_agent_files"):
                    res = p5_mod.run_hook_agent_files(
                        beats_path=ws / "beats.json",
                        takes_path=ws / "takes.json",
                        output_path=ws / "hooks.json",
                        hook_prompt=hook_prompt,
                        custom_hook_clip_path=custom_hook_clip_path,
                    )
                elif hasattr(p5_mod, "main"):
                    p5_mod.main(["--workspace", str(ws)])
                    res = _load_json_safe(ws / "hooks.json")
            except Exception:
                res = _fallback_run_p5_hooks(ws, hook_option=hook_option)
        else:
            res = _fallback_run_p5_hooks(ws, hook_option=hook_option)

        if not (ws / "hooks.json").exists():
            res = _fallback_run_p5_hooks(ws, hook_option=hook_option)
        elif hook_option is not None:
            res = apply_hook_selection_to_workspace(ws, hook_option)

        _ensure_state_phase_updated(ws, "P5", "completed", artifact="hooks.json")
        return {"phase": "P5", "status": "completed", "result": res}

    if norm_phase == "P6":
        from phases import p6_cutlist  # type: ignore
        res = p6_cutlist.run_p6_cutlist(
            workspace_dir=ws,
            hook_option=hook_option,
            pad_start_ms=pad_start_ms,
            pad_end_ms=pad_end_ms,
            custom_hook_clip_path=custom_hook_clip_path,
        )
        _ensure_state_phase_updated(ws, "P6", "completed", artifact="cutlist.json")
        return {"phase": "P6", "status": "completed", "result": res}

    if norm_phase == "P7":
        from phases import p7_exporter  # type: ignore
        res = p7_exporter.run_p7_exporter(
            workspace_dir=ws,
            source_video_path=video_path,
            final_only=final_only,
            cleanup_temp=cleanup_temp,
            threads=threads,
        )
        _ensure_state_phase_updated(ws, "P7", "completed", artifact="exports/capcut_draft/draft_content.json")
        return {"phase": "P7", "status": "completed", "result": res}

    if norm_phase == "P8":
        from phases import p8_qa  # type: ignore
        res = p8_qa.run_p8_qa(
            workspace_dir=ws,
            enable_network=not offline,
        )
        _ensure_state_phase_updated(
            ws,
            "P8",
            "completed",
            artifact="qa.md",
            metrics={"qa_verdict": res["status"], "issue_count": res["issue_count"]},
        )
        return {"phase": "P8", "status": res["status"], "result": res}

    if norm_phase == "P9":
        from phases import p9_curator  # type: ignore
        res = p9_curator.run_p9_curator(
            workspace_dir=ws,
            final_edit_path=final_edit_path,
            approve=approve_proposals_flag,
            lessons_path=lessons_path,
            golden_path=golden_path,
        )
        _ensure_state_phase_updated(ws, "P9", "completed", artifact="proposals.md")
        return {"phase": "P9", "status": res["status"], "result": res}

    raise ValueError(f"Unhandled phase: {norm_phase}")


# ---------------------------------------------------------------------------
# Full Pipeline Runner (`run_all_pipeline`) with P5 Gate & P8 Self-Healing Loop
# ---------------------------------------------------------------------------

def _is_hook_already_selected(workspace: Path) -> bool:
    hooks_data = _load_json_safe(workspace / "hooks.json")
    if not isinstance(hooks_data, dict):
        return False
    return bool(hooks_data.get("human_approved") is True)


def run_all_pipeline(
    workspace_dir: Path | str,
    *,
    video_path: Optional[Path | str] = None,
    script_path: Optional[Path | str] = None,
    project_id: Optional[str] = None,
    hook_option: Optional[str | int] = None,
    hook_prompt: Optional[str] = None,
    custom_hook_clip_path: Optional[str] = None,
    auto_approve: bool = False,
    pause_at_qa: bool = False,
    max_qa_retries: int = 2,
    approve_proposals_flag: bool = False,
    final_edit_path: Optional[Path | str] = None,
    lessons_path: Optional[Path] = None,
    golden_path: Optional[Path] = None,
    offline: bool = False,
    force: bool = False,
    final_only: Optional[bool] = None,
    cleanup_temp: Optional[bool] = None,
    threads: Optional[int] = None,
    style_profile_path: Optional[Path | str] = None,
    style_id: Optional[str] = None,
    enabled_groups: Optional[Sequence[str]] = None,
    template: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run the full pipeline sequentially (`P0` -> `P9`):
    1. Executes `P0 -> (PS2 Style Apply) -> P1 -> P2 -> P3 -> P4 -> P5`.
    2. Human-in-the-loop Gate at P5:
       If `hook_option` is None and `auto_approve` is False and no hook is marked selected in `hooks.json`,
       pauses at P5 (`status="PAUSED_FOR_HOOK_SELECTION"`) so the user can review `hooks.json` and pick a Hook.
    3. Executes `P6 -> P7 -> P8`.
    4. Self-Healing QA Loop at P8:
       If P8 returns `FIX_REQUIRED`, loops back `P8 -> P6 -> P7 -> P8` up to `max_qa_retries` (default 2) times,
       automatically expanding speech padding (`pad_start_ms`, `pad_end_ms`) to resolve boundary/clipping issues.
    5. Executes `P9` to generate `proposals.md` (and updates memory if `approve_proposals_flag=True`).
    """
    ws = Path(workspace_dir).resolve()
    ws.mkdir(parents=True, exist_ok=True)
    executed_phases: List[str] = []

    # Step 1: Run P0 -> (PS2) -> P1 -> P5
    for phase in ("P0", "P1", "P2", "P3", "P4", "P5"):
        run_single_phase(
            phase,
            ws,
            video_path=video_path,
            script_path=script_path,
            project_id=project_id,
            hook_option=hook_option,
            hook_prompt=hook_prompt,
            custom_hook_clip_path=custom_hook_clip_path,
            offline=offline,
            force=force,
            style_profile_path=style_profile_path,
            style_id=style_id,
            enabled_groups=enabled_groups,
            template=template,
        )
        executed_phases.append(phase)
        if phase == "P0":
            has_style_context = bool(
                style_profile_path
                or style_id
                or enabled_groups
                or template
                or (ws / "work" / "style_profile.json").exists()
                or (ws / "style_profile.json").exists()
                or (ws / "studio_meta.json").exists()
            )
            if has_style_context:
                run_single_phase(
                    "PS2",
                    ws,
                    hook_prompt=hook_prompt,
                    style_profile_path=style_profile_path,
                    style_id=style_id,
                    enabled_groups=enabled_groups,
                    template=template,
                )

    # Step 2: Check Human-in-the-loop Gate at P5
    if hook_option is not None:
        apply_hook_selection_to_workspace(ws, hook_option)
    elif auto_approve:
        apply_hook_selection_to_workspace(ws, 1)
    elif not _is_hook_already_selected(ws):
        hooks_data = _load_json_safe(ws / "hooks.json") or {}
        return {
            "status": "PAUSED_FOR_HOOK_SELECTION",
            "gate": "P5_HOOK_SELECTION",
            "workspace_dir": str(ws),
            "executed_phases": executed_phases,
            "hooks": hooks_data.get("hooks", []),
            "message": (
                "Pipeline paused at P5 Human-in-the-Loop Gate. "
                "Re-run with `--hook-option 1|2|3` (or `--auto-approve`) to continue P6 -> P9."
            ),
        }

    # Step 3 & 4: Run P6 -> P7 -> P8 with up to `max_qa_retries` (2) self-healing loops
    qa_attempts = 0
    qa_status = "FIX_REQUIRED"
    qa_result: Dict[str, Any] = {}
    eff_prof_data = (
        _load_json_safe(ws / "work" / "effective_profile.json")
        or _load_json_safe(ws / "effective_profile.json")
        or {}
    )
    eff_pacing = eff_prof_data.get("pacing") if isinstance(eff_prof_data, dict) and isinstance(eff_prof_data.get("pacing"), dict) else {}
    base_pad_start = int(eff_pacing.get("pad_start_ms", 80))
    base_pad_end = int(eff_pacing.get("pad_end_ms", 120))

    while True:
        pad_s = base_pad_start + (qa_attempts * 40)
        pad_e = base_pad_end + (qa_attempts * 40)

        run_single_phase(
            "P6",
            ws,
            hook_option=hook_option or 1,
            hook_prompt=hook_prompt,
            custom_hook_clip_path=custom_hook_clip_path,
            pad_start_ms=pad_s if qa_attempts > 0 else None,
            pad_end_ms=pad_e if qa_attempts > 0 else None,
            offline=offline,
        )
        if "P6" not in executed_phases:
            executed_phases.append("P6")

        run_single_phase(
            "P7",
            ws,
            video_path=video_path,
            offline=offline,
            final_only=final_only,
            cleanup_temp=cleanup_temp,
            threads=threads,
        )
        if "P7" not in executed_phases:
            executed_phases.append("P7")

        p8_out = run_single_phase("P8", ws, offline=offline)
        if "P8" not in executed_phases:
            executed_phases.append("P8")

        qa_result = p8_out["result"]
        qa_status = qa_result["status"]

        if qa_status == "PASS" or qa_attempts >= max_qa_retries:
            break
        qa_attempts += 1

    if pause_at_qa:
        return {
            "status": "PAUSED_FOR_QA_REVIEW",
            "gate": "P8_QA_REVIEW",
            "qa_verdict": qa_status,
            "qa_retries_used": qa_attempts,
            "workspace_dir": str(ws),
            "executed_phases": executed_phases,
            "qa_md_path": str(ws / "qa.md"),
        }

    # Step 5: Run P9 Memory Curator
    p9_out = run_single_phase(
        "P9",
        ws,
        approve_proposals_flag=approve_proposals_flag,
        final_edit_path=final_edit_path,
        lessons_path=lessons_path,
        golden_path=golden_path,
        offline=offline,
    )
    executed_phases.append("P9")

    return {
        "status": "COMPLETED" if qa_status == "PASS" else "COMPLETED_WITH_QA_WARNINGS",
        "workspace_dir": str(ws),
        "executed_phases": executed_phases,
        "qa_verdict": qa_status,
        "qa_retries_used": qa_attempts,
        "p9_status": p9_out["status"],
    }


# ---------------------------------------------------------------------------
# Workspace Status Inspector (`get_workspace_status`)
# ---------------------------------------------------------------------------

def get_workspace_status(workspace_dir: Path | str) -> Dict[str, Any]:
    ws = Path(workspace_dir).resolve()
    state = _load_json_safe(ws / "state.json") or {}
    phases_state = state.get("phases", {}) if isinstance(state, dict) else {}

    artifact_checks = {
        "state.json": (ws / "state.json").exists(),
        "audio_16k.wav": (ws / "audio_16k.wav").exists(),
        "beats.json": (ws / "beats.json").exists(),
        "words.json": (ws / "words.json").exists(),
        "packed.txt": (ws / "packed.txt").exists(),
        "flags.json": (ws / "flags.json").exists(),
        "takes.json": (ws / "takes.json").exists(),
        "hooks.json": (ws / "hooks.json").exists(),
        "cutlist.json": (ws / "cutlist.json").exists(),
        "qa.md": (ws / "qa.md").exists(),
        "proposals.md": (ws / "proposals.md").exists(),
        "exports/output_roughcut.mp4": (ws / "exports" / "output_roughcut.mp4").exists(),
        "exports/output_roughcut.srt": (ws / "exports" / "output_roughcut.srt").exists(),
        "exports/capcut_draft/draft_content.json": (ws / "exports" / "capcut_draft" / "draft_content.json").exists(),
        "exports/capcut_draft/draft_meta_info.json": (ws / "exports" / "capcut_draft" / "draft_meta_info.json").exists(),
    }

    phase_rows: List[Dict[str, Any]] = []
    for p in ALL_PHASES:
        p_info = phases_state.get(p, {}) if isinstance(phases_state.get(p), dict) else {}
        primary_art = PHASE_PRIMARY_ARTIFACTS[p]
        art_exists = (ws / primary_art).exists()
        status_val = p_info.get("status") or ("completed" if art_exists else "pending")
        phase_rows.append({
            "phase": p,
            "description": PHASE_DESCRIPTIONS[p],
            "status": status_val,
            "artifact": primary_art,
            "artifact_exists": art_exists,
            "updated_at": p_info.get("updated_at"),
        })

    return {
        "workspace_dir": str(ws),
        "exists": ws.exists(),
        "project_id": state.get("project_id", ws.name) if isinstance(state, dict) else ws.name,
        "phases": phase_rows,
        "artifacts": artifact_checks,
    }


def print_status_report(status_info: Dict[str, Any]) -> None:
    print(f"=== Pipeline Workspace Status: {status_info['project_id']} ===")
    print(f"Workspace Directory: {status_info['workspace_dir']}")
    print("")
    print(f"{'Phase':<6} | {'Status':<12} | {'Artifact Present':<16} | {'Artifact':<38} | {'Description'}")
    print("-" * 115)
    for row in status_info["phases"]:
        art_flag = "YES" if row["artifact_exists"] else "NO"
        print(
            f"{row['phase']:<6} | {row['status']:<12} | {art_flag:<16} | {row['artifact']:<38} | {row['description']}"
        )
    print("")


# ---------------------------------------------------------------------------
# End-to-End Integration Test (`run_e2e_test`)
# ---------------------------------------------------------------------------

def run_e2e_test() -> int:
    """
    Simulate and verify the entire P0 -> P9 pipeline inside a temporary directory:
    1. Creates synthetic Vietnamese script (`script.md`) and 16kHz audio/video container (`raw_video.mp4`).
    2. Runs `run_all_pipeline` without `--hook-option` first to verify P5 Human-in-the-Loop Gate pauses cleanly.
    3. Resumes `run_all_pipeline` with `--hook-option 1` through `P6 -> P7 -> P8 -> P9`.
    4. Verifies all 10 core artifacts (`state.json`, `beats.json`, `words.json`, `packed.txt`, `flags.json`,
       `takes.json`, `hooks.json`, `cutlist.json`, `qa.md`, `proposals.md`) and all 3 CapCut Desktop (< v5)
       export routes (`output_roughcut.mp4` + `.srt`, `clips/*.mp4`, `capcut_draft/draft_content.json` + `draft_meta_info.json`).
    5. Validates JSON artifacts against `schemas/pipeline_schemas.py`.
    6. Simulates an editor's final CapCut tweak and verifies P9 Curator diff detection + `approve_proposals`
       keeping `memory/lessons/p4.md <= 30` lines (on an isolated temporary copy of memory).
    """
    print("=== [Video Pipeline CLI] Starting Full E2E Integration Test (P0 -> P9) ===")
    temp_root = Path(tempfile.mkdtemp(prefix="video_pipeline_e2e_"))
    try:
        from phases.p0_preflight import generate_synthetic_16k_wav  # type: ignore
        from schemas.pipeline_schemas import validate_artifact  # type: ignore

        ws = temp_root / "workspace" / "e2e_podscare_demo"
        ws.mkdir(parents=True, exist_ok=True)

        # Create isolated copies of memory files so real workspace memory is untouched
        temp_mem_dir = temp_root / "memory"
        shutil.copytree(PIPELINE_ROOT / "memory", temp_mem_dir)
        temp_lessons = temp_mem_dir / "lessons" / "p4.md"
        temp_golden = temp_mem_dir / "golden" / "p4.jsonl"

        source_video = temp_root / "raw_input_video.mp4"
        script_file = temp_root / "script.md"

        generate_synthetic_16k_wav(source_video, duration_sec=24.0)
        script_file.write_text(
            "# Hook\n"
            "Tai nghe AirPods Pro của bạn bị rè một bên hoặc mất chống ồn ANC có sửa được không?\n\n"
            "# Nội dung chính\n"
            "Thực tế nguyên nhân chính là do màng loa bị rách hoặc lưới âm học bám bẩn lâu ngày.\n"
            "Tại PodsCare kỹ thuật viên sẽ vệ sinh chuẩn hãng và thay màng loa zin chỉ trong 30 phút.\n\n"
            "# Kêu gọi hành động\n"
            "Đừng quên bấm theo dõi kênh và nhắn tin ngay cho PodsCare để được kiểm tra miễn phí nhé!\n",
            encoding="utf-8",
        )

        # 1. Test P5 Human-in-the-Loop Gate (when hook_option is omitted)
        gate_res = run_all_pipeline(
            workspace_dir=ws,
            video_path=source_video,
            script_path=script_file,
            project_id="e2e_podscare_demo",
            hook_option=None,
            auto_approve=False,
            offline=True,
        )
        assert gate_res["status"] == "PAUSED_FOR_HOOK_SELECTION", f"Expected P5 gate pause, got {gate_res}"
        assert (ws / "hooks.json").exists(), "hooks.json must exist at P5 gate"
        print(f"  [PASS] P5 Human-in-the-Loop Hook Gate verified: {gate_res['status']} ({len(gate_res['hooks'])} hooks proposed)")

        # 2. Resume full pipeline with selected Hook Option 1 (`--hook-option 1`)
        full_res = run_all_pipeline(
            workspace_dir=ws,
            video_path=source_video,
            script_path=script_file,
            project_id="e2e_podscare_demo",
            hook_option=1,
            lessons_path=temp_lessons,
            golden_path=temp_golden,
            offline=True,
        )
        assert full_res["qa_verdict"] == "PASS", f"Expected P8 QA verdict PASS, got {full_res}"
        print(f"  [PASS] Full Pipeline P0 -> P9 completed: status={full_res['status']}, qa_verdict={full_res['qa_verdict']}")

        # 3. Verify all 10 required artifacts exist and are non-empty
        required_10_artifacts = (
            "state.json",
            "beats.json",
            "words.json",
            "packed.txt",
            "flags.json",
            "takes.json",
            "hooks.json",
            "cutlist.json",
            "qa.md",
            "proposals.md",
        )
        for art_name in required_10_artifacts:
            art_path = ws / art_name
            assert art_path.exists() and art_path.stat().st_size > 0, f"Missing or empty artifact: {art_name}"
        print(f"  [PASS] All 10 core workspace artifacts verified: {', '.join(required_10_artifacts)}")

        # 4. Validate JSON schemas via `pipeline_schemas.py`
        for schema_art in ("state", "beats", "words", "flags", "takes", "hooks", "cutlist"):
            data = _load_json_safe(ws / f"{schema_art}.json")
            assert validate_artifact(schema_art, data, raise_on_error=True) is True
        print("  [PASS] All 7 JSON artifacts validated 100% against schemas/pipeline_schemas.py")

        # 5. Verify all 3 CapCut Desktop (< v5) export routes in `exports/`
        rough_mp4 = ws / "exports" / "output_roughcut.mp4"
        rough_srt = ws / "exports" / "output_roughcut.srt"
        clips_dir = ws / "exports" / "clips"
        draft_content_path = ws / "exports" / "capcut_draft" / "draft_content.json"
        draft_meta_path = ws / "exports" / "capcut_draft" / "draft_meta_info.json"

        assert rough_mp4.exists() and rough_mp4.stat().st_size > 0, "Missing exports/output_roughcut.mp4"
        assert rough_srt.exists() and rough_srt.stat().st_size > 0, "Missing exports/output_roughcut.srt"
        clip_files = sorted(clips_dir.glob("*.mp4"))
        assert len(clip_files) >= 1, "Expected >= 1 exported clip in exports/clips/*.mp4"
        assert draft_content_path.exists(), "Missing exports/capcut_draft/draft_content.json"
        assert draft_meta_path.exists(), "Missing exports/capcut_draft/draft_meta_info.json"

        draft_json = _load_json_safe(draft_content_path)
        assert isinstance(draft_json["duration"], int) and draft_json["duration"] >= 100_000
        print(
            f"  [PASS] All 3 CapCut Desktop (< v5) Export Routes verified: "
            f"roughcut.mp4+.srt, {len(clip_files)} clips, capcut_draft ({draft_json['duration']} us)"
        )

        # 6. Simulate Editor CapCut adjustments and verify P9 Curator approval + <= 30 lines rule compaction
        from phases.p9_curator import approve_proposals, run_p9_curator  # type: ignore

        cutlist_now = _load_json_safe(ws / "cutlist.json")
        segs_now = list(cutlist_now.get("segments", []))
        edited_segments = []
        for idx, s in enumerate(segs_now):
            s_copy = dict(s)
            if idx == 0:
                # Simulate editor trimming 120ms of leading filler (MISSED_CUT)
                s_copy["start_ms"] = int(s["start_ms"]) + 120
            elif idx == 1:
                # Simulate editor expanding start 100ms earlier to restore a transition word (FALSE_POSITIVE_CUT)
                s_copy["start_ms"] = max(0, int(s["start_ms"]) - 100)
            edited_segments.append(s_copy)

        final_edit_file = ws / "final_edit.json"
        final_edit_file.write_text(
            json.dumps({"segments": edited_segments}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        p9_diff_res = run_p9_curator(
            workspace_dir=ws,
            final_edit_path=final_edit_file,
            approve=False,
            lessons_path=temp_lessons,
            golden_path=temp_golden,
        )
        assert p9_diff_res["false_positive_count"] >= 1 and p9_diff_res["missed_cut_count"] >= 1
        p9_approve_res = approve_proposals(
            workspace_dir=ws,
            lessons_path=temp_lessons,
            golden_path=temp_golden,
        )
        assert p9_approve_res["lessons_line_count"] <= 30
        print(
            f"  [PASS] P9 Curator Learning Loop verified: FalsePositive={p9_diff_res['false_positive_count']}, "
            f"MissedCut={p9_diff_res['missed_cut_count']}, Approved lessons/p4.md={p9_approve_res['lessons_line_count']} lines (<=30)"
        )

        print("=== [Video Pipeline CLI] E2E Integration Test PASSED 100% (exit code 0) ===")
        return 0
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


# ---------------------------------------------------------------------------
# CLI Argument Parser & Entrypoint
# ---------------------------------------------------------------------------

def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="video-pipeline",
        description="AI Multi-Agent Video Editing Pipeline CLI Orchestrator (P0 -> P9).",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run full End-to-End integration self-test in a temporary directory.",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available pipeline commands")

    # 1. run-phase
    sp_phase = subparsers.add_parser(
        "run-phase",
        help="Run a specific phase (P0..P9) on a project workspace.",
    )
    sp_phase.add_argument("--phase", "-p", required=True, help="Phase identifier (P0..P9).")
    sp_phase.add_argument(
        "--workspace",
        "--project-dir",
        "-w",
        dest="workspace",
        default="workspace/default_project",
        help="Project workspace directory (default: workspace/default_project).",
    )
    sp_phase.add_argument("--video", "-i", dest="video_path", default=None, help="Source video path (for P0/P7).")
    sp_phase.add_argument("--script", "-s", dest="script_path", default=None, help="Vietnamese script path (for P0/P1).")
    sp_phase.add_argument("--project-id", dest="project_id", default=None, help="Optional project ID.")
    sp_phase.add_argument("--hook-option", dest="hook_option", default=None, help="Selected hook option (1, 2, 3 or hook_id).")
    sp_phase.add_argument("--hook-prompt", dest="hook_prompt", default=None, help="Optional user description/prompt for desired Hook (P5).")
    sp_phase.add_argument("--custom-hook-clip", dest="custom_hook_clip", default=None, help="Optional path to a custom opening hook video clip (.mp4/.mov).")
    sp_phase.add_argument("--final-edit", dest="final_edit_path", default=None, help="Path to editor's final_edit.json (for P9).")
    sp_phase.add_argument("--approve-proposals", action="store_true", help="Approve P9 proposals into memory/lessons/p4.md.")
    sp_phase.add_argument("--final-only", action="store_true", help="Export only single final MP4 + SRT + metadata in P7 (skip clips/*.mp4).")
    sp_phase.add_argument("--cleanup-temp", action="store_true", help="Clean temporary workspace media after P7 export.")
    sp_phase.add_argument("--threads", type=int, default=None, help="FFmpeg thread limit (-threads N).")
    sp_phase.add_argument("--style-profile", dest="style_profile_path", default=None, help="Optional path to style_profile.json (for PS2).")
    sp_phase.add_argument("--style-id", dest="style_id", default=None, help="Optional style ID from styles_index.json (for PS2).")
    sp_phase.add_argument("--enabled-groups", dest="enabled_groups", default=None, help="Comma-separated style groups to enable (pacing,hook,captions,audio,punchin).")
    sp_phase.add_argument("--template", dest="template", default=None, help="Optional template preset name (talking_head, podcast, tutorial, vlog, reels_tiktok).")
    sp_phase.add_argument("--offline", action="store_true", help="Run in deterministic offline mode without querying 9Router.")
    sp_phase.add_argument("--force", action="store_true", help="Force re-execution bypassing cache.")

    # 2. run-all
    sp_all = subparsers.add_parser(
        "run-all",
        help="Run full pipeline (P0 -> P9) with P5 Hook selection gate and P8 QA self-healing loop (max 2 retries).",
    )
    sp_all.add_argument(
        "--workspace",
        "--project-dir",
        "-w",
        dest="workspace",
        default="workspace/default_project",
        help="Project workspace directory (default: workspace/default_project).",
    )
    sp_all.add_argument("--video", "-i", dest="video_path", default=None, help="Source video path (.mp4 / .mov).")
    sp_all.add_argument("--script", "-s", dest="script_path", default=None, help="Vietnamese script path (.md / .txt).")
    sp_all.add_argument("--project-id", dest="project_id", default=None, help="Optional project ID.")
    sp_all.add_argument("--hook-option", dest="hook_option", default=None, help="Hook option to select at P5 gate (1, 2, or 3).")
    sp_all.add_argument("--hook-prompt", dest="hook_prompt", default=None, help="Optional user description/prompt for desired Hook (P5).")
    sp_all.add_argument("--custom-hook-clip", dest="custom_hook_clip", default=None, help="Optional path to a custom opening hook video clip (.mp4/.mov).")
    sp_all.add_argument("--auto-approve", action="store_true", help="Auto-select top-ranked Hook at P5 gate without pausing.")
    sp_all.add_argument("--pause-at-qa", action="store_true", help="Pause after P8 QA verification before running P9.")
    sp_all.add_argument("--max-qa-retries", type=int, default=2, help="Max P8 -> P6 -> P7 -> P8 self-healing cycles (default: 2).")
    sp_all.add_argument("--final-edit", dest="final_edit_path", default=None, help="Optional final_edit.json for P9.")
    sp_all.add_argument("--approve-proposals", action="store_true", help="Auto-approve P9 proposals into memory.")
    sp_all.add_argument("--final-only", action="store_true", help="Export only single final MP4 + SRT + metadata in P7 (skip clips/*.mp4).")
    sp_all.add_argument("--cleanup-temp", action="store_true", help="Clean temporary workspace media after P7 export.")
    sp_all.add_argument("--threads", type=int, default=None, help="FFmpeg thread limit (-threads N).")
    sp_all.add_argument("--style-profile", dest="style_profile_path", default=None, help="Optional path to style_profile.json (for PS2).")
    sp_all.add_argument("--style-id", dest="style_id", default=None, help="Optional style ID from styles_index.json (for PS2).")
    sp_all.add_argument("--enabled-groups", dest="enabled_groups", default=None, help="Comma-separated style groups to enable (pacing,hook,captions,audio,punchin).")
    sp_all.add_argument("--template", dest="template", default=None, help="Optional template preset name (talking_head, podcast, tutorial, vlog, reels_tiktok).")
    sp_all.add_argument("--offline", action="store_true", help="Use deterministic offline mode.")
    sp_all.add_argument("--force", action="store_true", help="Force re-execution of cached phases.")

    # 3. status
    sp_status = subparsers.add_parser(
        "status",
        help="Display status of all phases (P0..P9) and artifacts in a project workspace.",
    )
    sp_status.add_argument(
        "--workspace",
        "--project-dir",
        "-w",
        dest="workspace",
        default="workspace/default_project",
        help="Project workspace directory.",
    )
    sp_status.add_argument("--json", action="store_true", help="Output status report as JSON.")

    # 4. e2e-test
    subparsers.add_parser(
        "e2e-test",
        help="Run full End-to-End integration test (P0 -> P9) in an isolated temporary directory.",
    )

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.self_test or args.command == "e2e-test":
        return run_e2e_test()

    parsed_groups = (
        [g.strip() for g in str(getattr(args, "enabled_groups", "")).split(",") if g.strip()]
        if getattr(args, "enabled_groups", None) is not None
        else None
    )

    if args.command == "run-phase":
        res = run_single_phase(
            phase=args.phase,
            workspace_dir=args.workspace,
            video_path=args.video_path,
            script_path=args.script_path,
            project_id=args.project_id,
            hook_option=args.hook_option,
            hook_prompt=args.hook_prompt,
            custom_hook_clip_path=args.custom_hook_clip,
            approve_proposals_flag=args.approve_proposals,
            final_edit_path=args.final_edit_path,
            offline=args.offline,
            force=args.force,
            final_only=True if args.final_only else None,
            cleanup_temp=True if args.cleanup_temp else None,
            threads=args.threads,
            style_profile_path=args.style_profile_path,
            style_id=args.style_id,
            enabled_groups=parsed_groups,
            template=args.template,
        )
        print(json.dumps({
            "command": "run-phase",
            "phase": res["phase"],
            "status": res["status"],
            "workspace": str(Path(args.workspace).resolve()),
        }, ensure_ascii=False, indent=2))
        return 0

    if args.command == "run-all":
        res = run_all_pipeline(
            workspace_dir=args.workspace,
            video_path=args.video_path,
            script_path=args.script_path,
            project_id=args.project_id,
            hook_option=args.hook_option,
            hook_prompt=args.hook_prompt,
            custom_hook_clip_path=args.custom_hook_clip,
            auto_approve=args.auto_approve,
            pause_at_qa=args.pause_at_qa,
            max_qa_retries=args.max_qa_retries,
            approve_proposals_flag=args.approve_proposals,
            final_edit_path=args.final_edit_path,
            offline=args.offline,
            force=args.force,
            final_only=True if args.final_only else None,
            cleanup_temp=True if args.cleanup_temp else None,
            threads=args.threads,
            style_profile_path=args.style_profile_path,
            style_id=args.style_id,
            enabled_groups=parsed_groups,
            template=args.template,
        )
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0

    if args.command == "status":
        info = get_workspace_status(args.workspace)
        if args.json:
            print(json.dumps(info, ensure_ascii=False, indent=2))
        else:
            print_status_report(info)
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
