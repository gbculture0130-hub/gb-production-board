"""브라우저 동작 점검 — 에뮬레이터 + 로컬 서버(127.0.0.1:5050) 실행 상태에서
python3 tests/e2e_check.py <가져올 데이터 파일> <스크린샷 폴더>
"""
import json, re, sys, time
from playwright.sync_api import sync_playwright, expect

DATA, SHOTS = sys.argv[1], sys.argv[2]
URL = "http://127.0.0.1:5050/?emu=1"
OWNER = "gbculture12@gmail.com"
results = []

def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra) if extra else ""), flush=True)

def sign_in(page, email, name):
    page.wait_for_function("window.__gbTest")
    page.evaluate("([e,n]) => window.__gbTest.signIn(e,n)", [email, name])

src = json.load(open(DATA, encoding="utf-8"))
N = len(src["projects"])
ACTIVE = sum(1 for p in src["projects"] if p["status"] != "done")

with sync_playwright() as pw:
    br = pw.chromium.launch()
    errors = []

    # ── 1. 소유자: 새 보드 만들기 → 데이터 가져오기
    oc = br.new_context(viewport={"width": 1366, "height": 900}, locale="ko-KR")
    op = oc.new_page()
    op.on("pageerror", lambda e: errors.append(("owner", str(e))))
    op.on("dialog", lambda d: (errors.append(("dialog", d.message)), d.dismiss()))
    op.goto(URL)
    expect(op.locator("#gate")).to_contain_text("보드 링크로 접속")
    ok("키 없는 링크는 안내 화면", True)
    sign_in(op, OWNER, "권규보")
    op.locator("#newBoard").click()
    op.wait_for_function("location.hash.startsWith('#b=')")
    share = op.url
    ok("새 보드 생성·공유 링크 발급", "#b=" in share, share.split("#")[1][:6] + "…")
    op.locator('.tabs [data-tab="admin"]').click()
    op.set_input_files("#importFile", DATA)
    expect(op.locator("#importInfo")).to_contain_text(f"프로젝트 {N}건")
    op.locator("#importBtn").click()
    expect(op.locator("#importInfo")).to_contain_text("가져오기 완료", timeout=20000)
    op.locator('.tabs [data-tab="board"]').click()
    expect(op.locator("#countLine")).to_contain_text(f"전체 {N}건", timeout=15000)
    ok("기존 데이터 가져오기", True, f"{N}건 / 진행 {ACTIVE}")
    ok("편집자 화면에 제작비 KPI", op.locator("#k-4-lab").inner_text() == "진행 중 제작비", op.locator("#k-4").inner_text())
    op.screenshot(path=f"{SHOTS}/01_owner_board.png", full_page=False)

    # 편집자 등록
    op.locator('.tabs [data-tab="admin"]').click()
    op.fill("#ae-email", "Editor@GB.kr"); op.fill("#ae-name", "편집담당"); op.locator("#addEditor button[type=submit]").click()
    expect(op.locator("#editorRows")).to_contain_text("editor@gb.kr")
    ok("편집자 추가(이메일 소문자 처리)", True)
    op.screenshot(path=f"{SHOTS}/02_admin.png", full_page=True)

    # ── 2. 로그인 없는 열람자
    vc = br.new_context(viewport={"width": 1366, "height": 900}, locale="ko-KR")
    vp = vc.new_page()
    vp.on("pageerror", lambda e: errors.append(("viewer", str(e))))
    vp.goto(share)
    expect(vp.locator("#countLine")).to_contain_text(f"전체 {N}건", timeout=15000)
    ok("로그인 없이 공유 링크 열람", True)
    ok("열람자 KPI는 이번 달 마감(금액 숨김)", vp.locator("#k-4-lab").inner_text() == "이번 달 마감")
    body = vp.content()
    amounts = [p.get("amount") for p in src["projects"] if p.get("amount")]
    leaked = [a for a in amounts if re.search(r">\s*" + re.escape(f"{a:,}") + r"만", body)]
    ok("열람 화면에 금액 노출 없음", not leaked and "VAT" not in vp.locator("#list").inner_text(), leaked[:3])
    ok("열람자에게 추가 버튼·이력·관리 탭 숨김", vp.locator("#addBtn").is_hidden() and vp.locator('.tabs [data-tab="logs"]').is_hidden() and vp.locator('.tabs [data-tab="admin"]').is_hidden())
    vp.locator("#list .row[data-id]").first.click()
    ok("열람자 상세는 보기 전용", vp.locator("#dFoot").inner_text().startswith("보기 전용") and vp.locator("#fm-client").count() == 0)
    vp.keyboard.press("Escape")

    # ── 3. 편집자 로그인 → 수정 → 실시간 반영
    ec = br.new_context(viewport={"width": 1366, "height": 900}, locale="ko-KR")
    ep = ec.new_page()
    ep.on("pageerror", lambda e: errors.append(("editor", str(e))))
    ep.goto(share)
    sign_in(ep, "editor@gb.kr", "편집담당")
    expect(ep.locator("#authBox .rl")).to_have_text("편집자", timeout=10000)
    ok("편집자 로그인·권한 인식", ep.locator("#addBtn").is_visible() and ep.locator('.tabs [data-tab="logs"]').is_visible() and ep.locator('.tabs [data-tab="admin"]').is_hidden())
    first = ep.locator("#list .row[data-id]").first
    pid = first.get_attribute("data-id")
    client = src_client = next(p["client"] for p in src["projects"] if p["id"] == pid)
    first.click()
    expect(ep.locator("#fm-client")).to_have_value(src_client)
    ep.locator('#stpick button[data-k="review"]').click()
    ep.locator('#langChips button[data-l="국문"]').click()
    ep.locator('#langChips button[data-l="영문"]').click()
    ep.select_option("#fm-narration", "AI")
    ep.fill("#fm-note", "E2E 수정 확인")
    ep.screenshot(path=f"{SHOTS}/03_editor_form.png")
    ep.locator('#dFoot [data-act="save"]').click()
    expect(ep.locator("#drawer")).to_be_hidden()
    row_v = vp.locator(f'#list .row[data-id="{pid}"]')
    expect(row_v).to_contain_text("E2E 수정 확인", timeout=10000)
    ok("저장 즉시 열람자 화면 반영(새로고침 없이)", True)
    ok("언어·내레이션 태그 표시", "국문, 영문" in row_v.inner_text() and "내레이션 AI" in row_v.inner_text())
    vp.screenshot(path=f"{SHOTS}/04_viewer_board.png")

    # 신규 등록
    ep.locator("#addBtn").click()
    ep.fill("#fm-client", "테스트신규업체"); ep.fill("#fm-title", "제품 영상"); ep.fill("#fm-done", "2026-12-15"); ep.fill("#fm-amount", "1,200"); ep.select_option("#fm-vat", "별도")
    ep.locator('#dFoot [data-act="save"]').click()
    expect(vp.locator("#list")).to_contain_text("테스트신규업체", timeout=10000)
    ok("신규 등록 반영", True)
    ok("신규 건 금액은 열람자에게 안 보임", "1,200" not in vp.locator("#list").inner_text() and "12만" not in vp.locator("#list").inner_text())

    # 변경 이력
    ep.locator('.tabs [data-tab="logs"]').click()
    expect(ep.locator("#logs")).to_contain_text("상태", timeout=10000)
    logs_txt = ep.locator("#logs").inner_text()
    ok("변경 이력 기록(수정·추가·가져오기)", "검수" in logs_txt and "테스트신규업체" in logs_txt and "가져오기" in logs_txt)
    ep.screenshot(path=f"{SHOTS}/05_logs.png")

    # 삭제
    ep.locator('.tabs [data-tab="board"]').click()
    ep.fill("#q", "테스트신규업체")
    ep.locator("#list .row[data-id]").first.click()
    ep.locator('#dFoot [data-act="del"]').click()
    ep.locator('#dFoot [data-act="yes"]').click()
    expect(vp.locator("#list")).not_to_contain_text("테스트신규업체", timeout=10000)
    ok("삭제 반영", True)

    # ── 4. 등록 안 된 계정
    sc = br.new_context(viewport={"width": 1366, "height": 900})
    sp = sc.new_page()
    sp.goto(share)
    sign_in(sp, "stranger@gb.kr", "외부인")
    expect(sp.locator("#authBox .rl")).to_have_text("권한 없음", timeout=10000)
    ok("미등록 계정은 권한 없음 표시·보기 전용", sp.locator("#addBtn").is_hidden() and "편집 권한이 없습니다" in sp.locator("#notice").inner_text())

    # ── 5. 잘못된 키
    bp = vc.new_page(); bp.goto(URL + "#b=WrongKey1234567890")
    expect(bp.locator("#gate")).to_contain_text("보드를 찾을 수 없습니다", timeout=10000)
    ok("잘못된 링크 차단", True)

    # ── 6. 모바일 화면
    mc = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR")
    mp = mc.new_page(); mp.goto(share)
    expect(mp.locator("#countLine")).to_contain_text(f"전체 {N}건", timeout=15000)
    sw = mp.evaluate("document.documentElement.scrollWidth")
    ok("모바일 가로 스크롤 없음", sw <= 390, sw)
    mp.screenshot(path=f"{SHOTS}/06_mobile.png")
    mp.locator("#list .row[data-id]").first.click()
    mp.screenshot(path=f"{SHOTS}/07_mobile_detail.png")

    # 소유자 화면 CSV 내보내기
    op.locator('.tabs [data-tab="admin"]').click()
    with op.expect_download() as dl:
        op.locator("#expCsv").click()
    path = dl.value.path()
    csv = open(path, encoding="utf-8-sig").read()
    ok("CSV 내보내기", csv.startswith("지원사업명,업체명") and "언어,내레이션" in csv.splitlines()[0], f"{len(csv.splitlines())-1}행")

    ok("자바스크립트 오류 없음", not errors, errors[:3])
    br.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results)-len(fails)}/{len(results)} 통과")
sys.exit(1 if fails else 0)
