"""
Soccer highlight detection using audio energy + motion analysis.
Uses ffmpeg for audio and OpenCV for frame differencing.
"""

import subprocess
import json
import re
import os
import shutil
import numpy as np
from pathlib import Path


def get_video_info(video_path):
    """Return (duration_secs, fps) via ffprobe."""
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json',
         '-show_streams', '-show_format', str(video_path)],
        capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout)
    duration = float(data['format']['duration'])
    fps = 30.0
    for stream in data['streams']:
        if stream.get('codec_type') == 'video':
            r = stream.get('r_frame_rate', '30/1')
            try:
                num, den = r.split('/')
                fps = float(num) / float(den)
            except Exception:
                pass
    return duration, fps


def analyze_audio_energy(video_path):
    """
    Extract momentary loudness (LUFS) every ~0.4s via ffmpeg ebur128.
    Returns (times_array, loudness_array).
    Crowd noise spikes = exciting moments.
    """
    cmd = ['ffmpeg', '-i', str(video_path),
           '-af', 'ebur128=framelog=verbose', '-f', 'null', '-']
    result = subprocess.run(cmd, capture_output=True, text=True)

    times, values = [], []
    for line in result.stderr.split('\n'):
        m = re.search(r't:\s*([\d.]+)\s+M:\s*([-\d.inf]+)', line)
        if m:
            t = float(m.group(1))
            v_str = m.group(2)
            v = -70.0 if v_str in ('-inf', 'inf') else float(v_str)
            times.append(t)
            values.append(max(v, -70.0))

    return np.array(times, dtype=float), np.array(values, dtype=float)


def analyze_motion(video_path, sample_fps=2):
    """
    Compute frame-difference motion scores at sample_fps via OpenCV.
    Returns (times_array, motion_scores_array).
    High motion = active play, shots, celebrations.
    """
    try:
        import cv2
    except ImportError:
        return np.array([]), np.array([])

    cap = cv2.VideoCapture(str(video_path))
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_interval = max(1, int(video_fps / sample_fps))

    times, scores = [], []
    prev_gray = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval == 0:
            t = frame_idx / video_fps
            small = cv2.resize(frame, (320, 180))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

            if prev_gray is not None:
                diff = cv2.absdiff(gray, prev_gray)
                scores.append(float(np.mean(diff)))
                times.append(t)

            prev_gray = gray

        frame_idx += 1

    cap.release()
    return np.array(times, dtype=float), np.array(scores, dtype=float)


def _normalize(arr):
    mn, mx = arr.min(), arr.max()
    if mx - mn < 1e-6:
        return np.zeros_like(arr)
    return (arr - mn) / (mx - mn)


def compute_scores(duration, audio_times, audio_vals, motion_times, motion_scores):
    """
    Interpolate both signals onto a 1-second grid and combine.
    Audio weight 0.6, motion weight 0.4 — crowd noise is the best
    proxy for goals and saves in futsal.
    """
    n = int(duration) + 1
    t_grid = np.arange(n, dtype=float)

    if len(audio_times) > 1:
        audio_grid = np.interp(t_grid, audio_times, _normalize(audio_vals))
    else:
        audio_grid = np.zeros(n)

    if len(motion_times) > 1:
        motion_grid = np.interp(t_grid, motion_times, _normalize(motion_scores))
    else:
        motion_grid = np.zeros(n)

    combined = 0.6 * audio_grid + 0.4 * motion_grid

    # Smooth with a 5-second Gaussian window
    try:
        from scipy.ndimage import gaussian_filter1d
        combined = gaussian_filter1d(combined, sigma=5)
    except ImportError:
        # Manual simple moving average fallback
        kernel = np.ones(5) / 5
        combined = np.convolve(combined, kernel, mode='same')

    return t_grid, combined


def select_segments(times, scores, target_secs=180,
                    before=15, after=20, min_gap=8):
    """
    Greedy peak selection: pick highest-scoring moment, expand ±context,
    zero out surroundings, repeat until target duration is reached.
    """
    if len(scores) == 0:
        return []

    duration = float(times[-1])
    work = scores.copy()
    segments = []
    total = 0.0

    while total < target_secs and work.max() > 0.05:
        idx = int(np.argmax(work))
        peak_t = float(times[idx])

        start = max(0.0, peak_t - before)
        end = min(duration, peak_t + after)
        segments.append([start, end])
        total += end - start

        # Black out a wider zone so next peak is in a different play
        lo = max(0.0, peak_t - before - min_gap)
        hi = min(duration, peak_t + after + min_gap)
        work[(times >= lo) & (times <= hi)] = 0.0

    # Sort chronologically and merge overlapping segments
    segments.sort(key=lambda x: x[0])
    merged = []
    for seg in segments:
        if merged and seg[0] <= merged[-1][1] + min_gap:
            merged[-1][1] = max(merged[-1][1], seg[1])
        else:
            merged.append(seg)

    return [(round(s, 2), round(e, 2)) for s, e in merged]


def _fallback_segments(duration, target_secs):
    """Even-distribution fallback when detection produces nothing."""
    clip = min(30.0, target_secs / max(1, int(duration / 60)))
    n = max(1, int(target_secs / clip))
    step = duration / (n + 1)
    return [(round(i * step, 1), round(min(i * step + clip, duration), 1))
            for i in range(1, n + 1)]


def render_highlights(video_path, segments, output_path, progress_cb=None):
    """
    Cut each segment with ffmpeg (H.264/AAC), pad to 1920×1080,
    then concat via the concat demuxer.
    """
    if not segments:
        raise ValueError("하이라이트 구간이 없습니다.")

    video_path = Path(video_path)
    output_path = Path(output_path)
    tmpdir = output_path.parent / f'_tmp_{output_path.stem}'
    tmpdir.mkdir(exist_ok=True)

    clip_paths = []
    try:
        for i, (start, end) in enumerate(segments):
            clip_path = tmpdir / f'clip_{i:03d}.mp4'
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start), '-to', str(end),
                '-i', str(video_path),
                '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
                '-c:a', 'aac', '-b:a', '128k',
                '-vf', (
                    'scale=1920:1080:force_original_aspect_ratio=decrease,'
                    'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black'
                ),
                '-movflags', '+faststart',
                str(clip_path)
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            clip_paths.append(clip_path)
            if progress_cb:
                progress_cb(int(50 + 38 * (i + 1) / len(segments)))

        # Write concat manifest
        concat_txt = tmpdir / 'concat.txt'
        with open(concat_txt, 'w') as f:
            for p in clip_paths:
                f.write(f"file '{p.resolve()}'\n")

        # Concatenate without re-encoding
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', str(concat_txt),
            '-c', 'copy',
            '-movflags', '+faststart',
            str(output_path)
        ]
        subprocess.run(cmd, capture_output=True, check=True)

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    if progress_cb:
        progress_cb(100)


def process_video(video_path, output_path, target_secs=180, progress_cb=None):
    """
    Full pipeline: info → audio → motion → score → select → render.
    Returns list of (start, end) segments used.
    """
    def _p(v):
        if progress_cb:
            progress_cb(v)

    _p(5)
    duration, _ = get_video_info(video_path)

    _p(10)
    audio_times, audio_vals = analyze_audio_energy(video_path)

    _p(30)
    motion_times, motion_scores = analyze_motion(video_path)

    _p(46)
    t_grid, scores = compute_scores(
        duration, audio_times, audio_vals, motion_times, motion_scores
    )

    _p(48)
    segments = select_segments(t_grid, scores, target_secs=target_secs)

    if not segments:
        segments = _fallback_segments(duration, target_secs)

    _p(50)
    render_highlights(video_path, segments, output_path, progress_cb)

    return segments
