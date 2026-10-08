# GB 프로덕션 보드

지비컬쳐 프로젝트 현황 웹앱. 공유 링크를 받은 사람은 **로그인 없이 열람**하고, 등록된 구글 계정만 **추가·수정·삭제**합니다. 저장하는 즉시 열려 있는 모든 화면에 반영됩니다.

## 권한

| 구분 | 할 수 있는 일 |
|---|---|
| 열람자 (로그인 없음) | 공유 링크로 전체 현황·팀원별·일정 보기 |
| 편집자 | + 프로젝트 추가·수정·삭제, 제작 금액·변경 이력 보기 |
| 관리자 | + 편집자 등록·삭제, 데이터 가져오기·백업 |
| 소유자 | 관리자 권한 고정 (`gbculture12@gmail.com`) |

- 제작 금액과 변경 이력은 열람자 화면·데이터 어디에도 전달되지 않습니다 (DB 규칙으로 차단).
- 공유 링크 끝의 `#b=…` 값이 보드 열쇠입니다. 열쇠가 없거나 틀리면 아무것도 보이지 않습니다.
- 등록되지 않은 구글 계정으로 로그인하면 보기만 가능합니다.

## 구성

- `public/` — 웹페이지 (빌드 과정 없음, 그대로 배포)
  - `config.js` — Firebase 연결값, 소유자 계정
  - `app.js` — 화면·편집·권한 처리
- `firestore.rules` — DB 보안 규칙 (Firebase 콘솔에 게시)
- `tests/` — 보안 규칙 테스트, 브라우저 동작 점검

## 최초 설정

1. Firebase 프로젝트 생성 → Firestore(서울, 프로덕션 모드) → Authentication에서 Google 로그인 사용
2. 웹 앱 등록 후 `firebaseConfig` 값을 `public/config.js`에 입력
3. Firestore → **규칙** 탭에 `firestore.rules` 내용을 붙여넣고 **게시**
4. 호스팅: Cloudflare Workers에 이 저장소 연결 (`wrangler.jsonc` 기준, `public` 폴더만 공개) → 주소 `https://gb-production-board.gbculture12.workers.dev`
5. Authentication → 설정 → **승인된 도메인**에 `gb-production-board.gbculture12.workers.dev` 추가
6. 소유자 계정으로 접속 → 로그인 → **새 보드 만들기** → 관리 탭에서 구글시트 CSV 가져오기 → 공유 링크 배포

## 운영

- **편집자 추가**: 관리 탭 → 구글 계정 이메일·이름 입력 → 추가. 삭제하면 즉시 편집 불가.
- **백업**: 관리 탭 → 전체 백업 JSON (월 1회 권장). 엑셀이 필요하면 엑셀용 CSV.
- **링크 교체** (링크가 외부로 샌 경우): 백업 JSON 저장 → 주소에서 `#b=…` 지우고 접속 → 새 보드 만들기 → 백업 가져오기 → 새 링크 재공유.
- 코드 수정 후 GitHub에 올리면 자동 배포됩니다. 규칙(`firestore.rules`)을 바꿨다면 콘솔에 다시 게시합니다.

## 로컬 테스트

```bash
npm install
npm run test:rules                                  # 보안 규칙 테스트
npm run emulators                                   # 에뮬레이터 실행 (다른 창)
cd public && python3 -m http.server 5050            # http://127.0.0.1:5050 (config.js 비어 있으면 자동으로 에뮬레이터 연결)
python3 tests/e2e_check.py <데이터.json> <스크린샷폴더>  # 브라우저 동작 점검
```
