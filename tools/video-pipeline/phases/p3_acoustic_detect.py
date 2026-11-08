#!/usr/bin/env python3
"""Phase 3 (P3): Pure-Python Acoustic & Disfluency Detector (`p3_acoustic_detect.py`).

Analyzes `audio_16k.wav` (16kHz PCM waveform RMS/VAD energy) together with
word-level timestamps in `words.json` to detect:
- Silences (`SILENCE`, e.g., >= 500ms or configurable threshold)
- Audible breaths (`BREATH`, low-to-moderate RMS energy in inter-word gaps)
- Vietnamese fillers & hesitations (`FILLER`: "ừm", "à", "ờ", "kiểu như", "thì là", "ờm"...)
- Word/phrase repetitions & false starts (`DISFLUENCY` / `REPEAT` / `STUTTER`)

Outputs:
1. `packed.txt`: Token-compressed segment representation (>70% token savings):
   `s01 | 00:01.20-00:04.50 | (#w1-#w8) Nội dung câu... [SILENCE: 1.2s]`
2. `flags.json`: Structured acoustic & disfluency flags + compression statistics.
"""

from __future__ import annotations

import argparse
import array
import json
import math
import re
import struct
import sys
import tempfile
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

DEFAULT_SILENCE_THRESHOLD_MS = 500
DEFAULT_BREATH_MIN_MS = 140
DEFAULT_BREATH_MAX_MS = 900

DEFAULT_SINGLE_FILLERS = {
    "ừm",
    "à",
    "ờ",
    "ờm",
    "ưm",
    "ơ",
    "ư",
    "hả",
}

DEFAULT_MULTI_FILLERS = [
    ("kiểu", "như", "là"),
    ("nói", "chung", "là"),
    ("kiểu", "như"),
    ("thì", "là"),
    ("nghĩa", "là"),
    ("đại", "loại"),
    ("đại", "khái"),
    ("như", "là"),
    ("à", "ừm"),
    ("ờ", "ừm"),
    ("ờ", "thì"),
]


def _clean_token(tok: str) -> str:
    return tok.strip(" ,.!?;:()[]\"'“”‘’…-").lower()


def _load_profile_settings(
    profile_path: Optional[Union[str, Path]] = None,
    workspace_dir: Optional[Union[str, Path]] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Load silence and filler settings from memory/profile.yaml and work/effective_profile.json if available."""
    p = Path(profile_path) if profile_path and str(profile_path).endswith((".yaml", ".yml")) else (PIPELINE_ROOT / "memory" / "profile.yaml")
    settings: Dict[str, Any] = {
        "silence_threshold_ms": DEFAULT_SILENCE_THRESHOLD_MS,
        "max_silence_ms": 650,
        "min_silence_ms": DEFAULT_SILENCE_THRESHOLD_MS,
        "target_pause_median_ms": 240,
        "style_id": None,
        "single_fillers": set(DEFAULT_SINGLE_FILLERS),
        "multi_fillers": list(DEFAULT_MULTI_FILLERS),
        "protected_words": set(),
    }
    if p.exists():
        try:
            import yaml  # type: ignore

            data = yaml.safe_load(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                ac = data.get("acoustic_detection", {}) if isinstance(data.get("acoustic_detection"), dict) else {}
                soft_sil = ac.get("soft_silence_threshold_ms") or data.get("min_silence_ms")
                if isinstance(soft_sil, (int, float)) and soft_sil > 0:
                    settings["silence_threshold_ms"] = int(soft_sil)
                    settings["min_silence_ms"] = int(soft_sil)
                for fw in data.get("filler_words", []) or []:
                    if isinstance(fw, str) and fw.strip():
                        parts = tuple(_clean_token(x) for x in fw.strip().split() if _clean_token(x))
                        if len(parts) == 1 and parts[0] != "kiểu":
                            settings["single_fillers"].add(parts[0])
                        elif len(parts) >= 2 and parts not in settings["multi_fillers"]:
                            settings["multi_fillers"].append(parts)
                for pw in data.get("protected_words", []) or []:
                    if isinstance(pw, str) and pw.strip():
                        settings["protected_words"].add(pw.strip().lower())
        except Exception:
            pass

    # Overlay effective_profile.json (Stage S2) when present
    eff_data = effective_profile
    if eff_data is None:
        cand_paths: List[Path] = []
        if profile_path and str(profile_path).endswith(".json"):
            cand_paths.append(Path(profile_path))
        if workspace_dir:
            ws = Path(workspace_dir)
            cand_paths.extend([
                ws / "work" / "effective_profile.json",
                ws / "effective_profile.json",
            ])
        for cp in cand_paths:
            if cp.exists():
                try:
                    loaded = json.loads(cp.read_text(encoding="utf-8"))
                    if isinstance(loaded, dict):
                        eff_data = loaded
                        break
                except Exception:
                    pass

    if isinstance(eff_data, dict):
        if eff_data.get("style_id"):
            settings["style_id"] = str(eff_data["style_id"])
        pacing = eff_data.get("pacing") if isinstance(eff_data.get("pacing"), dict) else {}
        if isinstance(pacing.get("silence_threshold_ms"), (int, float)) and pacing["silence_threshold_ms"] > 0:
            settings["silence_threshold_ms"] = int(round(float(pacing["silence_threshold_ms"])))
        if isinstance(pacing.get("max_silence_ms"), (int, float)) and pacing["max_silence_ms"] > 0:
            settings["max_silence_ms"] = int(round(float(pacing["max_silence_ms"])))
        if isinstance(pacing.get("min_silence_ms"), (int, float)) and pacing["min_silence_ms"] > 0:
            settings["min_silence_ms"] = int(round(float(pacing["min_silence_ms"])))
        if isinstance(pacing.get("target_pause_median_ms"), (int, float)) and pacing["target_pause_median_ms"] >= 0:
            settings["target_pause_median_ms"] = int(round(float(pacing["target_pause_median_ms"])))

    return settings


class WavEnergyAnalyzer:
    """Pure-Python 16kHz PCM WAV waveform reader for RMS & dBFS energy analysis."""

    def __init__(self, audio_path: Optional[Union[str, Path]] = None) -> None:
        self.audio_path = Path(audio_path) if audio_path else None
        self.sample_rate: int = 16000
        self.samples: Optional[array.array] = None
        self.duration_ms: int = 0
        self._load()

    def _load(self) -> None:
        if not self.audio_path or not self.audio_path.exists() or self.audio_path.stat().st_size == 0:
            return
        try:
            with wave.open(str(self.audio_path), "rb") as wf:
                channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                self.sample_rate = wf.getframerate() or 16000
                nframes = wf.getnframes()
                raw_bytes = wf.readframes(nframes)

            if sampwidth == 2:
                arr = array.array("h")
                arr.frombytes(raw_bytes)
                if sys.byteorder == "big":
                    arr.byteswap()
                if channels > 1:
                    arr = array.array("h", arr[0::channels])
                self.samples = arr
                self.duration_ms = int(round((len(arr) / float(self.sample_rate)) * 1000.0))
        except Exception:
            self.samples = None

    @property
    def has_waveform(self) -> bool:
        return self.samples is not None and len(self.samples) > 0

    def window_rms(self, start_ms: int, end_ms: int) -> Tuple[float, float]:
        """Compute normalized RMS (0.0..1.0) and dBFS (-96.0..0.0) for [start_ms, end_ms]."""
        if not self.has_waveform or self.samples is None or end_ms <= start_ms:
            return 0.0, -96.0
        s_idx = max(0, int((start_ms / 1000.0) * self.sample_rate))
        e_idx = min(len(self.samples), int((end_ms / 1000.0) * self.sample_rate))
        if e_idx <= s_idx:
            return 0.0, -96.0
        window = self.samples[s_idx:e_idx]
        # Subsample if window is huge for speed
        step = 1 if len(window) <= 8000 else max(1, len(window) // 4000)
        sq_sum = 0.0
        count = 0
        for val in window[::step]:
            sq_sum += float(val) * float(val)
            count += 1
        if count == 0:
            return 0.0, -96.0
        rms_raw = math.sqrt(sq_sum / count)
        norm_rms = min(1.0, rms_raw / 32768.0)
        if norm_rms <= 1e-5:
            return round(norm_rms, 6), -96.0
        dbfs = max(-96.0, round(20.0 * math.log10(norm_rms), 2))
        return round(norm_rms, 6), dbfs

    def detect_breath_in_gap(
        self,
        gap_start_ms: int,
        gap_end_ms: int,
    ) -> Optional[Dict[str, Any]]:
        """Scan an inter-word gap for a short low-to-moderate energy breath burst."""
        if not self.has_waveform:
            return None
        gap_dur = gap_end_ms - gap_start_ms
        if gap_dur < DEFAULT_BREATH_MIN_MS:
            return None

        # Scan in 100ms sliding windows (step 50ms) inside the gap
        win_ms = min(220, gap_dur)
        step_ms = max(40, win_ms // 2)
        best_window: Optional[Dict[str, Any]] = None

        cur = gap_start_ms
        while cur + win_ms <= gap_end_ms:
            norm_rms, dbfs = self.window_rms(cur, cur + win_ms)
            # Breath acoustic signature: above silence floor (0.006 / -44 dBFS) and below loud voiced speech (0.11 / -19 dBFS)
            if 0.006 <= norm_rms <= 0.11:
                if best_window is None or norm_rms > best_window["rms"]:
                    best_window = {
                        "start_ms": cur,
                        "end_ms": cur + win_ms,
                        "duration_ms": win_ms,
                        "rms": norm_rms,
                        "dbfs": dbfs,
                    }
            cur += step_ms

        return best_window


def _load_words_any(words_input: Union[str, Path, Dict[str, Any], List[Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any], str]:
    """Load `words.json` from path, dict, or list, returning (words_list, meta_dict, raw_json_text)."""
    if isinstance(words_input, (str, Path)):
        p = Path(words_input)
        raw_text = p.read_text(encoding="utf-8")
        data = json.loads(raw_text)
    else:
        data = words_input
        raw_text = json.dumps(data, ensure_ascii=False, indent=2)

    if isinstance(data, dict):
        words_list = data.get("words", [])
        return (words_list if isinstance(words_list, list) else []), data, raw_text
    if isinstance(data, list):
        return data, {"words": data}, raw_text
    raise ValueError("Invalid words input format; expected JSON object with 'words' or JSON list.")


def format_mm_ss_xx(ms: int) -> str:
    """Format milliseconds as `MM:SS.xx` (e.g. 1200 -> `00:01.20`)."""
    clamped = max(0, int(round(ms)))
    total_centiseconds = int(round(clamped / 10.0))
    minutes = total_centiseconds // 6000
    rem = total_centiseconds % 6000
    seconds = rem // 100
    cs = rem % 100
    return f"{minutes:02d}:{seconds:02d}.{cs:02d}"


def format_silence_sec(duration_ms: int) -> str:
    """Format silence duration in seconds for `[SILENCE: Xs]` tag (e.g., 1200 -> `1.2s`, 1250 -> `1.25s`)."""
    sec = duration_ms / 1000.0
    rounded_2 = round(sec, 2)
    if abs(rounded_2 * 10 - round(rounded_2 * 10)) < 1e-6:
        return f"{rounded_2:.1f}s"
    return f"{rounded_2:.2f}s"


def detect_fillers_and_disfluencies(
    words: Sequence[Dict[str, Any]],
    single_fillers: set,
    multi_fillers: Sequence[Tuple[str, ...]],
    protected_words: set,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, List[str]]]:
    """Detect Vietnamese filler words/phrases and immediate word/phrase repetitions."""
    fillers: List[Dict[str, Any]] = []
    disfluencies: List[Dict[str, Any]] = []
    word_tags: Dict[str, List[str]] = {}

    n = len(words)
    cleaned_tokens = [_clean_token(str(w.get("text") or w.get("word") or "")) for w in words]
    consumed_filler_indices = set()

    # 1. Detect multi-word Vietnamese fillers first (longest match)
    sorted_multi = sorted(multi_fillers, key=len, reverse=True)
    for i in range(n):
        if i in consumed_filler_indices:
            continue
        for phrase in sorted_multi:
            plen = len(phrase)
            if i + plen <= n and tuple(cleaned_tokens[i : i + plen]) == phrase:
                span_words = words[i : i + plen]
                w_ids = [str(w.get("word_id", f"w{i + k + 1}")) for k, w in enumerate(span_words)]
                phrase_text = " ".join(str(w.get("text") or w.get("word") or "") for w in span_words)
                s_ms = int(span_words[0]["start_ms"])
                e_ms = int(span_words[-1]["end_ms"])
                f_entry = {
                    "flag_id": f"fil_{len(fillers) + 1:02d}",
                    "type": "FILLER",
                    "word_id": w_ids[0],
                    "word_ids": w_ids,
                    "text": phrase_text,
                    "start_ms": s_ms,
                    "end_ms": e_ms,
                    "duration_ms": max(1, e_ms - s_ms),
                    "confidence": round(
                        sum(float(w.get("confidence", 0.8)) for w in span_words) / plen,
                        3,
                    ),
                    "reason": f"Multi-word Vietnamese filler phrase '{phrase_text}'",
                }
                fillers.append(f_entry)
                for idx_k in range(i, i + plen):
                    consumed_filler_indices.add(idx_k)
                word_tags.setdefault(w_ids[0], []).append(f"FILLER:{phrase_text}")
                break

    # 2. Detect single-word Vietnamese fillers
    for i, w in enumerate(words):
        if i in consumed_filler_indices:
            continue
        tok = cleaned_tokens[i]
        if not tok or tok in protected_words:
            continue
        is_marked = bool(w.get("is_filler")) and tok in (single_fillers | {"kiểu", "thì"})
        if tok in single_fillers or is_marked:
            wid = str(w.get("word_id", f"w{i + 1}"))
            s_ms = int(w["start_ms"])
            e_ms = int(w["end_ms"])
            orig_text = str(w.get("text") or w.get("word") or tok)
            fillers.append(
                {
                    "flag_id": f"fil_{len(fillers) + 1:02d}",
                    "type": "FILLER",
                    "word_id": wid,
                    "word_ids": [wid],
                    "text": orig_text,
                    "start_ms": s_ms,
                    "end_ms": e_ms,
                    "duration_ms": max(1, e_ms - s_ms),
                    "confidence": float(w.get("confidence", 0.7)),
                    "reason": f"Vietnamese filler token '{orig_text}'",
                }
            )
            consumed_filler_indices.add(i)
            word_tags.setdefault(wid, []).append(f"FILLER:{orig_text}")

    # 3. Detect immediate word repetitions & bigram stutters
    i = 0
    while i < n - 1:
        tok = cleaned_tokens[i]
        if tok and tok not in protected_words and tok == cleaned_tokens[i + 1]:
            w1, w2 = words[i], words[i + 1]
            # Only treat as disfluency if gap between repeated words is < 1000ms
            if int(w2["start_ms"]) - int(w1["end_ms"]) < 1000:
                wid1 = str(w1.get("word_id", f"w{i + 1}"))
                wid2 = str(w2.get("word_id", f"w{i + 2}"))
                rep_text = f"{w1.get('text') or w1.get('word')} {w2.get('text') or w2.get('word')}"
                s_ms = int(w1["start_ms"])
                e_ms = int(w2["end_ms"])
                disfluencies.append(
                    {
                        "flag_id": f"dis_{len(disfluencies) + 1:02d}",
                        "type": "REPEAT",
                        "subtype": "word_repetition",
                        "word_ids": [wid1, wid2],
                        "text": rep_text,
                        "start_ms": s_ms,
                        "end_ms": e_ms,
                        "duration_ms": max(1, e_ms - s_ms),
                        "reason": f"Immediate repeated word '{tok}'",
                    }
                )
                word_tags.setdefault(wid1, []).append(f"REPEAT:{tok}")
                i += 2
                continue
        # Check bigram repetition: w[i] w[i+1] == w[i+2] w[i+3]
        if (
            i + 3 < n
            and cleaned_tokens[i]
            and cleaned_tokens[i + 1]
            and (cleaned_tokens[i], cleaned_tokens[i + 1]) == (cleaned_tokens[i + 2], cleaned_tokens[i + 3])
        ):
            span = words[i : i + 4]
            w_ids = [str(w.get("word_id", f"w{i + k + 1}")) for k, w in enumerate(span)]
            rep_text = " ".join(str(w.get("text") or w.get("word")) for w in span)
            s_ms = int(span[0]["start_ms"])
            e_ms = int(span[-1]["end_ms"])
            disfluencies.append(
                {
                    "flag_id": f"dis_{len(disfluencies) + 1:02d}",
                    "type": "REPEAT",
                    "subtype": "bigram_repetition",
                    "word_ids": w_ids,
                    "text": rep_text,
                    "start_ms": s_ms,
                    "end_ms": e_ms,
                    "duration_ms": max(1, e_ms - s_ms),
                    "reason": "Immediate repeated 2-word phrase",
                }
            )
            word_tags.setdefault(w_ids[0], []).append("REPEAT:phrase")
            i += 4
            continue
        i += 1

    return fillers, disfluencies, word_tags


def detect_acoustics(
    words_input: Union[str, Path, Dict[str, Any], List[Any]],
    audio_path: Optional[Union[str, Path]] = None,
    packed_output_path: Optional[Union[str, Path]] = None,
    flags_output_path: Optional[Union[str, Path]] = None,
    project_id: str = "default",
    silence_threshold_ms: Optional[int] = None,
    profile_path: Optional[Union[str, Path]] = None,
    workspace_dir: Optional[Union[str, Path]] = None,
    effective_profile: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Dict[str, Any]]:
    """Run acoustic & text disfluency analysis, returning `(packed_txt_content, flags_dict)`."""
    inferred_ws = workspace_dir
    if inferred_ws is None and isinstance(words_input, (str, Path)):
        inferred_ws = Path(words_input).resolve().parent
    elif inferred_ws is None and flags_output_path is not None:
        inferred_ws = Path(flags_output_path).resolve().parent

    profile_cfg = _load_profile_settings(
        profile_path=profile_path,
        workspace_dir=inferred_ws,
        effective_profile=effective_profile,
    )
    eff_silence_ms = (
        int(silence_threshold_ms)
        if silence_threshold_ms is not None
        else int(profile_cfg.get("silence_threshold_ms", DEFAULT_SILENCE_THRESHOLD_MS))
    )

    raw_words, words_meta, raw_words_json_text = _load_words_any(words_input)
    if not raw_words:
        raise ValueError("words.json contains no words to analyze.")

    # Normalize word entries
    words: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_words):
        wid = str(item.get("word_id") or f"w{idx + 1}")
        txt = str(item.get("text") if item.get("text") is not None else item.get("word", "")).strip()
        s_ms = int(round(float(item.get("start_ms", 0))))
        e_ms = int(round(float(item.get("end_ms", s_ms + 150))))
        if e_ms <= s_ms:
            e_ms = s_ms + 100
        words.append(
            {
                "word_id": wid,
                "text": txt,
                "word": txt,
                "start_ms": s_ms,
                "end_ms": e_ms,
                "confidence": float(item.get("confidence", 0.92)),
                "is_filler": bool(item.get("is_filler", False)),
            }
        )

    analyzer = WavEnergyAnalyzer(audio_path)

    # 1. Detect inter-word silences and breaths
    silences: List[Dict[str, Any]] = []
    breaths: List[Dict[str, Any]] = []
    gap_after_index: Dict[int, Dict[str, Any]] = {}
    breath_after_index: Dict[int, Dict[str, Any]] = {}

    for i in range(len(words) - 1):
        w_cur = words[i]
        w_next = words[i + 1]
        gap_start = int(w_cur["end_ms"])
        gap_end = int(w_next["start_ms"])
        gap_ms = gap_end - gap_start
        if gap_ms <= 0:
            continue

        norm_rms, dbfs = analyzer.window_rms(gap_start, gap_end)

        # Check for breath inside the gap
        breath_hit = analyzer.detect_breath_in_gap(gap_start, gap_end)
        if breath_hit is not None:
            b_entry = {
                "flag_id": f"br_{len(breaths) + 1:02d}",
                "type": "BREATH",
                "start_ms": int(breath_hit["start_ms"]),
                "end_ms": int(breath_hit["end_ms"]),
                "duration_ms": int(breath_hit["duration_ms"]),
                "after_word_id": w_cur["word_id"],
                "before_word_id": w_next["word_id"],
                "rms": breath_hit["rms"],
                "dbfs": breath_hit["dbfs"],
                "reason": "Audible breath energy detected in inter-word gap",
            }
            breaths.append(b_entry)
            breath_after_index[i] = b_entry

        if gap_ms >= eff_silence_ms:
            dur_s = round(gap_ms / 1000.0, 2)
            sil_tag = f"[SILENCE: {format_silence_sec(gap_ms)}]"
            s_entry = {
                "flag_id": f"sil_{len(silences) + 1:02d}",
                "type": "SILENCE",
                "start_ms": gap_start,
                "end_ms": gap_end,
                "duration_ms": gap_ms,
                "duration_s": dur_s,
                "after_word_id": w_cur["word_id"],
                "before_word_id": w_next["word_id"],
                "rms": norm_rms,
                "dbfs": dbfs,
                "text": sil_tag,
                "reason": f"Inter-word silence of {gap_ms}ms (>= {eff_silence_ms}ms)",
            }
            silences.append(s_entry)
            gap_after_index[i] = s_entry

    # 2. Detect Vietnamese fillers and disfluencies
    fillers, disfluencies, _ = detect_fillers_and_disfluencies(
        words=words,
        single_fillers=profile_cfg["single_fillers"],
        multi_fillers=profile_cfg["multi_fillers"],
        protected_words=profile_cfg["protected_words"],
    )

    filler_word_id_map: Dict[str, str] = {}
    for f_item in fillers:
        for wid in f_item.get("word_ids", []):
            filler_word_id_map[str(wid)] = f_item["text"]

    disfluency_word_ids = {
        str(wid)
        for d_item in disfluencies
        for wid in d_item.get("word_ids", [])
    }

    # 3. Group words into compact segments (s01, s02, ...)
    segments: List[Dict[str, Any]] = []
    packed_lines: List[str] = []

    seg_start_idx = 0
    for i in range(len(words)):
        is_last = i == len(words) - 1
        has_long_silence = i in gap_after_index
        tok_text = words[i]["text"]
        ends_punct = tok_text.endswith((".", "!", "?"))
        seg_len = i - seg_start_idx + 1
        small_pause = (
            not is_last
            and (int(words[i + 1]["start_ms"]) - int(words[i]["end_ms"])) >= 220
        )

        should_break = (
            is_last
            or has_long_silence
            or (ends_punct and (seg_len >= 4 or small_pause))
            or seg_len >= 16
        )
        if not should_break:
            continue

        seg_words = words[seg_start_idx : i + 1]
        seg_id = f"s{len(segments) + 1:02d}"
        s_ms = int(seg_words[0]["start_ms"])
        e_ms = int(seg_words[-1]["end_ms"])
        w_start_id = seg_words[0]["word_id"]
        w_end_id = seg_words[-1]["word_id"]
        seg_text = " ".join(w["text"] for w in seg_words)

        # Collect inline acoustic/filler tags for this segment
        seg_fillers: List[str] = []
        seen_fil = set()
        for w in seg_words:
            wid = w["word_id"]
            if wid in filler_word_id_map:
                ftxt = filler_word_id_map[wid]
                if ftxt.lower() not in seen_fil:
                    seen_fil.add(ftxt.lower())
                    seg_fillers.append(ftxt)

        has_disf = any(w["word_id"] in disfluency_word_ids for w in seg_words)
        has_breath = any(idx in breath_after_index for idx in range(seg_start_idx, i + 1))
        trailing_sil = gap_after_index.get(i)

        tags: List[str] = []
        if seg_fillers:
            tags.append(f"[FILLER: {', '.join(seg_fillers)}]")
        if has_disf:
            tags.append("[REPEAT]")
        if has_breath:
            tags.append("[BREATH]")
        if trailing_sil is not None:
            tags.append(f"[SILENCE: {format_silence_sec(int(trailing_sil['duration_ms']))}]")

        tag_suffix = (" " + " ".join(tags)) if tags else ""
        ts_range = f"{format_mm_ss_xx(s_ms)}-{format_mm_ss_xx(e_ms)}"
        packed_line = f"{seg_id} | {ts_range} | (#{w_start_id}-#{w_end_id}) [{s_ms}ms-{e_ms}ms] {seg_text}{tag_suffix}"
        packed_lines.append(packed_line)

        segments.append(
            {
                "segment_id": seg_id,
                "start_ms": s_ms,
                "end_ms": e_ms,
                "start_word_id": w_start_id,
                "end_word_id": w_end_id,
                "word_ids": [w["word_id"] for w in seg_words],
                "text": seg_text,
                "trailing_silence_ms": int(trailing_sil["duration_ms"]) if trailing_sil else 0,
                "has_filler": bool(seg_fillers),
                "has_disfluency": has_disf,
                "has_breath": has_breath,
                "packed_line": packed_line,
            }
        )
        seg_start_idx = i + 1

    packed_txt = "\n".join(packed_lines) + "\n"

    # Compute token compression ratio vs formatted words.json
    words_json_chars = max(1, len(raw_words_json_text))
    packed_txt_chars = len(packed_txt)
    words_tokens_est = max(1, int(round(words_json_chars / 4.0)))
    packed_tokens_est = max(1, int(round(packed_txt_chars / 4.0)))
    token_savings_pct = round(max(0.0, min(99.9, (1.0 - (packed_txt_chars / float(words_json_chars))) * 100.0)), 2)
    compression_ratio = round(words_json_chars / float(max(1, packed_txt_chars)), 2)

    # Build unified schema-compliant `flags` list (all types in VALID_FLAG_TYPES of pipeline_schemas.py)
    unified_flags: List[Dict[str, Any]] = []
    for s in silences:
        unified_flags.append(
            {
                "flag_id": s["flag_id"],
                "type": "SILENCE",
                "start_ms": s["start_ms"],
                "end_ms": s["end_ms"],
                "duration_ms": s["duration_ms"],
                "word_ids": [s["after_word_id"], s["before_word_id"]],
                "text": s["text"],
                "reason": s["reason"],
            }
        )
    for f in fillers:
        unified_flags.append(
            {
                "flag_id": f["flag_id"],
                "type": "FILLER",
                "start_ms": f["start_ms"],
                "end_ms": f["end_ms"],
                "duration_ms": f["duration_ms"],
                "word_ids": f["word_ids"],
                "text": f["text"],
                "reason": f["reason"],
            }
        )
    for d in disfluencies:
        unified_flags.append(
            {
                "flag_id": d["flag_id"],
                "type": "REPEAT",
                "start_ms": d["start_ms"],
                "end_ms": d["end_ms"],
                "duration_ms": d["duration_ms"],
                "word_ids": d["word_ids"],
                "text": d["text"],
                "reason": d["reason"],
            }
        )
    for b in breaths:
        unified_flags.append(
            {
                "flag_id": b["flag_id"],
                "type": "PAUSE",
                "subtype": "BREATH",
                "start_ms": b["start_ms"],
                "end_ms": b["end_ms"],
                "duration_ms": b["duration_ms"],
                "word_ids": [b["after_word_id"], b["before_word_id"]],
                "text": "[BREATH]",
                "reason": b["reason"],
            }
        )

    unified_flags.sort(key=lambda x: (int(x["start_ms"]), int(x["end_ms"])))

    stats = {
        "total_words": len(words),
        "total_segments": len(segments),
        "silence_count": len(silences),
        "breath_count": len(breaths),
        "filler_count": len(fillers),
        "disfluency_count": len(disfluencies),
        "words_json_chars": words_json_chars,
        "packed_txt_chars": packed_txt_chars,
        "words_json_tokens_est": words_tokens_est,
        "packed_txt_tokens_est": packed_tokens_est,
        "compression_ratio": compression_ratio,
        "token_savings_pct": token_savings_pct,
    }

    flags_artifact: Dict[str, Any] = {
        "project_id": project_id or str(words_meta.get("project_id", "default")),
        "phase": "P3",
        "version": "1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "style_id": profile_cfg.get("style_id"),
        "silence_threshold_ms": eff_silence_ms,
        "max_silence_ms": int(profile_cfg.get("max_silence_ms", 650)),
        "min_silence_ms": int(profile_cfg.get("min_silence_ms", eff_silence_ms)),
        "target_pause_median_ms": int(profile_cfg.get("target_pause_median_ms", 240)),
        "token_savings_pct": token_savings_pct,
        "summary": stats,
        "stats": stats,
        "silences": silences,
        "breaths": breaths,
        "fillers": fillers,
        "disfluencies": disfluencies,
        "segments": segments,
        "flags": unified_flags,
    }

    # Validate against Spoke 1 pipeline_schemas if present
    try:
        from schemas.pipeline_schemas import validate_flags  # type: ignore

        validate_flags(flags_artifact, raise_on_error=True)
    except ImportError:
        pass

    if packed_output_path is not None:
        p_out = Path(packed_output_path).resolve()
        p_out.parent.mkdir(parents=True, exist_ok=True)
        p_out.write_text(packed_txt, encoding="utf-8")

    if flags_output_path is not None:
        f_out = Path(flags_output_path).resolve()
        f_out.parent.mkdir(parents=True, exist_ok=True)
        f_out.write_text(json.dumps(flags_artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        _update_workspace_state(f_out.parent, packed_output_path, f_out, flags_artifact)

    return packed_txt, flags_artifact


def _update_workspace_state(
    workspace_dir: Path,
    packed_path: Optional[Union[str, Path]],
    flags_path: Path,
    flags_data: Dict[str, Any],
) -> None:
    """Update `state.json` phase P3 status if present in workspace."""
    state_path = workspace_dir / "state.json"
    if not state_path.exists():
        return
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if isinstance(state, dict):
            phases = state.setdefault("phases", {})
            phases["P3"] = {
                "status": "completed",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "artifact": str(flags_path),
                "outputs": [str(packed_path), str(flags_path)] if packed_path else [str(flags_path)],
                "metrics": flags_data.get("stats", {}),
            }
            state["current_phase"] = "P3"
            state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        pass


def run_phase(
    workspace_dir: Optional[Union[str, Path]] = None,
    words_path: Optional[Union[str, Path]] = None,
    audio_path: Optional[Union[str, Path]] = None,
    packed_output_path: Optional[Union[str, Path]] = None,
    flags_output_path: Optional[Union[str, Path]] = None,
    project_id: Optional[str] = None,
    silence_threshold_ms: Optional[int] = None,
    profile_path: Optional[Union[str, Path]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Entry point for CLI orchestrator and programmatic execution of Phase 3."""
    workdir = Path(workspace_dir or kwargs.get("workdir") or ".").resolve()

    if words_path is None:
        cand_words = workdir / "words.json"
        if cand_words.exists():
            words_path = cand_words
        else:
            raise FileNotFoundError(f"Could not find words.json in {workdir}; pass --words explicitly.")

    if audio_path is None:
        cand_audio = workdir / "audio_16k.wav"
        if cand_audio.exists():
            audio_path = cand_audio

    if packed_output_path is None:
        packed_output_path = workdir / "packed.txt"
    if flags_output_path is None:
        flags_output_path = workdir / "flags.json"

    _, flags_artifact = detect_acoustics(
        words_input=words_path,
        audio_path=audio_path,
        packed_output_path=packed_output_path,
        flags_output_path=flags_output_path,
        project_id=project_id or workdir.name,
        silence_threshold_ms=silence_threshold_ms,
        profile_path=profile_path,
        workspace_dir=workdir,
        effective_profile=kwargs.get("effective_profile"),
    )
    return flags_artifact


# Alias for pipeline callers
run = run_phase


def _build_self_test_wav_and_words(wav_path: Path, words_path: Path) -> None:
    """Generate a synthetic 16kHz WAV file (with voice, breath, and 1.2s silence) and sample `words.json`."""
    sample_rate = 16000
    duration_ms = 14000
    total_samples = int((duration_ms / 1000.0) * sample_rate)
    samples = array.array("h", [0] * total_samples)

    # Helper to fill tone energy in [start_ms, end_ms]
    def _fill_tone(s_ms: int, e_ms: int, amp: float, freq: float = 210.0) -> None:
        s_i = max(0, int((s_ms / 1000.0) * sample_rate))
        e_i = min(total_samples, int((e_ms / 1000.0) * sample_rate))
        for idx in range(s_i, e_i):
            t = idx / float(sample_rate)
            samples[idx] = int(amp * 32767.0 * math.sin(2.0 * math.pi * freq * t))

    # Segment 1 words: 1200ms -> 4500ms (with a breath burst in gap 2250..2480ms)
    _fill_tone(1200, 2220, amp=0.28)
    _fill_tone(2260, 2460, amp=0.032, freq=410.0)  # Breath signature (RMS ~ 0.022)
    _fill_tone(2500, 4500, amp=0.28)
    # 1.2s true silence between 4500ms and 5700ms (amplitude 0)
    # Segment 2 words: 5700ms -> 11500ms
    _fill_tone(5700, 11500, amp=0.26)

    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())

    # Build words.json with Vietnamese fillers ("ừm", "à", "ờ", "kiểu như"), repetition ("mình mình"),
    # breath gap (2220->2500ms), and 1.2s silence gap (4500->5700ms)
    sample_words = [
        {"word_id": "w1", "text": "À", "word": "À", "start_ms": 1200, "end_ms": 1450, "confidence": 0.62},
        {"word_id": "w2", "text": "ừm", "word": "ừm", "start_ms": 1480, "end_ms": 1750, "confidence": 0.64},
        {"word_id": "w3", "text": "tai", "word": "tai", "start_ms": 1780, "end_ms": 2000, "confidence": 0.95},
        {"word_id": "w4", "text": "nghe", "word": "nghe", "start_ms": 2020, "end_ms": 2220, "confidence": 0.96},
        # 280ms gap [2220..2500] containing synthetic breath
        {"word_id": "w5", "text": "AirPods", "word": "AirPods", "start_ms": 2500, "end_ms": 2980, "confidence": 0.97},
        {"word_id": "w6", "text": "Pro", "word": "Pro", "start_ms": 3010, "end_ms": 3450, "confidence": 0.97},
        {"word_id": "w7", "text": "bị", "word": "bị", "start_ms": 3480, "end_ms": 3950, "confidence": 0.95},
        {"word_id": "w8", "text": "rè", "word": "rè", "start_ms": 3980, "end_ms": 4500, "confidence": 0.94},
        # 1200ms (1.2s) silence gap [4500..5700]
        {"word_id": "w9", "text": "ờ", "word": "ờ", "start_ms": 5700, "end_ms": 5950, "confidence": 0.61},
        {"word_id": "w10", "text": "kiểu", "word": "kiểu", "start_ms": 5980, "end_ms": 6220, "confidence": 0.68},
        {"word_id": "w11", "text": "như", "word": "như", "start_ms": 6240, "end_ms": 6500, "confidence": 0.69},
        {"word_id": "w12", "text": "mình", "word": "mình", "start_ms": 6540, "end_ms": 6800, "confidence": 0.88},
        {"word_id": "w13", "text": "mình", "word": "mình", "start_ms": 6840, "end_ms": 7120, "confidence": 0.92},
        {"word_id": "w14", "text": "sẽ", "word": "sẽ", "start_ms": 7150, "end_ms": 7420, "confidence": 0.96},
        {"word_id": "w15", "text": "vệ", "word": "vệ", "start_ms": 7450, "end_ms": 7720, "confidence": 0.97},
        {"word_id": "w16", "text": "sinh", "word": "sinh", "start_ms": 7750, "end_ms": 8050, "confidence": 0.97},
        {"word_id": "w17", "text": "chuẩn", "word": "chuẩn", "start_ms": 8080, "end_ms": 8400, "confidence": 0.96},
        {"word_id": "w18", "text": "hãng", "word": "hãng", "start_ms": 8430, "end_ms": 8750, "confidence": 0.96},
        {"word_id": "w19", "text": "tại", "word": "tại", "start_ms": 8780, "end_ms": 9080, "confidence": 0.97},
        {"word_id": "w20", "text": "PodsCare", "word": "PodsCare", "start_ms": 9110, "end_ms": 9650, "confidence": 0.99},
        {"word_id": "w21", "text": "nhanh", "word": "nhanh", "start_ms": 9680, "end_ms": 10050, "confidence": 0.96},
        {"word_id": "w22", "text": "chóng.", "word": "chóng.", "start_ms": 10080, "end_ms": 10550, "confidence": 0.97},
    ]

    payload = {
        "project_id": "self_test_p3",
        "phase": "P2",
        "version": "1.0",
        "language": "vi",
        "duration_ms": duration_ms,
        "words": sample_words,
    }
    words_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_self_test() -> int:
    """Run built-in self-test verifying `packed.txt` regex, >70% token savings, and `flags.json`."""
    print("[P3 Self-Test] Starting Phase 3 Acoustic Detector & Packed Format validation...")
    with tempfile.TemporaryDirectory(prefix="p3_acoustic_test_") as tmpdir:
        tmp_path = Path(tmpdir)
        wav_file = tmp_path / "audio_16k.wav"
        words_file = tmp_path / "words.json"
        packed_file = tmp_path / "packed.txt"
        flags_file = tmp_path / "flags.json"

        _build_self_test_wav_and_words(wav_file, words_file)

        packed_txt, flags_data = detect_acoustics(
            words_input=words_file,
            audio_path=wav_file,
            packed_output_path=packed_file,
            flags_output_path=flags_file,
            project_id="self_test_p3",
            silence_threshold_ms=500,
        )

        lines = [ln.strip() for ln in packed_txt.splitlines() if ln.strip()]
        assert len(lines) >= 2, f"Expected >= 2 packed segment lines, got {len(lines)}"

        line_regex = re.compile(
            r"^s\d{2,3} \| \d{2}:\d{2}\.\d{2}-\d{2}:\d{2}\.\d{2} \| \(#w\d+-#w\d+\) .+"
        )
        for ln in lines:
            assert line_regex.match(ln), f"Line did not match packed.txt format regex: {ln!r}"

        assert "[SILENCE: 1.2s]" in lines[0], f"Expected '[SILENCE: 1.2s]' in first segment line: {lines[0]!r}"
        assert "s01 | 00:01.20-00:04.50 | (#w1-#w8)" in lines[0], f"Unexpected s01 header in: {lines[0]!r}"

        savings_pct = flags_data["stats"]["token_savings_pct"]
        assert savings_pct > 70.0, f"Expected > 70% token savings, got {savings_pct}%"
        assert len(flags_data["silences"]) >= 1, "Expected >= 1 detected silence"
        assert len(flags_data["fillers"]) >= 2, f"Expected >= 2 detected fillers, got {flags_data['fillers']}"
        assert len(flags_data["disfluencies"]) >= 1, "Expected >= 1 detected disfluency/repetition"
        assert len(flags_data["breaths"]) >= 1, "Expected >= 1 detected breath in audio_16k.wav"

        print("[P3 Self-Test] Generated packed.txt:")
        for ln in lines:
            print(f"  {ln}")
        print(
            f"[P3 Self-Test] Token savings: {savings_pct}% "
            f"({flags_data['stats']['words_json_chars']} chars -> {flags_data['stats']['packed_txt_chars']} chars, "
            f"ratio={flags_data['stats']['compression_ratio']}x)"
        )
        print(
            f"[P3 Self-Test] Flags summary: silences={len(flags_data['silences'])}, "
            f"fillers={len(flags_data['fillers'])}, disfluencies={len(flags_data['disfluencies'])}, "
            f"breaths={len(flags_data['breaths'])}"
        )
        print("[P3 Self-Test] PASS: All regex, acoustic, filler, and compression assertions succeeded.")
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="P3 Acoustic Detector: Detect silences, breaths, Vietnamese fillers & generate packed.txt + flags.json"
    )
    parser.add_argument("--words", "--input", "-i", dest="words", help="Path to input words.json from P2")
    parser.add_argument("--audio", "-a", dest="audio", help="Path to input audio_16k.wav")
    parser.add_argument("--packed-output", "--packed", "-p", dest="packed_output", help="Path to output packed.txt")
    parser.add_argument("--flags-output", "--flags", "-f", dest="flags_output", help="Path to output flags.json")
    parser.add_argument("--workdir", "--workspace", "-w", dest="workdir", help="Workspace directory path")
    parser.add_argument("--project-id", dest="project_id", help="Project identifier")
    parser.add_argument(
        "--silence-threshold-ms",
        type=int,
        default=None,
        help="Minimum silence duration in ms to flag (default: 500)",
    )
    parser.add_argument("--profile", dest="profile", help="Optional path to profile.yaml")
    parser.add_argument("--self-test", action="store_true", help="Run built-in self-test and exit")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    if not args.words and not args.workdir:
        parser.print_help()
        print("\nError: Provide --workdir <dir> or --words <words.json> (or --self-test).", file=sys.stderr)
        return 2

    try:
        flags_artifact = run_phase(
            workspace_dir=args.workdir,
            words_path=args.words,
            audio_path=args.audio,
            packed_output_path=args.packed_output,
            flags_output_path=args.flags_output,
            project_id=args.project_id,
            silence_threshold_ms=args.silence_threshold_ms,
            profile_path=args.profile,
        )
        stats = flags_artifact["stats"]
        print(
            f"[P3 Acoustic Detect] Wrote {stats['total_segments']} segments "
            f"(token_savings={stats['token_savings_pct']}%, silences={stats['silence_count']}, "
            f"fillers={stats['filler_count']}, breaths={stats['breath_count']})"
        )
        return 0
    except Exception as exc:
        print(f"[P3 Acoustic Detect] ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
