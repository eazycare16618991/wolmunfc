# wolmunfc 프로젝트 메모

월문FC 축구 동호회 정적 웹사이트. Vercel에 배포되며 `main` 브랜치가 실제 운영(배포) 브랜치임.

## 배포 워크플로우
- 운영 사이트는 `main` 브랜치를 추적함. **변경사항은 항상 `main`에 직접 push해야 실제 사이트에 반영됨.**
- 작업은 세션 브랜치(`claude/initial-setup-3Rti2`)에서 커밋 후 `main`으로 fast-forward merge → push, 그 다음 세션 브랜치도 동기화.
  ```
  git checkout main && git merge --ff-only <session-branch> && git push origin main
  git checkout <session-branch> && git push origin <session-branch>
  ```
- 작업 전 항상 `git branch --show-current`로 현재 브랜치 확인할 것 (main에서 직접 작업하다 헷갈리는 사고가 있었음).

## 주요 파일
- `index.html` : 메인 페이지 (회칙, 시상식 결과 등)
- `vote.html` : MVP 투표 페이지
- `payment.html` : 회비/결제 안내 페이지
- `api/` : Vercel 서버리스 함수 (Vercel KV 사용)
  - `vote.js` : POST로 투표 제출 (`{candidate, name}`)
  - `results.js` : 집계자용 결과 조회 (PIN 필요)
  - `reset.js` : 전체 투표 초기화 (PIN 필요)
  - `remove-vote.js` : 특정 투표자 1명의 투표만 선택 삭제 (PIN 필요)

## MVP 투표 데이터 모델 (Vercel KV)
- `wm_mvp_voted_names` : 중복 투표 방지용 Set (투표자 이름)
- `wm_mvp_count_<idx>` : 후보별 득표수 (idx = 0,1,2)
- `wm_mvp_voters_<idx>` : 후보별 투표자 이름 리스트
- 후보 매핑(0-indexed): 0=강기빈, 1=김태향, 2=박상현
- 모든 집계자 기능은 `pin === '1234'`로 보호됨 (admin-btn 버튼들: 결과 보기 / 초기화 / 특정 투표자 삭제)

## vote.html 특이사항
- `STORAGE_KEY = 'wolmun_mvp_vote_v2'` : localStorage에 "이미 투표함" 상태 저장
- `vote.html?reset=1` 로 접속하면 해당 기기의 localStorage 투표완료 상태가 초기화됨 (관리자가 특정 투표를 삭제해준 뒤, 본인이 재투표하려면 이 URL로 접속하라고 안내)
- 후보 카드에 `.candidate-photo-wrap` (56x56 원형, overflow:hidden) + `.candidate-photo` (`object-fit:cover`) 구조로 얼굴 사진 표시

## 시상식 팝업 패턴 (index.html)
각 상마다 `award-overlay` div + `showXAward()` / `closeXAward()` 함수로 구성, 시상 테이블 셀에 `onclick="showXAward()"` + `cursor:pointer; text-decoration:underline dotted` 적용.
- 욕쟁이상: 김지훈 (`IMG_3353.jpeg`)
- 득점왕: 정종환 (`IMG_3348.jpeg`, 선우팀)
- 어시스트상: 김태향 (`IMG_3350.jpeg`, 기빈팀)
- 철벽수비상: 홍래균 (`IMG_3347.jpeg`, 영록팀)
- 야신상(골키퍼): 채유민 (`IMG_3346.jpeg`, 기빈팀)

## 이미지 처리 노하우
- 아이폰 사진은 EXIF orientation(특히 6번)이 있어서 CSS `transform` + `object-fit`을 같이 쓰면 렌더링이 어긋남.
- 새 후보/시상 사진을 카드 크기에 맞게 넣을 때는 CSS transform으로 확대/이동하지 말고, **Python Pillow로 미리 크롭/회전 보정한 이미지 파일을 만들어** 그대로 `object-fit:cover`로 사용하는 방식이 안정적.
  ```python
  from PIL import Image, ImageOps
  img = ImageOps.exif_transpose(Image.open("원본.jpeg"))
  img.crop((left, top, right, bottom)).save("출력_face.jpg")
  ```
- 이 환경에는 headless 브라우저(playwright 등)가 막혀있어 직접 렌더링 확인 불가 → Read 도구로 이미지를 직접 보면서 크롭 좌표를 조정함.

## 기타
- KV 자격증명/Vercel 프로젝트 정보는 이 환경에 없음 → API를 직접 호출해 테스트할 수 없고, 사이트의 관리자 버튼(PIN 1234)을 통해서만 동작 확인 가능.
