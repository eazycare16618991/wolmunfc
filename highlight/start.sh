#!/bin/bash
# 월문FC 하이라이트 편집기 시작 스크립트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ffmpeg 설치 확인
if ! command -v ffmpeg &>/dev/null; then
  echo ""
  echo "❌ ffmpeg가 설치되지 않았습니다."
  echo ""
  echo "  macOS:  brew install ffmpeg"
  echo "  Ubuntu: sudo apt install ffmpeg"
  echo "  Windows: https://ffmpeg.org/download.html"
  echo ""
  exit 1
fi

# Python 가상환경
if [ ! -d ".venv" ]; then
  echo "📦 가상환경 생성 중..."
  python3 -m venv .venv
fi

source .venv/bin/activate

# 의존성 설치
echo "📦 패키지 확인 중..."
pip install -q -r requirements.txt

echo ""
echo "✅ 준비 완료! 서버를 시작합니다..."
echo ""

python app.py
