"""
월문FC 영상 자동 처리 파이프라인
: 하이라이트 감지 → 로고 오버레이 → 한글 자막 → 유튜브용 MP4 출력
"""

import subprocess, json, re, os, shutil, sys
import numpy as np
from pathlib import Path
from datetime import datetime

LOGO_PATH   = Path(__file__).parent.parent / 'logo.png'
FONT_PATH   = '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf'
OUTPUT_DIR  = Path('/tmp/wolmunfc_output')
OUTPUT_DIR.mkdir(exist_ok=True)


# ── 1. 영상 정보 ────────────────────────────────────────────────

def get_video_info(path):
    r = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json',
         '-show_streams', '-show_format', str(path)],
        capture_output=True, text=True, check=True)
    d = json.loads(r.stdout)
    duration = float(d['format']['duration'])
    fps = 30.0
    width, height = 1920, 1080
    for s in d['streams']:
        if s.get('codec_type') == 'video':
            width  = s.get('width', 1920)
            height = s.get('height', 1080)
            try:
                n, den = s.get('r_frame_rate', '30/1').split('/')
                fps = float(n) / float(den)
            except Exception:
                pass
    return duration, fps, width, height


# ── 2. 오디오 에너지 분석 (군중 소리) ──────────────────────────

def analyze_audio(path):
    r = subprocess.run(
        ['ffmpeg', '-i', str(path), '-af', 'ebur128=framelog=verbose',
         '-f', 'null', '-'],
        capture_output=True, text=True)
    times, vals = [], []
    for line in r.stderr.split('\n'):
        m = re.search(r't:\s*([\d.]+)\s+M:\s*([-\d.inf]+)', line)
        if m:
            t = float(m.group(1))
            v = -70.0 if 'inf' in m.group(2) else float(m.group(2))
            times.append(t); vals.append(max(v, -70.0))
    return np.array(times), np.array(vals)


# ── 3. 모션 분석 ────────────────────────────────────────────────

def analyze_motion(path, sample_fps=2):
    import cv2
    cap = cv2.VideoCapture(str(path))
    vfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(vfps / sample_fps))
    times, scores = [], []
    prev = None; idx = 0
    while True:
        ret, frame = cap.read()
        if not ret: break
        if idx % step == 0:
            g = cv2.cvtColor(cv2.resize(frame, (320, 180)), cv2.COLOR_BGR2GRAY)
            if prev is not None:
                scores.append(float(np.mean(cv2.absdiff(g, prev))))
                times.append(idx / vfps)
            prev = g
        idx += 1
    cap.release()
    return np.array(times), np.array(scores)


# ── 4. 하이라이트 구간 선정 ─────────────────────────────────────

def compute_scores(dur, at, av, mt, mv):
    from scipy.ndimage import gaussian_filter1d
    n = int(dur) + 1
    tg = np.arange(n, dtype=float)
    def norm(a): mn,mx=a.min(),a.max(); return np.zeros_like(a) if mx-mn<1e-6 else (a-mn)/(mx-mn)
    ag = np.interp(tg, at, norm(av)) if len(at) > 1 else np.zeros(n)
    mg = np.interp(tg, mt, norm(mv)) if len(mt) > 1 else np.zeros(n)
    return tg, gaussian_filter1d(0.6*ag + 0.4*mg, sigma=5)

def select_segments(times, scores, target=180, before=15, after=20, gap=8):
    dur = float(times[-1])
    work = scores.copy(); segs = []; total = 0.0
    while total < target and work.max() > 0.05:
        idx = int(np.argmax(work))
        pt = float(times[idx])
        s, e = max(0.0, pt-before), min(dur, pt+after)
        segs.append([s, e]); total += e - s
        work[(times >= max(0,pt-before-gap)) & (times <= min(dur,pt+after+gap))] = 0
    segs.sort(key=lambda x: x[0])
    merged = []
    for seg in segs:
        if merged and seg[0] <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], seg[1])
        else:
            merged.append(seg)
    return [(round(s,1), round(e,1)) for s,e in merged]


# ── 5. 렌더링 (로고 + 자막 + 1920×1080) ────────────────────────

def build_filter(date_str: str) -> str:
    """
    ffmpeg filtergraph:
      - 1920×1080 letterbox (검정 패딩)
      - 우상단 로고 (반투명, 160px)
      - 하단 '월문FC' 자막 바
      - 좌하단 날짜
    """
    logo_ok = LOGO_PATH.exists()
    font = FONT_PATH

    # scale + pad
    vf = (
        'scale=1920:1080:force_original_aspect_ratio=decrease,'
        'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black'
    )

    if logo_ok:
        # 로고는 filter_complex 로 처리 (별도 input 필요)
        # → 호출 측에서 -i logo.png 추가 후 filter_complex 사용
        return '__USE_COMPLEX__'

    # 로고 없이 drawtext만
    subtitle = (
        f"drawtext=fontfile={font}:"
        f"text='⚽ 월문FC':"
        f"fontsize=42:fontcolor=white:"
        f"x=30:y=H-70:"
        f"box=1:boxcolor=black@0.55:boxborderw=14,"

        f"drawtext=fontfile={font}:"
        f"text='{date_str}':"
        f"fontsize=26:fontcolor=white@0.8:"
        f"x=W-tw-30:y=H-50"
    )
    return vf + ',' + subtitle

def _esc(text: str) -> str:
    """ffmpeg drawtext 특수문자 이스케이프 (콜론·따옴표)"""
    return text.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")

def render_clip(src, start, end, dst, date_str, clip_idx, total):
    """단일 클립 렌더링 (로고 + 자막 포함)"""
    logo_ok = LOGO_PATH.exists()
    font    = FONT_PATH
    title   = _esc('⚽ 월문FC')
    date_e  = _esc(date_str)

    if logo_ok:
        filter_complex = (
            f"[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
            f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[base];"
            f"[1:v]scale=160:-1,format=rgba,colorchannelmixer=aa=0.85[logo];"
            f"[base][logo]overlay=W-w-20:20[ov];"
            f"[ov]drawtext=fontfile={font}:"
            f"text='{title}':"
            f"fontsize=42:fontcolor=white:"
            f"x=30:y=H-70:"
            f"box=1:boxcolor=black@0.55:boxborderw=14,"
            f"drawtext=fontfile={font}:"
            f"text='{date_e}':"
            f"fontsize=26:fontcolor=white@0.8:"
            f"x=W-tw-30:y=H-50[out]"
        )
        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start), '-to', str(end),
            '-i', str(src),
            '-i', str(LOGO_PATH),
            '-filter_complex', filter_complex,
            '-map', '[out]', '-map', '0:a?',
            '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            str(dst)
        ]
    else:
        vf = (
            f"scale=1920:1080:force_original_aspect_ratio=decrease,"
            f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,"
            f"drawtext=fontfile={font}:text='{title}':"
            f"fontsize=42:fontcolor=white:x=30:y=H-70:"
            f"box=1:boxcolor=black@0.55:boxborderw=14,"
            f"drawtext=fontfile={font}:text='{date_e}':"
            f"fontsize=26:fontcolor=white@0.8:x=W-tw-30:y=H-50"
        )
        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start), '-to', str(end),
            '-i', str(src),
            '-vf', vf,
            '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            str(dst)
        ]

    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode()[-800:])
    print(f'  [{clip_idx+1}/{total}] {start:.0f}s ~ {end:.0f}s 완료')


def make_intro(output_path, date_str, duration=3):
    """'월문FC 하이라이트' 타이틀 카드 (검정 배경 + 흰 글씨)"""
    font = FONT_PATH
    logo_ok = LOGO_PATH.exists()
    title_e = _esc('월문FC 하이라이트')
    date_e  = _esc(date_str)

    if logo_ok:
        filter_complex = (
            f"color=black:size=1920x1080:duration={duration}:rate=30[bg];"
            f"[1:v]scale=300:-1,format=rgba[logo];"
            f"[bg][logo]overlay=(W-w)/2:200[ov];"
            f"[ov]drawtext=fontfile={font}:"
            f"text='{title_e}':"
            f"fontsize=64:fontcolor=white:"
            f"x=(W-tw)/2:y=580,"
            f"drawtext=fontfile={font}:"
            f"text='{date_e}':"
            f"fontsize=36:fontcolor=white@0.7:"
            f"x=(W-tw)/2:y=660[out]"
        )
        cmd = [
            'ffmpeg', '-y',
            '-f', 'lavfi', '-i', f'color=black:size=1920x1080:duration={duration}:rate=30',
            '-i', str(LOGO_PATH),
            '-filter_complex', filter_complex,
            '-map', '[out]',
            '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
            '-an', str(output_path)
        ]
    else:
        vf = (
            f"drawtext=fontfile={font}:"
            f"text='{title_e}':"
            f"fontsize=64:fontcolor=white:"
            f"x=(W-tw)/2:y=480,"
            f"drawtext=fontfile={font}:"
            f"text='{date_e}':"
            f"fontsize=36:fontcolor=white@0.7:"
            f"x=(W-tw)/2:y=560"
        )
        cmd = [
            'ffmpeg', '-y',
            '-f', 'lavfi',
            '-i', f'color=black:size=1920x1080:duration={duration}:rate=30',
            '-vf', vf,
            '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
            '-an', str(output_path)
        ]

    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode()[-500:])


def concat_clips(clip_paths, output_path):
    """클립 목록을 하나의 MP4로 합치기"""
    tmpdir = Path('/tmp/_concat_tmp'); tmpdir.mkdir(exist_ok=True)
    list_file = tmpdir / 'list.txt'
    list_file.write_text('\n'.join(f"file '{Path(p).resolve()}'" for p in clip_paths))
    cmd = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', str(list_file),
        '-c', 'copy',
        '-movflags', '+faststart',
        str(output_path)
    ]
    result = subprocess.run(cmd, capture_output=True)
    shutil.rmtree(tmpdir, ignore_errors=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode()[-500:])


# ── 메인 파이프라인 ─────────────────────────────────────────────

def process(video_path: str, target_secs: int = 180,
            progress_cb=None) -> str:
    """
    영상 처리 전체 파이프라인.
    Returns: 완성된 MP4 파일 경로 (str)
    """
    def p(v, msg=''):
        if progress_cb: progress_cb(v)
        if msg: print(msg)

    video_path = Path(video_path)
    date_str = datetime.now().strftime('%Y.%m.%d')
    tmpdir = Path('/tmp/_wfc_clips'); tmpdir.mkdir(exist_ok=True)

    p(5,  '📹 영상 정보 분석...')
    duration, fps, w, h = get_video_info(video_path)
    print(f'   {duration//60:.0f}분 {duration%60:.0f}초  {w}×{h}  {fps:.1f}fps')

    # 짧은 영상(3분 미만)은 하이라이트 생략 → 전체 편집
    if duration < 180:
        p(20, '⏱ 영상이 짧아 전체를 편집합니다...')
        segments = [(0.0, duration)]
    else:
        p(10, '🔊 오디오 분석 중 (군중 소리)...')
        at, av = analyze_audio(video_path)

        p(30, '🏃 모션 분석 중 (역동적 장면)...')
        mt, mv = analyze_motion(video_path)

        p(46, '🎯 하이라이트 구간 선정...')
        tg, scores = compute_scores(duration, at, av, mt, mv)
        segments = select_segments(tg, scores, target=target_secs)
        if not segments:
            # 폴백: 균등 분할
            n = max(1, int(target_secs / 30))
            step = duration / (n + 1)
            segments = [(round(i*step,1), round(min(i*step+30, duration),1))
                        for i in range(1, n+1)]

    print(f'   {len(segments)}개 구간 선택됨')

    p(50, '✂️  클립 렌더링 + 로고/자막 삽입...')

    # 인트로 타이틀 카드
    intro_path = tmpdir / 'intro.mp4'
    try:
        make_intro(intro_path, date_str)
        clip_paths = [intro_path]
    except Exception as e:
        print(f'   ⚠️ 인트로 생성 실패(스킵): {e}')
        clip_paths = []

    # 각 하이라이트 클립
    for i, (s, e) in enumerate(segments):
        clip_path = tmpdir / f'clip_{i:03d}.mp4'
        render_clip(video_path, s, e, clip_path, date_str, i, len(segments))
        clip_paths.append(clip_path)
        p(int(50 + 40 * (i + 1) / len(segments)))

    p(92, '🔗 최종 합치는 중...')
    stem = video_path.stem
    output_path = OUTPUT_DIR / f'{stem}_월문FC하이라이트.mp4'
    concat_clips(clip_paths, output_path)

    shutil.rmtree(tmpdir, ignore_errors=True)

    p(100, f'🎉 완료! → {output_path}')
    return str(output_path)


# ── CLI 사용 ─────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('사용법: python3 process_cli.py <영상파일> [하이라이트길이초]')
        sys.exit(1)

    video = sys.argv[1]
    secs  = int(sys.argv[2]) if len(sys.argv) > 2 else 180

    def show_progress(p):
        bar = '█' * (p // 5) + '░' * (20 - p // 5)
        print(f'\r  [{bar}] {p}%', end='', flush=True)

    result = process(video, target_secs=secs, progress_cb=show_progress)
    print(f'\n\n완성 파일: {result}')
