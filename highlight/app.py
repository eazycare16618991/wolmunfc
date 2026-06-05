"""
월문FC 하이라이트 자동 편집 서버
Usage: python app.py
Mobile access (same WiFi): http://<your-ip>:5000
"""

import os
import uuid
import threading
import socket
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template

from detector import process_video

app = Flask(__name__)

# Max upload: 4 GB
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 * 1024

UPLOAD_DIR = Path(__file__).parent / 'uploads'
OUTPUT_DIR = Path(__file__).parent / 'outputs'
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.m4v', '.3gp'}

# In-memory job store  { job_id: { status, progress, error, segments, output } }
_jobs: dict = {}
_lock = threading.Lock()


def _update_job(job_id, **kwargs):
    with _lock:
        _jobs[job_id].update(kwargs)


def _run_job(job_id: str, video_path: str, target_secs: int):
    def progress(p: int):
        _update_job(job_id, progress=p)

    try:
        output_path = OUTPUT_DIR / f'{job_id}_highlight.mp4'
        segments = process_video(video_path, str(output_path), target_secs, progress)
        _update_job(job_id,
                    status='done',
                    progress=100,
                    segments=segments,
                    output=str(output_path))
    except Exception as exc:
        _update_job(job_id, status='error', error=str(exc))
    finally:
        try:
            os.unlink(video_path)
        except OSError:
            pass


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    if 'video' not in request.files:
        return jsonify({'error': '영상 파일을 선택하세요.'}), 400

    file = request.files['video']
    if not file.filename:
        return jsonify({'error': '파일명이 없습니다.'}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'지원하지 않는 형식입니다. ({", ".join(ALLOWED_EXTENSIONS)})'}), 400

    try:
        target_secs = int(request.form.get('duration', 180))
        target_secs = max(30, min(target_secs, 600))
    except ValueError:
        target_secs = 180

    job_id = uuid.uuid4().hex[:10]
    save_path = UPLOAD_DIR / f'{job_id}{ext}'
    file.save(str(save_path))

    with _lock:
        _jobs[job_id] = {'status': 'processing', 'progress': 0}

    t = threading.Thread(target=_run_job,
                         args=(job_id, str(save_path), target_secs),
                         daemon=True)
    t.start()

    return jsonify({'job_id': job_id})


@app.route('/status/<job_id>')
def status(job_id: str):
    with _lock:
        job = _jobs.get(job_id)
    if job is None:
        return jsonify({'error': '작업을 찾을 수 없습니다.'}), 404
    return jsonify(job)


@app.route('/download/<job_id>')
def download(job_id: str):
    with _lock:
        job = _jobs.get(job_id)
    if job is None or job.get('status') != 'done':
        return jsonify({'error': '아직 준비되지 않았습니다.'}), 404

    output = Path(job['output'])
    if not output.exists():
        return jsonify({'error': '파일이 없습니다.'}), 404

    return send_file(
        str(output),
        as_attachment=True,
        download_name=f'월문FC_하이라이트_{job_id[:6]}.mp4',
        mimetype='video/mp4'
    )


def _get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
    except Exception:
        return 'localhost'


if __name__ == '__main__':
    ip = _get_local_ip()
    print('\n' + '=' * 48)
    print('  ⚽ 월문FC 하이라이트 자동 편집 서버 시작!')
    print('=' * 48)
    print(f'  PC 브라우저  : http://localhost:5000')
    print(f'  모바일 (WiFi): http://{ip}:5000')
    print('=' * 48 + '\n')
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
