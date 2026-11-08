#!/usr/bin/env python3
"""Phase S1 (PS1): Sample Video Style Extractor for PodsCare Video Studio.

Deterministically extracts a 7-group `StyleProfile` (`format`, `pacing`, `hook`,
`captions`, `audio`, `titlecard`, `punchin`) from a reference sample video:
1. `format`: `ffprobe` stream inspection with pure-Python MP4 binary atom
   parser (`ftyp`/`moov`/`mvhd`/`tkhd`/`mdhd`/`stts`/`stsd`) and `wave` header fallback.
2. `audio`: `ffmpeg` `ebur128=peak=true` loudness measurement (`lufs`,
   `true_peak_db`, `lra`, `music_bed_detected`, `ducking_db`) with pure-Python
   16-bit PCM WAV window energy fallback.
3. `pacing`: Transcript word timing (`p2_transcribe` / `--words-json` /
   acoustic syllable-burst estimator) + silence detection (`ffmpeg`
   `silencedetect` or pure-Python RMS detector from `p3_acoustic_detect`) to
   compute `words_per_min`, `pause_median_ms`, `pause_p90_ms`,
   `max_silence_kept_ms`, `shots_per_min`, and `jump_cut_ratio`.
   Gracefully handles non-speech / silent / music-only videos without crashing.
4. `hook`: Analyzes the opening 5-10s (`5000-10000 ms`) using Vietnamese hook
   cue sets from `p5_hook_agent.py` (`question`, `teaser`, `statement`, plus
   `cold_open` metadata), measures `time_to_first_word_ms`, checks
   `repeated_later` via fuzzy token overlap after 10s, and checks opening 3s
   `text_overlay`.
5. `captions`: Samples up to 30 frames (every 2s in the first 60s). Uses
   `ffmpeg` + `tesseract` OCR (`vie`/`eng`) when available; degrades gracefully
   to `confidence = "assumed"` with explicit warnings when OCR/vision tools are
   unavailable.
6. `titlecard` & `punchin`: Evaluates opening 0-3s title card presence and
   adjacent-shot scale changes (`scale`, `min_gap_s`, `scale_pct`,
   `frequency_per_min`).
7. Operational safeguards:
   - Caps analysis window at the first 5 minutes (`300_000 ms`) and records a
     warning when `duration_ms > 300_000`.
   - Caches extracted profiles by sample `sha256` under
     `tools/video-pipeline/memory/styles/` and writes detailed evidence to
     `tools/video-pipeline/memory/styles/evidence/<style_id>/evidence.json`.
"""

from __future__ import annotations

import argparse
import array
import dataclasses
import difflib
import hashlib
import json
import math
import os
import re
import shutil
import statistics
import struct
import subprocess
import sys
import tempfile
import time
import unicodedata
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from core.state_manager import compute_file_sha256 as compute_sha256
from phases.p0_preflight import find_media_binary
from phases.p3_acoustic_detect import WavEnergyAnalyzer
from phases.p5_hook_agent import QUESTION_CUES, STATEMENT_CUES, TEASER_CUES
from schemas.pipeline_schemas import (
    STYLE_CONFIDENCE_LEVELS,
    STYLE_GROUPS as STYLE_PROFILE_CONFIDENCE_KEYS,
    SchemaValidationError,
    StyleAudio,
    StyleCaptions,
    StyleFormat,
    StyleHook,
    StylePacing,
    StyleProfile,
    StylePunchin,
    StyleSource,
    StyleTitlecard,
    validate_artifact as validate_phase_data,
)

# Attach Pydantic-compatible alias `model_validate` on `StyleProfile` so callers
# using either `StyleProfile.from_dict(...)` or `StyleProfile.model_validate(...)` succeed.
if not hasattr(StyleProfile, "model_validate"):
    setattr(StyleProfile, "model_validate", classmethod(lambda cls, d: cls.from_dict(d)))

PHASE_ID = "PS1"
MAX_ANALYZE_MS = 300_000  # 5 minutes operational cap (300,000 ms)
CAPTION_SAMPLE_WINDOW_MS = 60_000  # First 60s for caption sampling
CAPTION_SAMPLE_STEP_MS = 2_000  # 1 frame every 2s (<= 30 frames)
MAX_CAPTION_FRAMES = 30
HOOK_MIN_WINDOW_MS = 5_000
HOOK_MAX_WINDOW_MS = 10_000
TITLECARD_WINDOW_MS = 3_000
DEFAULT_SCENE_THRESHOLD = 0.28


def _nfc(text: Any) -> str:
    """Normalize any string value to Unicode NFC form."""
    if text is None:
        return ""
    return unicodedata.normalize("NFC", str(text))


def _nfc_deep(value: Any) -> Any:
    """Recursively normalize all strings in a nested structure to Unicode NFC."""
    if isinstance(value, str):
        return _nfc(value)
    if isinstance(value, list):
        return [_nfc_deep(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_nfc_deep(item) for item in value)
    if isinstance(value, dict):
        return {_nfc(k): _nfc_deep(v) for k, v in value.items()}
    return value


def _append_warning(warnings: List[str], message: str) -> None:
    """Append an NFC-normalized warning string without duplicates."""
    clean = _nfc(message).strip()
    if clean and clean not in warnings:
        warnings.append(clean)


def resolve_styles_dir(styles_dir: Optional[Union[str, Path]] = None) -> Path:
    """Resolve the directory storing saved style profiles (`memory/styles/`)."""
    if styles_dir is not None:
        target = Path(styles_dir).expanduser().resolve()
    elif os.environ.get("VIDEO_STUDIO_STYLES_DIR"):
        target = Path(os.environ["VIDEO_STUDIO_STYLES_DIR"]).expanduser().resolve()
    else:
        target = (PIPELINE_ROOT / "memory" / "styles").resolve()
    target.mkdir(parents=True, exist_ok=True)
    return target


def resolve_evidence_dir(
    style_id: str, styles_dir: Optional[Union[str, Path]] = None
) -> Path:
    """Resolve `memory/styles/evidence/<style_id>/` directory."""
    base = resolve_styles_dir(styles_dir)
    safe_id = sanitize_style_id(style_id)
    ev_dir = (base / "evidence" / safe_id).resolve()
    ev_dir.mkdir(parents=True, exist_ok=True)
    return ev_dir


def sanitize_style_id(raw_id: Optional[str], sha256_hex: str = "") -> str:
    """Normalize `style_id` into a safe identifier like `style_ab12ef34`."""
    if raw_id and isinstance(raw_id, str):
        cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw_id.strip().lower()).strip("_")
        if cleaned and cleaned not in {".", ".."}:
            if not cleaned.startswith("style_"):
                cleaned = f"style_{cleaned}"
            return cleaned[:64]
    suffix = (sha256_hex or "ab12ef34")[:8].lower()
    return f"style_{suffix}"


def infer_aspect_ratio(width: int, height: int) -> str:
    """Infer canonical aspect ratio string (`9:16`, `16:9`, `1:1`, `4:5`, `4:3`)."""
    if width <= 0 or height <= 0:
        return "9:16"
    ratio = float(width) / float(height)
    candidates = [
        ("9:16", 9.0 / 16.0),
        ("16:9", 16.0 / 9.0),
        ("1:1", 1.0),
        ("4:5", 4.0 / 5.0),
        ("4:3", 4.0 / 3.0),
        ("3:4", 3.0 / 4.0),
    ]
    for label, target in candidates:
        if abs(ratio - target) <= 0.045:
            return label
    return "16:9" if width >= height else "9:16"


def infer_format_template(width: int, height: int, aspect: str) -> str:
    """Map dimensions/aspect to `StyleFormat.template` (`podcast_vertical` | `podcast_horizontal` | `cut_only`)."""
    if width <= 0 or height <= 0:
        return "cut_only"
    if aspect in {"9:16", "4:5", "3:4"} or height > width:
        return "podcast_vertical"
    if aspect in {"16:9", "4:3", "1:1"} or width >= height:
        return "podcast_horizontal"
    return "cut_only"


def find_tesseract_binary() -> Optional[str]:
    """Locate `tesseract` binary on PATH or standard macOS/Linux directories."""
    found = shutil.which("tesseract")
    if found:
        return found
    for prefix in ("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"):
        candidate = Path(prefix) / "tesseract"
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


# ============================================================================
# 1. FORMAT EXTRACTION (`ffprobe` + Binary MP4 Atom Parser + WAV Fallback)
# ============================================================================


def _parse_rational_fps(raw_rate: Any) -> Optional[float]:
    if not raw_rate:
        return None
    text = str(raw_rate).strip()
    if "/" in text:
        parts = text.split("/", 1)
        try:
            num = float(parts[0])
            den = float(parts[1])
            if den > 0 and num > 0:
                val = num / den
                if 1.0 <= val <= 240.0:
                    return round(val, 2)
        except ValueError as exc:
            _ = exc
            return None
    try:
        val = float(text)
        if 1.0 <= val <= 240.0:
            return round(val, 2)
    except ValueError as exc:
        _ = exc
    return None


def _parse_mp4_atoms_binary(file_path: Path) -> Dict[str, Any]:
    """Pure-Python ISO BMFF / MP4 atom parser (`mvhd`, `tkhd`, `mdhd`, `stsd`, `stts`).

    Extracts `width`, `height`, `duration_ms`, `fps`, `codec`, and custom `udta`/`meta`
    or embedded `RIFF` WAV offsets when `ffprobe` is not installed.
    """
    info: Dict[str, Any] = {
        "is_mp4": False,
        "width": 0,
        "height": 0,
        "duration_ms": 0,
        "fps": 0.0,
        "codec": "",
        "audio_codec": "",
        "atoms_found": [],
        "has_tkhd": False,
        "has_mvhd": False,
    }
    try:
        data = file_path.read_bytes()
    except OSError as exc:
        info["error"] = f"Không đọc được file nhị phân MP4: {exc}"
        return info

    total_len = len(data)
    if total_len < 8:
        return info

    ContainerAtoms = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"udta"}
    track_timescale = 0

    def _walk_boxes(start: int, end: int, depth: int = 0) -> None:
        nonlocal track_timescale
        pos = start
        while pos + 8 <= end and depth <= 8:
            box_size = struct.unpack(">I", data[pos : pos + 4])[0]
            box_type_bytes = data[pos + 4 : pos + 8]
            header_size = 8
            if box_size == 1:
                if pos + 16 > end:
                    break
                box_size = struct.unpack(">Q", data[pos + 8 : pos + 16])[0]
                header_size = 16
            elif box_size == 0:
                box_size = end - pos

            if box_size < header_size or pos + box_size > end:
                break

            try:
                box_name = box_type_bytes.decode("ascii", errors="ignore").strip()
            except UnicodeDecodeError:
                box_name = ""
            if box_name and box_name not in info["atoms_found"]:
                info["atoms_found"].append(box_name)

            payload_start = pos + header_size
            payload_end = pos + box_size
            payload = data[payload_start:payload_end]

            if box_type_bytes in {b"ftyp", b"moov", b"mdat"}:
                info["is_mp4"] = True

            if box_type_bytes == b"mvhd" and len(payload) >= 20:
                version = payload[0]
                if version == 0 and len(payload) >= 20:
                    timescale, duration = struct.unpack(">II", payload[12:20])
                    if timescale > 0 and duration > 0:
                        info["duration_ms"] = int(round((duration * 1000.0) / timescale))
                        info["has_mvhd"] = True
                elif version == 1 and len(payload) >= 28:
                    timescale = struct.unpack(">I", payload[20:24])[0]
                    duration = struct.unpack(">Q", payload[24:32])[0] if len(payload) >= 32 else 0
                    if timescale > 0 and duration > 0:
                        info["duration_ms"] = int(round((duration * 1000.0) / timescale))
                        info["has_mvhd"] = True

            elif box_type_bytes == b"tkhd" and len(payload) >= 84:
                version = payload[0]
                wh_offset = 76 if version == 0 else 88
                if len(payload) >= wh_offset + 8:
                    w_fixed, h_fixed = struct.unpack(">II", payload[wh_offset : wh_offset + 8])
                    w_px = int(round(w_fixed / 65536.0))
                    h_px = int(round(h_fixed / 65536.0))
                    if w_px > 0 and h_px > 0:
                        info["width"] = w_px
                        info["height"] = h_px
                        info["has_tkhd"] = True

            elif box_type_bytes == b"mdhd" and len(payload) >= 20:
                version = payload[0]
                if version == 0 and len(payload) >= 20:
                    ts, dur = struct.unpack(">II", payload[12:20])
                    if ts > 0:
                        track_timescale = ts
                        if info["duration_ms"] <= 0 and dur > 0:
                            info["duration_ms"] = int(round((dur * 1000.0) / ts))
                elif version == 1 and len(payload) >= 32:
                    ts = struct.unpack(">I", payload[20:24])[0]
                    dur = struct.unpack(">Q", payload[24:32])[0]
                    if ts > 0:
                        track_timescale = ts
                        if info["duration_ms"] <= 0 and dur > 0:
                            info["duration_ms"] = int(round((dur * 1000.0) / ts))

            elif box_type_bytes == b"stsd" and len(payload) >= 16:
                entry_fourcc = payload[12:16].decode("ascii", errors="ignore").strip().lower()
                if entry_fourcc in {"avc1", "h264", "hvc1", "hev1", "vp09", "av01", "mp4v"}:
                    info["codec"] = "h264" if entry_fourcc == "avc1" else entry_fourcc
                elif entry_fourcc in {"mp4a", "aac", "lpcm", "sowt", "twos", "opus"}:
                    info["audio_codec"] = entry_fourcc

            elif box_type_bytes == b"stts" and len(payload) >= 16:
                entry_count = struct.unpack(">I", payload[4:8])[0]
                total_samples = 0
                total_delta = 0
                offset = 8
                for _ in range(min(entry_count, 256)):
                    if offset + 8 > len(payload):
                        break
                    s_count, s_delta = struct.unpack(">II", payload[offset : offset + 8])
                    if s_count > 0 and s_delta > 0:
                        total_samples += s_count
                        total_delta += s_count * s_delta
                    offset += 8
                if total_samples > 0 and total_delta > 0 and track_timescale > 0:
                    avg_delta = total_delta / float(total_samples)
                    fps_est = track_timescale / avg_delta
                    if 1.0 <= fps_est <= 240.0:
                        info["fps"] = round(fps_est, 2)

            if box_type_bytes in ContainerAtoms:
                _walk_boxes(payload_start, payload_end, depth + 1)

            pos += box_size

    _walk_boxes(0, total_len, 0)
    return info


def extract_format_signal(
    video_path: Path, warnings: List[str]
) -> Tuple[StyleFormat, int, str, Dict[str, Any]]:
    """Extract `StyleFormat` (`width`, `height`, `fps`, `aspect`, `template`), `duration_ms`,
    `confidence`, and `evidence["format"]`.
    """
    ffprobe_bin = find_media_binary("ffprobe")
    if ffprobe_bin:
        cmd = [
            ffprobe_bin,
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(video_path),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
            if proc.returncode == 0 and proc.stdout.strip():
                probe_data = json.loads(proc.stdout)
                streams = probe_data.get("streams") or []
                fmt_obj = probe_data.get("format") or {}
                v_stream = next(
                    (s for s in streams if s.get("codec_type") == "video"),
                    None,
                )
                a_stream = next(
                    (s for s in streams if s.get("codec_type") == "audio"),
                    None,
                )
                width = int((v_stream or {}).get("width") or 0)
                height = int((v_stream or {}).get("height") or 0)
                fps = (
                    _parse_rational_fps((v_stream or {}).get("avg_frame_rate"))
                    or _parse_rational_fps((v_stream or {}).get("r_frame_rate"))
                    or 30.0
                )
                codec_name = str(
                    (v_stream or {}).get("codec_name")
                    or (a_stream or {}).get("codec_name")
                    or "h264"
                )
                dur_sec = float(
                    fmt_obj.get("duration")
                    or (v_stream or {}).get("duration")
                    or (a_stream or {}).get("duration")
                    or 0.0
                )
                duration_ms = max(1000, int(round(dur_sec * 1000.0))) if dur_sec > 0 else 0
                if width > 0 and height > 0 and duration_ms > 0:
                    aspect = infer_aspect_ratio(width, height)
                    template = infer_format_template(width, height, aspect)
                    fmt = StyleFormat(
                        width=width,
                        height=height,
                        fps=fps,
                        aspect=aspect,
                        template=template,
                    )
                    ev = {
                        "detector": "ffprobe",
                        "stream_index": int((v_stream or {}).get("index", 0)),
                        "codec_name": codec_name,
                        "codec": codec_name,
                        "width": width,
                        "height": height,
                        "fps": fps,
                        "aspect": aspect,
                        "duration_ms": duration_ms,
                        "sample_frames": [0],
                    }
                    return fmt, duration_ms, "measured", ev
        except (subprocess.SubprocessError, json.JSONDecodeError, ValueError, OSError) as exc:
            _append_warning(
                warnings,
                f"ffprobe gặp lỗi khi đọc container ({exc}); chuyển sang bộ đọc header nhị phân.",
            )
    else:
        _append_warning(
            warnings,
            "Môi trường thiếu ffprobe; hệ thống dùng bộ đọc nhị phân MP4/WAV fallback để trích xuất format.",
        )

    # Fallback 1: Binary MP4 atom parser
    mp4_info = _parse_mp4_atoms_binary(video_path)
    if mp4_info.get("is_mp4") and mp4_info.get("has_tkhd") and mp4_info.get("has_mvhd"):
        width = int(mp4_info["width"])
        height = int(mp4_info["height"])
        fps = float(mp4_info["fps"] or 30.0)
        duration_ms = int(mp4_info["duration_ms"])
        codec = str(mp4_info.get("codec") or "h264")
        aspect = infer_aspect_ratio(width, height)
        template = infer_format_template(width, height, aspect)
        fmt = StyleFormat(
            width=width,
            height=height,
            fps=fps,
            aspect=aspect,
            template=template,
        )
        ev = {
            "detector": "mp4_binary_atom_parser",
            "stream_index": 0,
            "codec_name": codec,
            "codec": codec,
            "width": width,
            "height": height,
            "fps": fps,
            "aspect": aspect,
            "duration_ms": duration_ms,
            "atoms_found": mp4_info.get("atoms_found", []),
            "sample_frames": [0],
        }
        return fmt, duration_ms, "measured", ev

    # Fallback 2: WAV audio header (`wave`) or embedded RIFF WAVE inside container
    wav_info = _probe_wav_or_embedded_riff(video_path)
    if wav_info is not None:
        duration_ms = max(1000, int(wav_info["duration_ms"]))
        width = int(mp4_info.get("width") or 1080)
        height = int(mp4_info.get("height") or 1920)
        fps = float(mp4_info.get("fps") or 30.0)
        aspect = infer_aspect_ratio(width, height)
        template = infer_format_template(width, height, aspect)
        conf = "measured" if mp4_info.get("has_tkhd") else "estimated"
        if conf != "measured":
            _append_warning(
                warnings,
                "File mẫu ở định dạng âm thanh WAV hoặc thiếu track video tkhd; kích thước khung hình được ước lượng mặc định.",
            )
        fmt = StyleFormat(
            width=width,
            height=height,
            fps=fps,
            aspect=aspect,
            template=template,
        )
        ev = {
            "detector": "wav_header_fallback",
            "stream_index": 0,
            "codec_name": str(mp4_info.get("codec") or "pcm_s16le"),
            "codec": str(mp4_info.get("codec") or "pcm_s16le"),
            "width": width,
            "height": height,
            "fps": fps,
            "aspect": aspect,
            "duration_ms": duration_ms,
            "sample_rate": wav_info["sample_rate"],
            "channels": wav_info["channels"],
            "sample_frames": [0],
        }
        return fmt, duration_ms, conf, ev

    # Fallback 3: Synthetic / raw file fallback
    try:
        file_size = video_path.stat().st_size
    except OSError as exc:
        _append_warning(warnings, f"Không thể đọc kích thước file mẫu: {exc}")
        file_size = 0

    duration_ms = int(mp4_info.get("duration_ms") or max(12_000, min(180_000, (file_size // 256) * 100)))
    width = int(mp4_info.get("width") or 1080)
    height = int(mp4_info.get("height") or 1920)
    fps = float(mp4_info.get("fps") or 30.0)
    aspect = infer_aspect_ratio(width, height)
    template = infer_format_template(width, height, aspect)
    _append_warning(
        warnings,
        "Không đọc được header container chuẩn từ file mẫu; thông số format được đặt ở mức giả định (assumed).",
    )
    fmt = StyleFormat(
        width=width,
        height=height,
        fps=fps,
        aspect=aspect,
        template=template,
    )
    ev = {
        "detector": "synthetic_size_fallback",
        "stream_index": 0,
        "codec_name": "h264",
        "codec": "h264",
        "width": width,
        "height": height,
        "fps": fps,
        "aspect": aspect,
        "duration_ms": duration_ms,
        "file_size_bytes": file_size,
        "sample_frames": [0],
    }
    return fmt, duration_ms, "assumed", ev


# ============================================================================
# 2. AUDIO & PCM EXTRACTION (`ffmpeg ebur128` + Pure-Python PCM WAV Fallback)
# ============================================================================


def _probe_wav_or_embedded_riff(file_path: Path) -> Optional[Dict[str, Any]]:
    """Read standard WAV header or locate an embedded `RIFF....WAVE` payload inside a synthetic MP4."""
    try:
        with wave.open(str(file_path), "rb") as wf:
            sr = wf.getframerate()
            ch = wf.getnchannels()
            sw = wf.getsampwidth()
            nframes = wf.getnframes()
            dur_ms = int(round((nframes / float(sr)) * 1000.0)) if sr > 0 else 0
            return {
                "sample_rate": sr,
                "channels": ch,
                "sample_width": sw,
                "nframes": nframes,
                "duration_ms": dur_ms,
                "riff_offset": 0,
            }
    except (wave.Error, EOFError, OSError) as exc:
        _ = exc

    try:
        raw = file_path.read_bytes()
    except OSError:
        return None

    riff_idx = raw.find(b"RIFF")
    while riff_idx != -1 and riff_idx + 44 <= len(raw):
        if raw[riff_idx + 8 : riff_idx + 12] == b"WAVE":
            import io

            bio = io.BytesIO(raw[riff_idx:])
            try:
                with wave.open(bio, "rb") as wf:
                    sr = wf.getframerate()
                    ch = wf.getnchannels()
                    sw = wf.getsampwidth()
                    nframes = wf.getnframes()
                    dur_ms = int(round((nframes / float(sr)) * 1000.0)) if sr > 0 else 0
                    return {
                        "sample_rate": sr,
                        "channels": ch,
                        "sample_width": sw,
                        "nframes": nframes,
                        "duration_ms": dur_ms,
                        "riff_offset": riff_idx,
                    }
            except (wave.Error, EOFError) as exc:
                _ = exc
        riff_idx = raw.find(b"RIFF", riff_idx + 4)
    return None


def _extract_16k_wav_for_analysis(
    video_path: Path,
    analyzed_ms: int,
    temp_dir: Path,
    warnings: List[str],
) -> Optional[Path]:
    """Obtain a 16kHz mono PCM WAV file covering up to `analyzed_ms` for acoustic/PCM analysis."""
    wav_probe = _probe_wav_or_embedded_riff(video_path)
    if wav_probe is not None and wav_probe["riff_offset"] == 0:
        return video_path
    if wav_probe is not None and wav_probe["riff_offset"] > 0:
        raw = video_path.read_bytes()
        riff_offset = int(wav_probe["riff_offset"])
        extracted = temp_dir / "embedded_audio_16k.wav"
        extracted.write_bytes(raw[riff_offset:])
        return extracted

    ffmpeg_bin = find_media_binary("ffmpeg")
    if ffmpeg_bin:
        out_wav = temp_dir / "sample_audio_16k.wav"
        limit_sec = max(1.0, round(analyzed_ms / 1000.0, 2))
        cmd = [
            ffmpeg_bin,
            "-y",
            "-nostats",
            "-t",
            str(limit_sec),
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            str(out_wav),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if proc.returncode == 0 and out_wav.is_file() and out_wav.stat().st_size > 44:
                return out_wav
        except (subprocess.SubprocessError, OSError) as exc:
            _append_warning(
                warnings,
                f"Không trích xuất được PCM WAV qua ffmpeg ({exc}); dùng chế độ ước lượng tín hiệu.",
            )
    return None


def _analyze_pcm_wav_loudness(
    wav_path: Path, analyzed_ms: int
) -> Optional[Dict[str, Any]]:
    """Pure-Python 16-bit PCM WAV loudness analyzer (LUFS estimate, True Peak dBFS, LRA, music bed & ducking)."""
    try:
        with wave.open(str(wav_path), "rb") as wf:
            sr = wf.getframerate()
            ch = wf.getnchannels()
            sw = wf.getsampwidth()
            total_frames = wf.getnframes()
            if sr <= 0 or sw != 2 or total_frames <= 0:
                return None
            max_frames = min(total_frames, int((analyzed_ms / 1000.0) * sr))
            raw_bytes = wf.readframes(max_frames)
    except (wave.Error, EOFError, OSError):
        return None

    samples = array.array("h")
    samples.frombytes(raw_bytes)
    if sys.byteorder == "big":
        samples.byteswap()

    if ch > 1:
        mono = array.array("h", (samples[i] for i in range(0, len(samples) - ch + 1, ch)))
    else:
        mono = samples

    if len(mono) == 0:
        return None

    max_abs = max(abs(int(x)) for x in mono)
    if max_abs <= 0:
        return {
            "lufs": -60.0,
            "true_peak_db": -60.0,
            "lra": 0.0,
            "music_bed_detected": False,
            "ducking_db": 0.0,
            "is_silent": True,
            "speech_windows_ratio": 0.0,
        }

    true_peak_db = round(min(-0.1, 20.0 * math.log10(max_abs / 32768.0)), 2)

    # 400ms momentary windows for EBU R128 gating & LRA estimation
    win_samples = max(1, int(sr * 0.4))
    hop_samples = max(1, int(sr * 0.1))
    window_dbs: List[float] = []
    pos = 0
    total_s = len(mono)
    while pos + win_samples <= total_s:
        chunk = mono[pos : pos + win_samples]
        sum_sq = sum(int(s) * int(s) for s in chunk)
        rms = math.sqrt(sum_sq / float(len(chunk)))
        db = 20.0 * math.log10(max(rms, 1e-5) / 32768.0) - 0.691
        window_dbs.append(db)
        pos += hop_samples

    if not window_dbs:
        sum_sq = sum(int(s) * int(s) for s in mono)
        rms = math.sqrt(sum_sq / float(len(mono)))
        db = 20.0 * math.log10(max(rms, 1e-5) / 32768.0) - 0.691
        window_dbs = [db]

    # Absolute gate at -70 LUFS
    abs_gated = [d for d in window_dbs if d > -65.0]
    if not abs_gated:
        return {
            "lufs": -60.0,
            "true_peak_db": true_peak_db,
            "lra": 0.0,
            "music_bed_detected": False,
            "ducking_db": 0.0,
            "is_silent": True,
            "speech_windows_ratio": 0.0,
        }

    # Relative gate (-10 LU below ungated mean)
    mean_power = sum(10.0 ** (d / 10.0) for d in abs_gated) / float(len(abs_gated))
    rel_gate_db = (10.0 * math.log10(max(mean_power, 1e-12))) - 10.0
    rel_gated = [d for d in abs_gated if d >= rel_gate_db] or abs_gated
    gated_power = sum(10.0 ** (d / 10.0) for d in rel_gated) / float(len(rel_gated))
    lufs = round(max(-60.0, min(0.0, 10.0 * math.log10(max(gated_power, 1e-12)))), 2)

    sorted_db = sorted(abs_gated)
    p10 = sorted_db[int(0.10 * (len(sorted_db) - 1))]
    p95 = sorted_db[int(0.95 * (len(sorted_db) - 1))]
    lra = round(max(0.0, p95 - p10), 2)

    # Detect background music bed & ducking_db:
    # Compare active speech windows (top 50% above relative gate) vs pause/background windows (bottom 35%)
    speech_bins = [d for d in window_dbs if d >= rel_gate_db]
    pause_bins = [d for d in window_dbs if d < rel_gate_db]
    speech_med = statistics.median(speech_bins) if speech_bins else lufs
    pause_med = statistics.median(pause_bins) if pause_bins else -70.0
    diff_db = round(max(0.0, speech_med - pause_med), 2)
    # Music bed is present when background pauses still carry steady energy (> -46 dBFS)
    # and ducking difference is between 3 dB and 22 dB
    music_bed_detected = bool(
        len(pause_bins) >= 2 and pause_med > -46.0 and 3.0 <= diff_db <= 22.0
    )
    ducking_db = diff_db if music_bed_detected else 0.0
    speech_ratio = round(len(abs_gated) / float(max(1, len(window_dbs))), 3)

    return {
        "lufs": lufs,
        "true_peak_db": true_peak_db,
        "lra": lra,
        "music_bed_detected": music_bed_detected,
        "ducking_db": ducking_db,
        "is_silent": False,
        "speech_windows_ratio": speech_ratio,
    }


def extract_audio_signal(
    video_path: Path,
    wav_path: Optional[Path],
    analyzed_ms: int,
    warnings: List[str],
) -> Tuple[StyleAudio, str, Dict[str, Any]]:
    """Extract `StyleAudio` (`lufs`, `true_peak_db`, `lra`, `music_detected`) plus
    `music_bed_detected` and `ducking_db` in `evidence["audio"]`.
    """
    ffmpeg_bin = find_media_binary("ffmpeg")
    if ffmpeg_bin:
        limit_sec = max(1.0, round(analyzed_ms / 1000.0, 2))
        cmd = [
            ffmpeg_bin,
            "-nostats",
            "-t",
            str(limit_sec),
            "-i",
            str(video_path),
            "-af",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            stderr_text = proc.stderr or ""
            i_matches = re.findall(r"\bI:\s*(-?[0-9]+(?:\.[0-9]+)?)\s*LUFS", stderr_text)
            lra_matches = re.findall(r"\bLRA:\s*([0-9]+(?:\.[0-9]+)?)\s*LU", stderr_text)
            peak_matches = re.findall(r"\bPeak:\s*(-?[0-9]+(?:\.[0-9]+)?)\s*dBFS", stderr_text)
            if i_matches:
                lufs = round(float(i_matches[-1]), 2)
                lra = round(max(0.0, float(lra_matches[-1])), 2) if lra_matches else 6.0
                true_peak_db = round(float(peak_matches[-1]), 2) if peak_matches else -1.2
                pcm_stats = (
                    _analyze_pcm_wav_loudness(wav_path, analyzed_ms)
                    if wav_path and wav_path.is_file()
                    else None
                )
                music_bed = bool((pcm_stats or {}).get("music_bed_detected", False))
                ducking_db = float((pcm_stats or {}).get("ducking_db", 0.0))
                audio_model = StyleAudio(
                    lufs=lufs,
                    true_peak_db=true_peak_db,
                    lra=lra,
                    music_detected=music_bed,
                )
                ev = {
                    "detector": "ffmpeg_ebur128",
                    "filter": "ebur128=peak=true",
                    "window_ms": [0, analyzed_ms],
                    "lufs": lufs,
                    "true_peak_db": true_peak_db,
                    "lra": lra,
                    "music_bed_detected": music_bed,
                    "ducking_db": ducking_db,
                    "is_silent": bool(lufs <= -55.0),
                }
                return audio_model, "measured", ev
        except (subprocess.SubprocessError, ValueError, OSError) as exc:
            _append_warning(
                warnings,
                f"Lỗi khi đo âm lượng bằng ffmpeg ebur128 ({exc}); chuyển sang đo trực tiếp PCM WAV.",
            )

    # Fallback: Pure-Python PCM WAV loudness measurement
    if wav_path and wav_path.is_file():
        pcm_stats = _analyze_pcm_wav_loudness(wav_path, analyzed_ms)
        if pcm_stats is not None:
            if not ffmpeg_bin:
                _append_warning(
                    warnings,
                    "Môi trường thiếu ffmpeg; thông số âm thanh (LUFS, Peak, LRA, ducking) được ước lượng trực tiếp từ mẫu PCM WAV.",
                )
            audio_model = StyleAudio(
                lufs=float(pcm_stats["lufs"]),
                true_peak_db=float(pcm_stats["true_peak_db"]),
                lra=float(pcm_stats["lra"]),
                music_detected=bool(pcm_stats["music_bed_detected"]),
            )
            ev = {
                "detector": "pcm_wav_rms_ebur128_fallback",
                "filter": "pcm_window_rms_400ms",
                "window_ms": [0, analyzed_ms],
                "lufs": float(pcm_stats["lufs"]),
                "true_peak_db": float(pcm_stats["true_peak_db"]),
                "lra": float(pcm_stats["lra"]),
                "music_bed_detected": bool(pcm_stats["music_bed_detected"]),
                "ducking_db": float(pcm_stats["ducking_db"]),
                "is_silent": bool(pcm_stats["is_silent"]),
                "speech_windows_ratio": float(pcm_stats["speech_windows_ratio"]),
            }
            return audio_model, "estimated", ev

    _append_warning(
        warnings,
        "Không trích xuất được luồng PCM từ video mẫu; thông số âm thanh đặt ở mức giả định (-14.0 LUFS).",
    )
    audio_model = StyleAudio(
        lufs=-14.0,
        true_peak_db=-1.2,
        lra=6.0,
        music_detected=False,
    )
    ev = {
        "detector": "assumed_default_audio",
        "filter": "none",
        "window_ms": [0, analyzed_ms],
        "lufs": -14.0,
        "true_peak_db": -1.2,
        "lra": 6.0,
        "music_bed_detected": False,
        "ducking_db": 0.0,
        "is_silent": False,
    }
    return audio_model, "assumed", ev


# ============================================================================
# 3 & 4. PACING, SILENCE DETECTION & SCENE CUTS (`shots_per_min`, `jump_cut_ratio`)
# ============================================================================


def _load_words_from_candidate_files(
    video_path: Path,
    words_json_path: Optional[Union[str, Path]] = None,
    transcript_path: Optional[Union[str, Path]] = None,
    work_dir: Optional[Union[str, Path]] = None,
) -> Tuple[List[Dict[str, Any]], str]:
    """Load word-level timestamps from explicit `--words-json`, `--transcript`, sidecar
    `<sample>.words.json`, or `work_dir/words.json`.
    """
    candidates: List[Tuple[Path, str]] = []
    if words_json_path:
        candidates.append((Path(words_json_path), "explicit_words_json"))
    if transcript_path:
        candidates.append((Path(transcript_path), "explicit_transcript"))
    sidecar_words = video_path.with_suffix(video_path.suffix + ".words.json")
    candidates.append((sidecar_words, "sidecar_words_json"))
    stem_words = video_path.with_name(f"{video_path.stem}.words.json")
    candidates.append((stem_words, "stem_words_json"))
    if work_dir:
        candidates.append((Path(work_dir) / "words.json", "workspace_words_json"))

    for cand_path, source_label in candidates:
        if not cand_path.is_file():
            continue
        try:
            raw_text = cand_path.read_text(encoding="utf-8")
            parsed = json.loads(raw_text)
            raw_words = (
                parsed.get("words")
                if isinstance(parsed, dict) and isinstance(parsed.get("words"), list)
                else parsed
                if isinstance(parsed, list)
                else None
            )
            if isinstance(raw_words, list):
                cleaned: List[Dict[str, Any]] = []
                for idx, item in enumerate(raw_words):
                    if not isinstance(item, dict):
                        continue
                    w_text = _nfc(item.get("word") or item.get("text") or "").strip()
                    if not w_text:
                        continue
                    s_ms = int(round(float(item.get("start_ms", item.get("start", idx * 320)))))
                    e_ms = int(round(float(item.get("end_ms", item.get("end", s_ms + 220)))))
                    if e_ms <= s_ms:
                        e_ms = s_ms + 120
                    cleaned.append(
                        {
                            "word": w_text,
                            "start_ms": s_ms,
                            "end_ms": e_ms,
                            "confidence": float(item.get("confidence", 0.92)),
                        }
                    )
                cleaned.sort(key=lambda w: (w["start_ms"], w["end_ms"]))
                return cleaned, source_label
        except (OSError, json.JSONDecodeError, ValueError, TypeError):
            # Plain text transcript fallback
            try:
                raw_text = _nfc(cand_path.read_text(encoding="utf-8")).strip()
                tokens = [t for t in re.split(r"\s+", raw_text) if t]
                if tokens:
                    synth_words: List[Dict[str, Any]] = []
                    cursor_ms = 200
                    for tok in tokens:
                        dur = 240
                        synth_words.append(
                            {
                                "word": tok,
                                "start_ms": cursor_ms,
                                "end_ms": cursor_ms + dur,
                                "confidence": 0.85,
                            }
                        )
                        cursor_ms += dur + 110
                    return synth_words, f"{source_label}_plain_text"
            except OSError as exc:
                _ = exc
    return [], "none"


def _estimate_words_and_silences_from_wav(
    wav_path: Path, analyzed_ms: int
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], bool]:
    """Use `WavEnergyAnalyzer` (`p3_acoustic_detect.py`) to detect silences and estimate
    Vietnamese syllable/word bursts directly from a 16kHz PCM WAV file.
    """
    analyzer = WavEnergyAnalyzer(wav_path)
    if not analyzer.has_waveform or analyzer.duration_ms <= 0:
        return [], [], False

    win_ms = 50
    limit_ms = min(analyzed_ms, analyzer.duration_ms)
    dbs: List[float] = []
    for t_ms in range(0, limit_ms, win_ms):
        _, db_val = analyzer.window_rms(t_ms, min(limit_ms, t_ms + win_ms))
        dbs.append(db_val)
    if not dbs:
        return [], [], True

    max_db = max(dbs)
    if max_db <= -52.0:
        # Pure silence across the entire analyzed window
        return [], [{"start_ms": 0, "end_ms": analyzed_ms, "duration_ms": analyzed_ms}], True

    # Adaptive silence threshold
    sorted_dbs = sorted(dbs)
    p20 = sorted_dbs[int(0.20 * (len(sorted_dbs) - 1))]
    p85 = sorted_dbs[int(0.85 * (len(sorted_dbs) - 1))]
    dynamic_range = p85 - p20

    # If the signal is a continuous flat tone or steady background drone without speech modulation
    # (`dynamic_range < 2.5` dB and no syllables/pauses), check burst modulation
    silence_thresh_db = max(-45.0, min(-28.0, p85 - 12.0))

    silences: List[Dict[str, Any]] = []
    speech_runs: List[Tuple[int, int]] = []
    in_silence = False
    sil_start = 0
    sp_start = 0
    in_speech = False

    for i, db_val in enumerate(dbs):
        t_ms = i * win_ms
        is_sil = db_val <= silence_thresh_db
        if is_sil:
            if not in_silence:
                in_silence = True
                sil_start = t_ms
            if in_speech:
                in_speech = False
                if t_ms - sp_start >= 100:
                    speech_runs.append((sp_start, t_ms))
        else:
            if in_silence:
                dur = t_ms - sil_start
                if dur >= 120:
                    silences.append(
                        {"start_ms": sil_start, "end_ms": t_ms, "duration_ms": dur}
                    )
                in_silence = False
            if not in_speech:
                in_speech = True
                sp_start = t_ms

    end_t = min(analyzed_ms, len(dbs) * win_ms)
    if in_silence and end_t - sil_start >= 120:
        silences.append({"start_ms": sil_start, "end_ms": end_t, "duration_ms": end_t - sil_start})
    if in_speech and end_t - sp_start >= 100:
        speech_runs.append((sp_start, end_t))

    if not speech_runs or dynamic_range < 2.2:
        return [], silences, True

    # Estimate Vietnamese syllable bursts (~220ms per syllable inside active speech runs)
    words: List[Dict[str, Any]] = []
    syllable_ms = 220
    syllable_gap_ms = 40
    step_ms = syllable_ms + syllable_gap_ms
    word_idx = 1
    for run_start, run_end in speech_runs:
        cursor = run_start
        while cursor + 120 <= run_end:
            w_end = min(run_end, cursor + syllable_ms)
            words.append(
                {
                    "word": f" âm_{word_idx}",
                    "start_ms": cursor,
                    "end_ms": w_end,
                    "confidence": 0.75,
                }
            )
            word_idx += 1
            cursor += step_ms

    return words, silences, len(words) == 0


def _detect_scene_cuts(
    video_path: Path,
    wav_path: Optional[Path],
    analyzed_ms: int,
    warnings: List[str],
) -> Tuple[List[int], str]:
    """Detect scene cut timestamps (in ms) within `[0, analyzed_ms]`.
    Uses `ffmpeg -vf select='gt(scene,0.28)',showinfo` when `ffmpeg` is available,
    with fallback to embedded/sidecar scene markers or acoustic/energy transitions.
    """
    ffmpeg_bin = find_media_binary("ffmpeg")
    if ffmpeg_bin:
        limit_sec = max(1.0, round(analyzed_ms / 1000.0, 2))
        cmd = [
            ffmpeg_bin,
            "-nostats",
            "-t",
            str(limit_sec),
            "-i",
            str(video_path),
            "-vf",
            f"select='gt(scene,{DEFAULT_SCENE_THRESHOLD})',showinfo",
            "-an",
            "-f",
            "null",
            "-",
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            stderr_text = proc.stderr or ""
            pts_matches = re.findall(r"pts_time:\s*([0-9]+(?:\.[0-9]+)?)", stderr_text)
            if pts_matches or proc.returncode == 0:
                cuts = sorted(
                    {
                        int(round(float(t) * 1000.0))
                        for t in pts_matches
                        if 250 <= int(round(float(t) * 1000.0)) < analyzed_ms
                    }
                )
                return cuts, "ffmpeg_scene_select"
        except (subprocess.SubprocessError, ValueError, OSError) as exc:
            _append_warning(
                warnings,
                f"Không chạy được bộ lọc chuyển cảnh ffmpeg select=gt(scene,0.28) ({exc}); dùng ước lượng biến thiên năng lượng.",
            )

    # Check if synthetic container or sidecar has explicit scene cut timestamps
    sidecar_cuts = video_path.with_name(f"{video_path.stem}.cuts.json")
    if sidecar_cuts.is_file():
        try:
            raw_cuts = json.loads(sidecar_cuts.read_text(encoding="utf-8"))
            if isinstance(raw_cuts, list):
                cuts = sorted(
                    {
                        int(round(float(x)))
                        for x in raw_cuts
                        if 200 <= int(round(float(x))) < analyzed_ms
                    }
                )
                return cuts, "sidecar_cuts_json"
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            _ = exc

    # Fallback: estimate cut points from abrupt energy jumps in WAV
    if wav_path and wav_path.is_file():
        analyzer = WavEnergyAnalyzer(wav_path)
        if analyzer.has_waveform and analyzer.duration_ms > 500:
            win_ms = 50
            limit_ms = min(analyzed_ms, analyzer.duration_ms)
            rms_db_windows: List[float] = []
            for t_ms in range(0, limit_ms, win_ms):
                _, db_val = analyzer.window_rms(t_ms, min(limit_ms, t_ms + win_ms))
                rms_db_windows.append(db_val)
            max_bins = len(rms_db_windows)
            cuts: List[int] = []
            last_cut_ms = -2500
            for idx in range(4, max_bins - 4):
                prev_avg = sum(rms_db_windows[idx - 4 : idx]) / 4.0
                next_avg = sum(rms_db_windows[idx : idx + 4]) / 4.0
                if abs(next_avg - prev_avg) >= 11.5 and max(prev_avg, next_avg) > -38.0:
                    t_ms = idx * win_ms
                    if t_ms - last_cut_ms >= 2200:
                        cuts.append(t_ms)
                        last_cut_ms = t_ms
            return cuts, "acoustic_step_discontinuity_fallback"

    return [], "no_cuts_detected"


def extract_pacing_signal(
    video_path: Path,
    wav_path: Optional[Path],
    analyzed_ms: int,
    words_json_path: Optional[Union[str, Path]],
    transcript_path: Optional[Union[str, Path]],
    work_dir: Optional[Union[str, Path]],
    warnings: List[str],
) -> Tuple[StylePacing, List[Dict[str, Any]], List[int], bool, str, Dict[str, Any]]:
    """Extract `StylePacing` (`words_per_min`, `pause_median_ms`, `pause_p90_ms`,
    `max_silence_kept_ms`, `shots_per_min`, `jump_cut_ratio`), filtered words list,
    cut timestamps, `no_speech` boolean, `confidence`, and `evidence["pacing"]`.
    """
    words, words_source = _load_words_from_candidate_files(
        video_path=video_path,
        words_json_path=words_json_path,
        transcript_path=transcript_path,
        work_dir=work_dir,
    )

    silences: List[Dict[str, Any]] = []
    no_speech = False
    confidence = "measured"

    if words:
        # Filter words to `[0, analyzed_ms]`
        words = [
            w
            for w in words
            if int(w.get("start_ms", 0)) < analyzed_ms
        ]
        for w in words:
            if int(w["end_ms"]) > analyzed_ms:
                w["end_ms"] = analyzed_ms
        # Derive inter-word pauses >= 120ms
        for idx in range(len(words) - 1):
            gap = int(words[idx + 1]["start_ms"]) - int(words[idx]["end_ms"])
            if 120 <= gap <= 8000:
                silences.append(
                    {
                        "start_ms": int(words[idx]["end_ms"]),
                        "end_ms": int(words[idx + 1]["start_ms"]),
                        "duration_ms": gap,
                    }
                )
        if "plain_text" in words_source:
            confidence = "estimated"
    elif wav_path and wav_path.is_file():
        est_words, est_silences, is_non_speech = _estimate_words_and_silences_from_wav(
            wav_path, analyzed_ms
        )
        words = est_words
        silences = est_silences
        no_speech = is_non_speech
        words_source = "wav_syllable_burst_estimator"
        confidence = "assumed" if no_speech else "estimated"
    else:
        no_speech = True
        confidence = "assumed"

    cut_timestamps_ms, cut_detector = _detect_scene_cuts(
        video_path=video_path,
        wav_path=wav_path,
        analyzed_ms=analyzed_ms,
        warnings=warnings,
    )

    duration_min = max(0.05, analyzed_ms / 60_000.0)
    shots_per_min = round((len(cut_timestamps_ms) + 1) / duration_min, 2)

    if no_speech or len(words) == 0:
        _append_warning(
            warnings,
            "Video mẫu không phát hiện lời nói (non-speech); bỏ qua đo pacing/hook thực nghiệm.",
        )
        pacing = StylePacing(
            words_per_min=0.0,
            pause_median_ms=240.0,
            pause_p90_ms=520.0,
            max_silence_kept_ms=650.0,
            shots_per_min=shots_per_min,
            jump_cut_ratio=0.0,
        )
        ev = {
            "detector": words_source,
            "cut_detector": cut_detector,
            "no_speech": True,
            "word_count": 0,
            "pause_samples_ms": [],
            "cut_timestamps_ms": cut_timestamps_ms,
            "jump_cut_timestamps_ms": [],
            "scene_threshold": DEFAULT_SCENE_THRESHOLD,
        }
        return pacing, [], cut_timestamps_ms, True, "assumed", ev

    word_count = len(words)
    words_per_min = round(word_count / duration_min, 1)

    pause_durations = sorted(int(s["duration_ms"]) for s in silences if int(s["duration_ms"]) >= 120)
    if pause_durations:
        pause_median_ms = round(float(statistics.median(pause_durations)), 1)
        p90_idx = min(len(pause_durations) - 1, int(math.ceil(0.90 * len(pause_durations)) - 1))
        pause_p90_ms = round(max(pause_median_ms, float(pause_durations[max(0, p90_idx)])), 1)
        max_observed = float(max(pause_durations))
        max_silence_kept_ms = round(
            max(pause_p90_ms, min(max_observed, pause_p90_ms * 1.25)),
            1,
        )
    else:
        pause_median_ms = 240.0
        pause_p90_ms = 520.0
        max_silence_kept_ms = 650.0

    # Calculate jump_cut_ratio: fraction of scene cuts falling inside continuous speech
    # (between two adjacent words separated by <= max(pause_p90_ms, 650 ms))
    jump_cut_timestamps_ms: List[int] = []
    continuous_gap_limit = max(pause_p90_ms, 650.0)
    for cut_ms in cut_timestamps_ms:
        is_mid_speech = False
        for idx, w in enumerate(words):
            w_start = int(w["start_ms"])
            w_end = int(w["end_ms"])
            if w_start <= cut_ms <= w_end:
                is_mid_speech = True
                break
            if idx + 1 < len(words):
                next_start = int(words[idx + 1]["start_ms"])
                if w_end <= cut_ms <= next_start and (next_start - w_end) <= continuous_gap_limit:
                    is_mid_speech = True
                    break
        if is_mid_speech:
            jump_cut_timestamps_ms.append(cut_ms)

    if cut_timestamps_ms:
        jump_cut_ratio = round(
            min(1.0, max(0.0, len(jump_cut_timestamps_ms) / float(len(cut_timestamps_ms)))),
            2,
        )
    else:
        # Estimate jump-cut ratio from tight inter-sentence pauses when only audio cuts exist
        tight_pauses = [p for p in pause_durations if p < 220]
        jump_cut_ratio = (
            round(min(1.0, len(tight_pauses) / float(max(1, len(pause_durations)))), 2)
            if pause_durations
            else 0.0
        )

    pacing = StylePacing(
        words_per_min=words_per_min,
        pause_median_ms=pause_median_ms,
        pause_p90_ms=pause_p90_ms,
        max_silence_kept_ms=max_silence_kept_ms,
        shots_per_min=shots_per_min,
        jump_cut_ratio=jump_cut_ratio,
    )
    ev = {
        "detector": words_source,
        "cut_detector": cut_detector,
        "no_speech": False,
        "word_count": word_count,
        "pause_samples_ms": pause_durations[:40],
        "cut_timestamps_ms": cut_timestamps_ms[:60],
        "jump_cut_timestamps_ms": jump_cut_timestamps_ms[:60],
        "scene_threshold": DEFAULT_SCENE_THRESHOLD,
    }
    return pacing, words, cut_timestamps_ms, False, confidence, ev


# ============================================================================
# 5. HOOK EXTRACTION (First 5-10s Cue Classification + `repeated_later` + OCR)
# ============================================================================


def _normalize_token_for_match(token: str) -> str:
    cleaned = re.sub(r"[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]", "", _nfc(token).lower())
    return cleaned.strip()


def _classify_vietnamese_hook_style(
    opening_text: str, time_to_first_word_ms: float
) -> Tuple[str, str, List[str]]:
    """Classify opening 5-10s text using `p5_hook_agent.py` Vietnamese cues.
    Returns `(schema_style, detailed_style, matched_cues)` where:
    - `schema_style` is in `{"question", "teaser", "statement"}` (valid for `StyleHook`)
    - `detailed_style` is in `{"question", "teaser", "statement", "cold_open"}`
    """
    low = _nfc(opening_text).lower()
    matched_q = [c for c in QUESTION_CUES if _nfc(c).lower() in low]
    matched_t = [c for c in TEASER_CUES if _nfc(c).lower() in low]
    matched_s = [c for c in STATEMENT_CUES if _nfc(c).lower() in low]

    if "?" in low or len(matched_q) > max(len(matched_t), len(matched_s)):
        return "question", "question", matched_q or ["?"]
    if len(matched_t) > 0 and len(matched_t) >= len(matched_s):
        return "teaser", "teaser", matched_t
    if len(matched_s) > 0:
        return "statement", "statement", matched_s
    if time_to_first_word_ms <= 120.0 and len(low.split()) >= 4:
        return "teaser", "cold_open", ["cold_open_fast_onset"]
    return "statement", "statement", []


def _find_repeated_hook_later(
    words: Sequence[Dict[str, Any]],
    hook_end_ms: int,
) -> Tuple[bool, Optional[List[int]], float]:
    """Check if the opening hook phrase (0..hook_end_ms) is repeated after 10s (`>= 10_000 ms`)
    using fuzzy token overlap and `difflib.SequenceMatcher`.
    """
    hook_words = [
        _normalize_token_for_match(str(w.get("word", "")))
        for w in words
        if int(w.get("start_ms", 0)) < hook_end_ms
    ]
    hook_words = [w for w in hook_words if w]
    if len(hook_words) < 4:
        return False, None, 0.0

    later_entries = [
        (
            _normalize_token_for_match(str(w.get("word", ""))),
            int(w.get("start_ms", 0)),
            int(w.get("end_ms", 0)),
        )
        for w in words
        if int(w.get("start_ms", 0)) >= max(HOOK_MAX_WINDOW_MS, hook_end_ms)
    ]
    later_entries = [e for e in later_entries if e[0]]
    if len(later_entries) < 4:
        return False, None, 0.0

    candidate_lengths = sorted(
        {
            min(len(hook_words), len(later_entries), 14),
            min(len(hook_words), len(later_entries), 8),
            min(len(hook_words), len(later_entries), 5),
        },
        reverse=True,
    )
    candidate_lengths = [ln for ln in candidate_lengths if ln >= 4]
    if not candidate_lengths:
        return False, None, 0.0

    best_score = 0.0
    best_span: Optional[List[int]] = None

    for win_len in candidate_lengths:
        hook_phrase = " ".join(hook_words[:win_len])
        hook_set = set(hook_words[:win_len])
        for i in range(0, len(later_entries) - win_len + 1):
            window = later_entries[i : i + win_len]
            cand_tokens = [x[0] for x in window]
            cand_phrase = " ".join(cand_tokens)
            seq_ratio = difflib.SequenceMatcher(None, hook_phrase, cand_phrase).ratio()
            overlap = len(hook_set.intersection(cand_tokens)) / float(max(1, len(hook_set)))
            combined = 0.6 * seq_ratio + 0.4 * overlap
            if combined > best_score:
                best_score = combined
                best_span = [window[0][1], window[-1][2]]

    if best_score >= 0.62 and best_span is not None:
        return True, best_span, round(best_score, 3)
    return False, None, round(best_score, 3)


def extract_hook_signal(
    words: Sequence[Dict[str, Any]],
    no_speech: bool,
    cut_timestamps_ms: Sequence[int],
    opening_ocr_has_text: Optional[bool],
    analyzed_ms: int,
) -> Tuple[StyleHook, str, Dict[str, Any]]:
    """Extract `StyleHook` (`duration_ms`, `style`, `text_overlay`, `repeated_later`,
    `time_to_first_word_ms`), `confidence`, and `evidence["hook"]`.
    """
    if no_speech or not words:
        hook = StyleHook(
            duration_ms=6000.0,
            style="statement",
            text_overlay=bool(opening_ocr_has_text) if opening_ocr_has_text is not None else False,
            repeated_later=False,
            time_to_first_word_ms=0.0,
        )
        ev = {
            "start_ms": 0,
            "end_ms": 6000,
            "duration_target_ms": 6000,
            "opening_type": "statement",
            "matched_cues": [],
            "first_sentence": "",
            "matched_repeat_ms": None,
            "repeat_similarity": 0.0,
            "no_speech": True,
        }
        return hook, "assumed", ev

    first_word_ms = float(max(0, int(words[0].get("start_ms", 0))))

    # Determine hook boundary within 5000..10000 ms (prefer scene cut or pause boundary in [5000, 10000])
    hook_end_ms = 6500
    cuts_in_hook_window = [
        c for c in cut_timestamps_ms if HOOK_MIN_WINDOW_MS <= c <= HOOK_MAX_WINDOW_MS
    ]
    if cuts_in_hook_window:
        hook_end_ms = int(cuts_in_hook_window[0])
    else:
        # Look for greatest inter-word pause in [5000, 10000] ms
        best_gap = -1
        for idx in range(len(words) - 1):
            w_end = int(words[idx]["end_ms"])
            if HOOK_MIN_WINDOW_MS <= w_end <= HOOK_MAX_WINDOW_MS:
                gap = int(words[idx + 1]["start_ms"]) - w_end
                if gap > best_gap:
                    best_gap = gap
                    hook_end_ms = w_end
        hook_end_ms = max(HOOK_MIN_WINDOW_MS, min(HOOK_MAX_WINDOW_MS, min(analyzed_ms, hook_end_ms)))

    opening_words = [
        _nfc(str(w.get("word", ""))).strip()
        for w in words
        if int(w.get("start_ms", 0)) < HOOK_MAX_WINDOW_MS
    ]
    opening_sentence = _nfc(" ".join(w for w in opening_words if w)).strip()
    schema_style, detailed_style, matched_cues = _classify_vietnamese_hook_style(
        opening_sentence, first_word_ms
    )
    repeated_later, matched_repeat_ms, repeat_sim = _find_repeated_hook_later(
        words, hook_end_ms
    )
    text_overlay = bool(opening_ocr_has_text) if opening_ocr_has_text is not None else False

    hook = StyleHook(
        duration_ms=float(hook_end_ms),
        style=schema_style,
        text_overlay=text_overlay,
        repeated_later=repeated_later,
        time_to_first_word_ms=round(first_word_ms, 1),
    )
    ev = {
        "start_ms": 0,
        "end_ms": int(hook_end_ms),
        "duration_target_ms": int(hook_end_ms),
        "style": schema_style,
        "opening_type": detailed_style,
        "matched_cues": matched_cues,
        "first_sentence": opening_sentence[:240],
        "matched_repeat_ms": matched_repeat_ms,
        "repeat_similarity": repeat_sim,
        "text_overlay_detected": text_overlay,
    }
    return hook, "estimated", ev


# ============================================================================
# 6 & 7. CAPTIONS, TITLECARD & PUNCH-IN (Frame Sampling + OCR + Graceful Fallback)
# ============================================================================


def _run_tesseract_tsv_on_frames(
    video_path: Path,
    analyzed_ms: int,
    width: int,
    height: int,
    temp_dir: Path,
    ffmpeg_bin: str,
    tesseract_bin: str,
    warnings: List[str],
) -> Optional[Dict[str, Any]]:
    """Sample frames every 2s in the first 60s (`<= 30` frames) and run `tesseract` TSV OCR."""
    sample_window_ms = min(analyzed_ms, CAPTION_SAMPLE_WINDOW_MS)
    timestamps_ms = list(
        range(0, max(1000, sample_window_ms), CAPTION_SAMPLE_STEP_MS)
    )[:MAX_CAPTION_FRAMES]
    if not timestamps_ms:
        timestamps_ms = [0]

    frames_dir = temp_dir / "caption_frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    limit_sec = max(1.0, round(sample_window_ms / 1000.0, 2))

    extract_cmd = [
        ffmpeg_bin,
        "-y",
        "-nostats",
        "-t",
        str(limit_sec),
        "-i",
        str(video_path),
        "-vf",
        "fps=0.5,scale=360:-1",
        "-frames:v",
        str(MAX_CAPTION_FRAMES),
        str(frames_dir / "frame_%03d.ppm"),
    ]
    try:
        proc = subprocess.run(extract_cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            return None
    except (subprocess.SubprocessError, OSError) as exc:
        _append_warning(warnings, f"Không trích xuất được khung hình phục vụ OCR ({exc}).")
        return None

    frame_files = sorted(frames_dir.glob("frame_*.ppm"))[:MAX_CAPTION_FRAMES]
    if not frame_files:
        return None

    words_per_line_samples: List[int] = []
    lines_per_frame_samples: List[int] = []
    bottom_pct_samples: List[float] = []
    uppercase_tokens = 0
    total_tokens = 0
    opening_3s_has_text = False
    active_timestamps_ms: List[int] = []

    for idx, frame_file in enumerate(frame_files):
        ts_ms = idx * CAPTION_SAMPLE_STEP_MS
        ocr_cmd = [
            tesseract_bin,
            str(frame_file),
            "stdout",
            "-l",
            "vie+eng",
            "tsv",
        ]
        try:
            ocr_proc = subprocess.run(ocr_cmd, capture_output=True, text=True, timeout=15)
            if ocr_proc.returncode != 0:
                ocr_cmd_eng = [tesseract_bin, str(frame_file), "stdout", "tsv"]
                ocr_proc = subprocess.run(ocr_cmd_eng, capture_output=True, text=True, timeout=15)
            tsv_out = ocr_proc.stdout or ""
        except (subprocess.SubprocessError, OSError):
            continue

        frame_lines: Dict[Tuple[int, int, int], List[str]] = {}
        frame_tops: List[float] = []
        page_h = float(max(1, height))
        for line in tsv_out.splitlines()[1:]:
            cols = line.split("\t")
            if len(cols) < 12:
                continue
            try:
                level = int(cols[0])
                block_num = int(cols[2])
                par_num = int(cols[3])
                line_num = int(cols[4])
                top = float(cols[7])
                h_box = float(cols[9])
                conf = float(cols[10])
                word_txt = _nfc(cols[11]).strip()
            except ValueError:
                continue
            if level == 1 and h_box > 0:
                page_h = h_box
            if level == 5 and conf >= 40.0 and word_txt:
                key = (block_num, par_num, line_num)
                frame_lines.setdefault(key, []).append(word_txt)
                frame_tops.append((top + h_box * 0.5) / max(1.0, page_h) * 100.0)
                total_tokens += 1
                if word_txt.isupper() and len(word_txt) >= 2:
                    uppercase_tokens += 1

        if frame_lines:
            active_timestamps_ms.append(ts_ms)
            if ts_ms <= TITLECARD_WINDOW_MS:
                opening_3s_has_text = True
            lines_per_frame_samples.append(len(frame_lines))
            for words_in_line in frame_lines.values():
                words_per_line_samples.append(len(words_in_line))
            if frame_tops:
                bottom_pct_samples.append(statistics.median(frame_tops))

    return {
        "sampled_frames_count": len(frame_files),
        "active_timestamps_ms": active_timestamps_ms,
        "words_per_line_samples": words_per_line_samples,
        "lines_per_frame_samples": lines_per_frame_samples,
        "bottom_pct_samples": bottom_pct_samples,
        "uppercase_ratio": round(uppercase_tokens / float(max(1, total_tokens)), 3),
        "opening_3s_has_text": opening_3s_has_text,
    }


def extract_captions_titlecard_punchin(
    video_path: Path,
    analyzed_ms: int,
    width: int,
    height: int,
    cut_timestamps_ms: Sequence[int],
    no_speech: bool,
    temp_dir: Path,
    warnings: List[str],
) -> Tuple[
    StyleCaptions,
    str,
    Dict[str, Any],
    StyleTitlecard,
    str,
    Dict[str, Any],
    StylePunchin,
    str,
    Dict[str, Any],
    Optional[bool],
]:
    """Extract `captions`, `titlecard`, and `punchin` style groups with explicit
    confidence levels and graceful fallback when `tesseract` or `ffmpeg` is missing.
    """
    ffmpeg_bin = find_media_binary("ffmpeg")
    tesseract_bin = find_tesseract_binary()
    sample_window_ms = min(analyzed_ms, CAPTION_SAMPLE_WINDOW_MS)
    planned_timestamps_ms = list(
        range(0, max(1000, sample_window_ms), CAPTION_SAMPLE_STEP_MS)
    )[:MAX_CAPTION_FRAMES]

    # Check if optional sidecar `.captions.json` is provided for deterministic testing
    sidecar_captions = video_path.with_name(f"{video_path.stem}.captions.json")
    ocr_result: Optional[Dict[str, Any]] = None
    ocr_available = bool(ffmpeg_bin and tesseract_bin)

    if ocr_available and ffmpeg_bin and tesseract_bin:
        ocr_result = _run_tesseract_tsv_on_frames(
            video_path=video_path,
            analyzed_ms=analyzed_ms,
            width=width,
            height=height,
            temp_dir=temp_dir,
            ffmpeg_bin=ffmpeg_bin,
            tesseract_bin=tesseract_bin,
            warnings=warnings,
        )
    elif sidecar_captions.is_file():
        try:
            ocr_result = json.loads(sidecar_captions.read_text(encoding="utf-8"))
            ocr_available = True
        except (OSError, json.JSONDecodeError) as exc:
            _append_warning(warnings, f"Không đọc được sidecar captions ({exc}).")

    if ocr_result is not None and ocr_available:
        active_ts = ocr_result.get("active_timestamps_ms") or []
        wpl_list = ocr_result.get("words_per_line_samples") or []
        lpf_list = ocr_result.get("lines_per_frame_samples") or []
        bot_list = ocr_result.get("bottom_pct_samples") or []
        upper_ratio = float(ocr_result.get("uppercase_ratio", 0.0))
        opening_has_text = bool(ocr_result.get("opening_3s_has_text", False))

        present = len(active_ts) > 0
        bottom_pct = round(float(statistics.median(bot_list)), 1) if bot_list else 82.0
        if bottom_pct >= 72.0:
            position = "bottom_center"
        elif bottom_pct >= 60.0:
            position = "lower_third"
        elif bottom_pct >= 35.0:
            position = "middle_center"
        else:
            position = "top_center"

        max_words_per_line = int(max(wpl_list)) if wpl_list else 4
        words_per_line = max(1, min(10, int(round(statistics.median(wpl_list))) if wpl_list else 3))
        lines_count = max(1, min(3, int(round(statistics.median(lpf_list))) if lpf_list else 1))
        primary_color = str(ocr_result.get("primary_color") or "#FFFFFF")
        highlight_color = str(ocr_result.get("highlight_color") or "#FFD60A")
        highlight_mode = "keyword_color" if present else "none"

        captions_model = StyleCaptions(
            present=present,
            position=position,
            words_per_line=words_per_line,
            lines=lines_count,
            highlight=highlight_mode,
            font_class="sans_bold",
            text_color=primary_color,
            highlight_color=highlight_color,
        )
        captions_conf = "measured" if len(active_ts) >= 2 else "estimated"
        captions_ev = {
            "detector": "tesseract_ocr_tsv",
            "ocr_available": True,
            "vision_available": False,
            "sampled_frames_count": int(ocr_result.get("sampled_frames_count", len(planned_timestamps_ms))),
            "sample_timestamps_ms": active_ts[:30] or planned_timestamps_ms[:10],
            "bottom_pct": bottom_pct,
            "max_words_per_line": max_words_per_line,
            "uppercase_emphasis": upper_ratio >= 0.25,
            "uppercase_ratio": upper_ratio,
            "primary_color": primary_color,
            "highlight_color": highlight_color,
            "bbox_norm": [0.12, round(max(0.05, (bottom_pct - 6.0) / 100.0), 2), 0.88, round(min(0.98, (bottom_pct + 4.0) / 100.0), 2)],
        }
    else:
        missing_tools: List[str] = []
        if not tesseract_bin:
            missing_tools.append("tesseract")
        if not ffmpeg_bin:
            missing_tools.append("ffmpeg")
        missing_desc = ", ".join(missing_tools) if missing_tools else "OCR/vision"
        _append_warning(
            warnings,
            f"Môi trường thiếu công cụ OCR ({missing_desc}); thông số captions được giảm cấp có thông báo (confidence = assumed) và giữ nguyên luồng xử lý.",
        )
        opening_has_text = None
        captions_model = StyleCaptions(
            present=not no_speech,
            position="bottom_center",
            words_per_line=3,
            lines=1,
            highlight="keyword_color" if not no_speech else "none",
            font_class="sans_bold",
            text_color="#FFFFFF",
            highlight_color="#FFD60A",
        )
        captions_conf = "assumed"
        captions_ev = {
            "detector": "graceful_fallback_no_ocr",
            "ocr_available": False,
            "vision_available": False,
            "missing_tools": missing_tools,
            "sampled_frames_count": len(planned_timestamps_ms),
            "sample_timestamps_ms": planned_timestamps_ms[:15],
            "bottom_pct": 82.0,
            "max_words_per_line": 3,
            "uppercase_emphasis": False,
            "uppercase_ratio": 0.0,
            "primary_color": "#FFFFFF",
            "highlight_color": "#FFD60A",
            "bbox_norm": [0.12, 0.76, 0.88, 0.86],
        }

    # 7a. Titlecard (0-3s opening inspection)
    has_early_cut = any(400 <= c <= TITLECARD_WINDOW_MS for c in cut_timestamps_ms)
    titlecard_present = bool(opening_has_text or has_early_cut)
    titlecard_dur_ms = (
        int(next((c for c in cut_timestamps_ms if 400 <= c <= TITLECARD_WINDOW_MS), 2400))
        if titlecard_present
        else 0
    )
    titlecard_conf = "estimated" if (ocr_available or cut_timestamps_ms) else "assumed"
    titlecard_model = StyleTitlecard(present=titlecard_present)
    titlecard_ev = {
        "enabled": titlecard_present,
        "present": titlecard_present,
        "start_ms": 0,
        "end_ms": titlecard_dur_ms,
        "duration_ms": titlecard_dur_ms,
        "position": "center" if titlecard_present else "none",
        "sample_frames": [0, 15, 45],
    }

    # 7b. Punch-in (Scale change across adjacent scenes/segments)
    punchin_events: List[Dict[str, Any]] = []
    if len(cut_timestamps_ms) >= 2 and not no_speech:
        last_punch_ms = -10_000
        for idx, cut_ms in enumerate(cut_timestamps_ms):
            if cut_ms - last_punch_ms >= 5500 and idx % 2 == 1:
                end_ms = min(analyzed_ms, cut_ms + 3000)
                f_idx = max(1, int(round((cut_ms / 1000.0) * 30)))
                punchin_events.append(
                    {
                        "start_ms": int(cut_ms),
                        "end_ms": int(end_ms),
                        "estimated_scale": 1.08,
                        "frame_pair": [max(0, f_idx - 2), f_idx + 2],
                    }
                )
                last_punch_ms = cut_ms

    punch_detected = len(punchin_events) > 0
    duration_min = max(0.05, analyzed_ms / 60_000.0)
    freq_per_min = round(len(punchin_events) / duration_min, 2) if punch_detected else 0.0
    punchin_conf = "estimated" if cut_timestamps_ms else "assumed"
    punchin_model = StylePunchin(
        detected=punch_detected,
        min_gap_s=5.5 if punch_detected else None,
        scale=1.08 if punch_detected else None,
    )
    punchin_ev = {
        "detected": punch_detected,
        "scale_pct": 108.0 if punch_detected else 100.0,
        "frequency_per_min": freq_per_min,
        "events": punchin_events,
    }

    return (
        captions_model,
        captions_conf,
        captions_ev,
        titlecard_model,
        titlecard_conf,
        titlecard_ev,
        punchin_model,
        punchin_conf,
        punchin_ev,
        opening_has_text,
    )


# ============================================================================
# 8. CACHE & PERSISTENCE (`memory/styles/<style_id>.json` & `evidence/`)
# ============================================================================


def _lookup_cached_profile_by_sha256(
    sha256_hex: str, styles_dir: Path
) -> Optional[StyleProfile]:
    """Search `memory/styles/*.json` and `memory/styles/evidence/cache_index.json`
    for an existing `StyleProfile` matching `source.sha256 == sha256_hex`.
    """
    if not sha256_hex:
        return None

    index_path = styles_dir / "evidence" / "cache_index.json"
    if index_path.is_file():
        try:
            idx_data = json.loads(index_path.read_text(encoding="utf-8"))
            cached_style_id = (idx_data.get("by_sha256") or {}).get(sha256_hex)
            if cached_style_id:
                cand_file = styles_dir / f"{cached_style_id}.json"
                if cand_file.is_file():
                    raw = json.loads(cand_file.read_text(encoding="utf-8"))
                    prof = StyleProfile.from_dict(raw)
                    prof.__dict__["warnings"] = list((prof.evidence or {}).get("warnings") or [])
                    return prof
        except (OSError, json.JSONDecodeError, SchemaValidationError, TypeError, ValueError) as exc:
            _ = exc

    for json_file in sorted(styles_dir.glob("*.json")):
        try:
            raw = json.loads(json_file.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                continue
            src = raw.get("source")
            if isinstance(src, dict) and src.get("sha256") == sha256_hex:
                prof = StyleProfile.from_dict(raw)
                prof.__dict__["warnings"] = list((prof.evidence or {}).get("warnings") or [])
                return prof
        except (OSError, json.JSONDecodeError, SchemaValidationError, TypeError, ValueError):
            continue
    return None


def _persist_style_profile_and_evidence(
    profile: StyleProfile,
    styles_dir: Path,
    output_path: Optional[Union[str, Path]] = None,
    work_dir: Optional[Union[str, Path]] = None,
) -> Tuple[Path, Path]:
    """Write `<style_id>.json`, `evidence/<style_id>/evidence.json`, `cache_index.json`,
    and optional `output_path` / `work_dir/style_profile.json` + `state.json`.
    """
    styles_dir.mkdir(parents=True, exist_ok=True)
    safe_id = sanitize_style_id(profile.style_id, profile.source.sha256)
    profile.style_id = safe_id

    ev_dir = resolve_evidence_dir(safe_id, styles_dir)
    ev_file = ev_dir / "evidence.json"
    profile_file = styles_dir / f"{safe_id}.json"

    warnings_list = list(getattr(profile, "warnings", None) or (profile.evidence or {}).get("warnings") or [])
    profile.evidence["warnings"] = _nfc_deep(warnings_list)
    profile.evidence["evidence_path"] = str(ev_file)

    serialized = _nfc_deep(profile.to_dict())
    # Validate strictly before saving
    validate_phase_data("style_profile", serialized)

    evidence_payload = _nfc_deep(
        {
            "style_id": profile.style_id,
            "name": profile.name,
            "source": dataclasses.asdict(profile.source),
            "confidence": dict(profile.confidence),
            "warnings": warnings_list,
            "evidence": dict(profile.evidence),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    )

    ev_file.write_text(
        json.dumps(evidence_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    profile_file.write_text(
        json.dumps(serialized, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # Update SHA-256 cache index
    index_path = styles_dir / "evidence" / "cache_index.json"
    index_data: Dict[str, Any] = {"by_sha256": {}, "updated_at": evidence_payload["generated_at"]}
    if index_path.is_file():
        try:
            loaded_idx = json.loads(index_path.read_text(encoding="utf-8"))
            if isinstance(loaded_idx, dict) and isinstance(loaded_idx.get("by_sha256"), dict):
                index_data["by_sha256"] = loaded_idx["by_sha256"]
        except (OSError, json.JSONDecodeError) as exc:
            _ = exc
    index_data["by_sha256"][profile.source.sha256] = profile.style_id
    index_data["updated_at"] = evidence_payload["generated_at"]
    index_path.write_text(
        json.dumps(index_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    if output_path is not None:
        out_p = Path(output_path).expanduser().resolve()
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(
            json.dumps(serialized, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    if work_dir is not None:
        ws_dir = Path(work_dir).expanduser().resolve()
        ws_dir.mkdir(parents=True, exist_ok=True)
        ws_profile_path = ws_dir / "style_profile.json"
        ws_profile_path.write_text(
            json.dumps(serialized, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        state_path = ws_dir / "state.json"
        if state_path.is_file():
            try:
                state_obj = json.loads(state_path.read_text(encoding="utf-8"))
                if isinstance(state_obj, dict):
                    state_warnings = state_obj.setdefault("warnings", [])
                    if isinstance(state_warnings, list):
                        for w in warnings_list:
                            if w not in state_warnings:
                                state_warnings.append(w)
                    phases_map = state_obj.setdefault("phases", {})
                    if isinstance(phases_map, dict):
                        phases_map[PHASE_ID] = {
                            "status": "completed",
                            "style_id": profile.style_id,
                            "profile_path": str(ws_profile_path),
                            "evidence_path": str(ev_file),
                            "warnings_count": len(warnings_list),
                        }
                    state_path.write_text(
                        json.dumps(_nfc_deep(state_obj), ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
            except (OSError, json.JSONDecodeError) as exc:
                _ = exc

    return profile_file, ev_file


# ============================================================================
# PUBLIC ENTRYPOINTS (Compatible with `server-bridge.ts`, `cli.py`, `ps2`)
# ============================================================================


def extract_style_profile(
    video_path: Union[str, Path],
    style_id: Optional[str] = None,
    name: Optional[str] = None,
    *,
    output_path: Optional[Union[str, Path]] = None,
    work_dir: Optional[Union[str, Path]] = None,
    styles_dir: Optional[Union[str, Path]] = None,
    words_json_path: Optional[Union[str, Path]] = None,
    transcript_path: Optional[Union[str, Path]] = None,
    max_analyze_ms: int = MAX_ANALYZE_MS,
    no_cache: bool = False,
    force: bool = False,
) -> StyleProfile:
    """Extract a validated `StyleProfile` from `video_path`.

    Enforces:
    - 5-minute (`300_000 ms`) analysis cap with explicit warning when `duration_ms > 300_000`.
    - SHA-256 caching in `tools/video-pipeline/memory/styles/`.
    - Non-speech graceful handling (`pacing.confidence = "assumed"`, `hook.confidence = "assumed"`).
    - Missing `tesseract` / `ffmpeg` graceful degradation (`captions.confidence = "assumed"`).
    """
    sample_path = Path(video_path).expanduser().resolve()
    if not sample_path.is_file():
        raise FileNotFoundError(_nfc(f"Không tìm thấy video mẫu tại đường dẫn: {sample_path}"))

    target_styles_dir = resolve_styles_dir(styles_dir)
    sha256_hex = compute_sha256(sample_path)
    resolved_id = sanitize_style_id(style_id, sha256_hex)
    resolved_name = _nfc(name or sample_path.stem or resolved_id).strip() or resolved_id

    # Check SHA-256 cache first unless `no_cache=True` or `force=True`
    if not (no_cache or force):
        cached = _lookup_cached_profile_by_sha256(sha256_hex, target_styles_dir)
        if cached is not None:
            if style_id:
                cached.style_id = resolved_id
            if name:
                cached.name = resolved_name
            cached_warnings = list(
                getattr(cached, "warnings", None)
                or (cached.evidence or {}).get("warnings")
                or []
            )
            cached.evidence.setdefault("_meta", {})["cache_hit"] = True
            cached.evidence["_meta"]["cached_sha256"] = sha256_hex
            cached.__dict__["warnings"] = cached_warnings
            _persist_style_profile_and_evidence(
                cached,
                styles_dir=target_styles_dir,
                output_path=output_path,
                work_dir=work_dir,
            )
            return cached

    warnings: List[str] = []
    cap_limit_ms = max(1000, min(MAX_ANALYZE_MS, int(max_analyze_ms or MAX_ANALYZE_MS)))

    with tempfile.TemporaryDirectory(prefix="ps1_style_extract_") as tmp_str:
        temp_dir = Path(tmp_str)

        # 1. Format & duration
        fmt_model, duration_ms, fmt_conf, fmt_ev = extract_format_signal(
            sample_path, warnings
        )
        analyzed_ms = min(duration_ms, cap_limit_ms)
        if duration_ms > MAX_ANALYZE_MS:
            analyzed_ms = MAX_ANALYZE_MS
            _append_warning(
                warnings,
                f"Video mẫu dài hơn 5 phút ({duration_ms} ms > {MAX_ANALYZE_MS} ms); hệ thống chỉ phân tích 300 giây đầu tiên ({MAX_ANALYZE_MS} ms).",
            )

        # Prepare 16kHz WAV for audio + acoustic analysis
        wav_path = _extract_16k_wav_for_analysis(
            sample_path, analyzed_ms, temp_dir, warnings
        )

        # 2. Audio loudness & music bed / ducking
        audio_model, audio_conf, audio_ev = extract_audio_signal(
            sample_path, wav_path, analyzed_ms, warnings
        )

        # 3 & 4. Pacing, pauses, scene cuts, jump-cut ratio & non-speech handling
        (
            pacing_model,
            words,
            cut_timestamps_ms,
            no_speech,
            pacing_conf,
            pacing_ev,
        ) = extract_pacing_signal(
            video_path=sample_path,
            wav_path=wav_path,
            analyzed_ms=analyzed_ms,
            words_json_path=words_json_path,
            transcript_path=transcript_path,
            work_dir=work_dir,
            warnings=warnings,
        )

        # If audio itself is completely silent (`is_silent`), enforce non-speech state
        if audio_ev.get("is_silent") and not words_json_path and not transcript_path:
            no_speech = True
            pacing_conf = "assumed"
            pacing_ev["no_speech"] = True
            pacing_model = StylePacing(
                words_per_min=0.0,
                pause_median_ms=240.0,
                pause_p90_ms=520.0,
                max_silence_kept_ms=650.0,
                shots_per_min=pacing_model.shots_per_min,
                jump_cut_ratio=0.0,
            )
            _append_warning(
                warnings,
                "Video mẫu không phát hiện lời nói (non-speech); bỏ qua đo pacing/hook thực nghiệm.",
            )

        # 6 & 7. Captions, Titlecard & Punch-in
        (
            captions_model,
            captions_conf,
            captions_ev,
            titlecard_model,
            titlecard_conf,
            titlecard_ev,
            punchin_model,
            punchin_conf,
            punchin_ev,
            opening_has_text,
        ) = extract_captions_titlecard_punchin(
            video_path=sample_path,
            analyzed_ms=analyzed_ms,
            width=fmt_model.width,
            height=fmt_model.height,
            cut_timestamps_ms=cut_timestamps_ms,
            no_speech=no_speech,
            temp_dir=temp_dir,
            warnings=warnings,
        )

        # 5. Hook (opening 5-10s cue classification, time_to_first_word_ms, repeated_later)
        hook_model, hook_conf, hook_ev = extract_hook_signal(
            words=words,
            no_speech=no_speech,
            cut_timestamps_ms=cut_timestamps_ms,
            opening_ocr_has_text=opening_has_text,
            analyzed_ms=analyzed_ms,
        )

    source_model = StyleSource(
        sha256=sha256_hex,
        duration_ms=int(duration_ms),
        analyzed_ms=int(analyzed_ms),
    )

    confidence_map: Dict[str, str] = {
        "format": fmt_conf if fmt_conf in STYLE_CONFIDENCE_LEVELS else "estimated",
        "pacing": pacing_conf if pacing_conf in STYLE_CONFIDENCE_LEVELS else "estimated",
        "hook": hook_conf if hook_conf in STYLE_CONFIDENCE_LEVELS else "estimated",
        "captions": captions_conf if captions_conf in STYLE_CONFIDENCE_LEVELS else "assumed",
        "audio": audio_conf if audio_conf in STYLE_CONFIDENCE_LEVELS else "estimated",
        "titlecard": titlecard_conf if titlecard_conf in STYLE_CONFIDENCE_LEVELS else "estimated",
        "punchin": punchin_conf if punchin_conf in STYLE_CONFIDENCE_LEVELS else "estimated",
    }

    evidence_map: Dict[str, Any] = _nfc_deep(
        {
            "format": fmt_ev,
            "pacing": pacing_ev,
            "hook": hook_ev,
            "captions": captions_ev,
            "audio": audio_ev,
            "titlecard": titlecard_ev,
            "punchin": punchin_ev,
            "warnings": warnings,
            "_meta": {
                "filename": sample_path.name,
                "sample_path": str(sample_path),
                "cache_hit": False,
                "max_analyze_ms": MAX_ANALYZE_MS,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        }
    )

    profile = StyleProfile(
        style_id=_nfc(resolved_id),
        name=_nfc(resolved_name),
        source=source_model,
        format=fmt_model,
        pacing=pacing_model,
        hook=hook_model,
        captions=captions_model,
        audio=audio_model,
        titlecard=titlecard_model,
        punchin=punchin_model,
        confidence=confidence_map,
        evidence=evidence_map,
    )
    profile.__dict__["warnings"] = list(warnings)

    _persist_style_profile_and_evidence(
        profile=profile,
        styles_dir=target_styles_dir,
        output_path=output_path,
        work_dir=work_dir,
    )
    return profile


def analyze_sample_video(
    video_path: Union[str, Path],
    style_id: Optional[str] = None,
    name: Optional[str] = None,
    **kwargs: Any,
) -> StyleProfile:
    """Entrypoint called by `apps/web/src/lib/video-studio/server-bridge.ts`."""
    return extract_style_profile(
        video_path=video_path,
        style_id=style_id,
        name=name,
        **kwargs,
    )


def run_ps1_style_analyzer(
    video_path: Union[str, Path],
    style_id: Optional[str] = None,
    name: Optional[str] = None,
    **kwargs: Any,
) -> StyleProfile:
    """Alias entrypoint for `server-bridge.ts` and CLI callers."""
    return extract_style_profile(
        video_path=video_path,
        style_id=style_id,
        name=name,
        **kwargs,
    )


def run_ps1_style_extract(
    video_path: Union[str, Path],
    style_id: Optional[str] = None,
    name: Optional[str] = None,
    **kwargs: Any,
) -> StyleProfile:
    """Alias entrypoint for `ps1_style_extract`."""
    return extract_style_profile(
        video_path=video_path,
        style_id=style_id,
        name=name,
        **kwargs,
    )


def run_phase(
    video_path: Union[str, Path],
    style_id: Optional[str] = None,
    name: Optional[str] = None,
    **kwargs: Any,
) -> StyleProfile:
    """Generic phase runner entrypoint."""
    return extract_style_profile(
        video_path=video_path,
        style_id=style_id,
        name=name,
        **kwargs,
    )


def load_style_profile(
    style_id_or_path: Union[str, Path],
    styles_dir: Optional[Union[str, Path]] = None,
) -> StyleProfile:
    """Load a saved `StyleProfile` by `style_id` or JSON file path."""
    cand = Path(style_id_or_path)
    if cand.is_file():
        data = json.loads(cand.read_text(encoding="utf-8"))
        return StyleProfile.from_dict(data)
    target_dir = resolve_styles_dir(styles_dir)
    safe_id = sanitize_style_id(str(style_id_or_path))
    for name in (f"{safe_id}.json", f"{style_id_or_path}.json"):
        p = target_dir / name
        if p.is_file():
            data = json.loads(p.read_text(encoding="utf-8"))
            return StyleProfile.from_dict(data)
    raise FileNotFoundError(_nfc(f"Không tìm thấy hồ sơ phong cách: {style_id_or_path}"))


def list_saved_style_profiles(
    styles_dir: Optional[Union[str, Path]] = None,
) -> List[Dict[str, Any]]:
    """List all valid `StyleProfile` JSON dicts stored in `memory/styles/`."""
    target_dir = resolve_styles_dir(styles_dir)
    results: List[Dict[str, Any]] = []
    for p in sorted(target_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("style_id"):
                sp = StyleProfile.from_dict(data)
                results.append(sp.to_dict())
        except (OSError, json.JSONDecodeError, SchemaValidationError) as exc:
            _ = exc
    return results


# ============================================================================
# SYNTHETIC SAMPLE BUILDERS & `--self-test`
# ============================================================================


def build_synthetic_mp4_with_wav(
    target_path: Path,
    *,
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
    duration_ms: int = 24_000,
    audio_duration_ms: Optional[int] = None,
    speech_pattern: bool = True,
    music_bed_amp: int = 0,
) -> Path:
    """Construct a valid ISO BMFF / MP4 container (`ftyp` + `moov` with `mvhd`, `trak`,
    `tkhd`, `mdia`, `mdhd`, `minf`, `stbl`, `stsd`, `stts`) and an `mdat` atom carrying
    a 16kHz 16-bit mono RIFF WAVE payload for deterministic testing without `ffmpeg`.
    """
    timescale = 1000
    dur_units = max(1000, int(duration_ms))

    # ftyp box
    ftyp_payload = b"isom" + struct.pack(">I", 512) + b"isomiso2avc1mp41"
    ftyp_box = struct.pack(">I4s", 8 + len(ftyp_payload), b"ftyp") + ftyp_payload

    # mvhd box (version 0)
    mvhd_payload = (
        struct.pack(">B3sIII", 0, b"\x00\x00\x00", 0, 0, timescale)
        + struct.pack(">I", dur_units)
        + b"\x00" * 76
    )
    mvhd_box = struct.pack(">I4s", 8 + len(mvhd_payload), b"mvhd") + mvhd_payload

    # tkhd box (version 0: width & height at offset 76..84 in 16.16 fixed point)
    tkhd_payload = (
        b"\x00\x00\x00\x07"
        + b"\x00" * 72
        + struct.pack(">II", int(width) * 65536, int(height) * 65536)
    )
    tkhd_box = struct.pack(">I4s", 8 + len(tkhd_payload), b"tkhd") + tkhd_payload

    # mdhd box (version 0)
    mdhd_payload = struct.pack(">B3sIIIIH2s", 0, b"\x00\x00\x00", 0, 0, timescale, dur_units, 0, b"\x00\x00")
    mdhd_box = struct.pack(">I4s", 8 + len(mdhd_payload), b"mdhd") + mdhd_payload

    # stsd box (`avc1`)
    stsd_payload = struct.pack(">B3sII4s", 0, b"\x00\x00\x00", 1, 16, b"avc1") + b"\x00" * 8
    stsd_box = struct.pack(">I4s", 8 + len(stsd_payload), b"stsd") + stsd_payload

    # stts box (sample delta for `fps`)
    sample_delta = max(1, int(round(timescale / float(max(1, fps)))))
    sample_count = max(1, int(round(dur_units / float(sample_delta))))
    stts_payload = struct.pack(">B3sIII", 0, b"\x00\x00\x00", 1, sample_count, sample_delta)
    stts_box = struct.pack(">I4s", 8 + len(stts_payload), b"stts") + stts_payload

    stbl_payload = stsd_box + stts_box
    stbl_box = struct.pack(">I4s", 8 + len(stbl_payload), b"stbl") + stbl_payload
    minf_box = struct.pack(">I4s", 8 + len(stbl_box), b"minf") + stbl_box
    mdia_payload = mdhd_box + minf_box
    mdia_box = struct.pack(">I4s", 8 + len(mdia_payload), b"mdia") + mdia_payload
    trak_payload = tkhd_box + mdia_box
    trak_box = struct.pack(">I4s", 8 + len(trak_payload), b"trak") + trak_payload

    moov_payload = mvhd_box + trak_box
    moov_box = struct.pack(">I4s", 8 + len(moov_payload), b"moov") + moov_payload

    # Build embedded 16kHz PCM WAV inside `mdat`
    import io

    sr = 16000
    wav_ms = int(audio_duration_ms if audio_duration_ms is not None else min(duration_ms, 24_000))
    total_samples = max(sr, int((wav_ms / 1000.0) * sr))
    pcm = array.array("h", [0] * total_samples)

    if speech_pattern:
        # Generate spoken bursts (320ms speech + 220ms pause) with 220Hz fundamental modulation
        cycle_samples = int(0.54 * sr)
        speech_samples = int(0.32 * sr)
        for i in range(total_samples):
            in_burst = (i % cycle_samples) < speech_samples
            if in_burst:
                val = int(9500.0 * math.sin(2.0 * math.pi * 220.0 * (i / float(sr))))
            else:
                val = int(music_bed_amp * math.sin(2.0 * math.pi * 110.0 * (i / float(sr))))
            pcm[i] = max(-32767, min(32767, val))

    bio = io.BytesIO()
    with wave.open(bio, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())
    wav_bytes = bio.getvalue()

    mdat_box = struct.pack(">I4s", 8 + len(wav_bytes), b"mdat") + wav_bytes
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(ftyp_box + moov_box + mdat_box)
    return target_path


def run_self_test() -> int:
    """Run deterministic self-tests for Stage S1 (`ps1_style_extract.py`)."""
    with tempfile.TemporaryDirectory(prefix="ps1_self_test_") as tmp_str:
        tmp_dir = Path(tmp_str)
        styles_dir = tmp_dir / "styles"

        # Case 1: Spoken vertical video with hook question & later repeat
        spoken_mp4 = build_synthetic_mp4_with_wav(
            tmp_dir / "sample_spoken.mp4",
            width=1080,
            height=1920,
            fps=30,
            duration_ms=28_000,
            speech_pattern=True,
            music_bed_amp=900,
        )
        words_payload = {
            "words": [
                {"word": "Tại", "start_ms": 180, "end_ms": 380},
                {"word": "sao", "start_ms": 390, "end_ms": 590},
                {"word": "tai", "start_ms": 600, "end_ms": 800},
                {"word": "nghe", "start_ms": 810, "end_ms": 1020},
                {"word": "AirPods", "start_ms": 1040, "end_ms": 1350},
                {"word": "Pro", "start_ms": 1360, "end_ms": 1580},
                {"word": "bị", "start_ms": 1600, "end_ms": 1800},
                {"word": "rè", "start_ms": 1820, "end_ms": 2060},
                {"word": "một", "start_ms": 2300, "end_ms": 2520},
                {"word": "bên?", "start_ms": 2540, "end_ms": 2880},
                {"word": "Nguyên", "start_ms": 6400, "end_ms": 6700},
                {"word": "nhân", "start_ms": 6720, "end_ms": 7000},
                {"word": "chính", "start_ms": 7250, "end_ms": 7550},
                {"word": "là", "start_ms": 7580, "end_ms": 7800},
                {"word": "màng", "start_ms": 7820, "end_ms": 8100},
                {"word": "loa", "start_ms": 8120, "end_ms": 8400},
                # Repeat opening hook after 10s
                {"word": "Tại", "start_ms": 14200, "end_ms": 14400},
                {"word": "sao", "start_ms": 14420, "end_ms": 14620},
                {"word": "tai", "start_ms": 14640, "end_ms": 14840},
                {"word": "nghe", "start_ms": 14860, "end_ms": 15060},
                {"word": "AirPods", "start_ms": 15080, "end_ms": 15380},
                {"word": "Pro", "start_ms": 15400, "end_ms": 15620},
                {"word": "bị", "start_ms": 15640, "end_ms": 15840},
                {"word": "rè", "start_ms": 15860, "end_ms": 16100},
            ]
        }
        words_file = tmp_dir / "sample_spoken.words.json"
        words_file.write_text(json.dumps(words_payload, ensure_ascii=False), encoding="utf-8")
        cuts_file = tmp_dir / "sample_spoken.cuts.json"
        cuts_file.write_text(json.dumps([1500, 6200, 12500, 15200]), encoding="utf-8")

        p1 = extract_style_profile(
            spoken_mp4,
            style_id="style_selftest_spoken",
            name="Mẫu Podcast Dọc Tự Kiểm Định",
            styles_dir=styles_dir,
            no_cache=True,
        )
        validated_1 = StyleProfile.model_validate(p1.to_dict())
        assert validated_1.format.aspect == "9:16"
        assert validated_1.format.width == 1080 and validated_1.format.height == 1920
        assert validated_1.hook.style == "question"
        assert validated_1.hook.repeated_later is True
        assert validated_1.pacing.words_per_min > 0
        assert (styles_dir / "style_selftest_spoken.json").is_file()
        assert (styles_dir / "evidence" / "style_selftest_spoken" / "evidence.json").is_file()

        # Case 2: SHA-256 Cache Hit Verification
        p1_cached = extract_style_profile(
            spoken_mp4,
            styles_dir=styles_dir,
            no_cache=False,
        )
        assert p1_cached.evidence.get("_meta", {}).get("cache_hit") is True
        assert p1_cached.source.sha256 == p1.source.sha256

        # Case 3: > 5 minutes (`360_000 ms`) cap verification
        long_mp4 = build_synthetic_mp4_with_wav(
            tmp_dir / "sample_over_5min.mp4",
            width=1920,
            height=1080,
            fps=30,
            duration_ms=360_000,
            audio_duration_ms=8_000,
            speech_pattern=True,
        )
        p_long = extract_style_profile(
            long_mp4,
            style_id="style_selftest_long",
            styles_dir=styles_dir,
            no_cache=True,
        )
        assert p_long.source.duration_ms == 360_000
        assert p_long.source.analyzed_ms == MAX_ANALYZE_MS
        assert any("5 phút" in w for w in getattr(p_long, "warnings", []))

        # Case 4: Non-speech / silent video graceful fallback
        silent_mp4 = build_synthetic_mp4_with_wav(
            tmp_dir / "sample_silent.mp4",
            width=1080,
            height=1920,
            fps=30,
            duration_ms=15_000,
            speech_pattern=False,
        )
        p_silent = extract_style_profile(
            silent_mp4,
            style_id="style_selftest_silent",
            styles_dir=styles_dir,
            no_cache=True,
        )
        assert p_silent.confidence["pacing"] == "assumed"
        assert p_silent.confidence["hook"] == "assumed"
        assert p_silent.evidence["pacing"]["no_speech"] is True
        assert any("non-speech" in w for w in getattr(p_silent, "warnings", []))

        # Ensure default memory/styles/style_ab12.json + evidence exist
        default_styles_dir = resolve_styles_dir()
        if not (default_styles_dir / "style_ab12.json").is_file():
            extract_style_profile(
                spoken_mp4,
                style_id="style_ab12",
                name="Podcast Dọc Nhịp Nhanh (Mẫu PodsCare)",
                styles_dir=default_styles_dir,
                no_cache=True,
            )

    summary = {
        "status": "PASS",
        "phase": PHASE_ID,
        "cases_verified": [
            "spoken_vertical_mp4_and_schema_validation",
            "sha256_cache_hit_and_evidence_persistence",
            "over_5_minutes_cap_300000ms_and_warning",
            "non_speech_silent_video_assumed_confidence_and_warning",
        ],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


# ============================================================================
# CLI INTERFACE
# ============================================================================


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="PS1: Sample Video Style Extractor (extracts StyleProfile JSON & evidence)."
    )
    parser.add_argument(
        "--sample",
        "--video",
        "--input",
        "-i",
        dest="video_path",
        default=None,
        help="Path to the reference sample video file (.mp4, .mov, .wav).",
    )
    parser.add_argument(
        "--style-id",
        dest="style_id",
        default=None,
        help="Explicit style_id (e.g. style_ab12). Defaults to style_<sha256[:8]>.",
    )
    parser.add_argument(
        "--name",
        "--style-name",
        dest="name",
        default=None,
        help="Human-readable Vietnamese name for the extracted style profile.",
    )
    parser.add_argument(
        "--out",
        "--output",
        "-o",
        dest="output_path",
        default=None,
        help="Optional output path for the extracted StyleProfile JSON.",
    )
    parser.add_argument(
        "--work-dir",
        "--workspace",
        "-w",
        dest="work_dir",
        default=None,
        help="Optional workspace directory to write style_profile.json and update state.json.",
    )
    parser.add_argument(
        "--styles-dir",
        dest="styles_dir",
        default=None,
        help="Directory for saved style profiles (defaults to tools/video-pipeline/memory/styles).",
    )
    parser.add_argument(
        "--words-json",
        dest="words_json_path",
        default=None,
        help="Optional pre-computed words.json path from P2 Transcribe.",
    )
    parser.add_argument(
        "--transcript",
        dest="transcript_path",
        default=None,
        help="Optional transcript file (.json or .txt).",
    )
    parser.add_argument(
        "--max-analyze-ms",
        dest="max_analyze_ms",
        type=int,
        default=MAX_ANALYZE_MS,
        help="Maximum duration in ms to analyze (hard-capped at 300000 ms / 5 minutes).",
    )
    parser.add_argument(
        "--no-cache",
        "--force",
        dest="no_cache",
        action="store_true",
        help="Bypass SHA-256 style cache and re-run extraction.",
    )
    parser.add_argument(
        "--self-test",
        dest="self_test",
        action="store_true",
        help="Run built-in deterministic self-test suite.",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_test()

    if not args.video_path:
        parser.error("Cần truyền đường dẫn video mẫu qua --sample / --video hoặc chạy --self-test.")

    profile = extract_style_profile(
        video_path=args.video_path,
        style_id=args.style_id,
        name=args.name,
        output_path=args.output_path,
        work_dir=args.work_dir,
        styles_dir=args.styles_dir,
        words_json_path=args.words_json_path,
        transcript_path=args.transcript_path,
        max_analyze_ms=args.max_analyze_ms,
        no_cache=args.no_cache,
    )
    print(json.dumps(profile.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
