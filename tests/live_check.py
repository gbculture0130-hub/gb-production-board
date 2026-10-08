"""실서버 열람 화면 반복 점검 — python3 tests/live_check.py <공유링크> <스크린샷폴더> [반복횟수]
로그인 없이 보는 화면(열람자)을 데스크톱·다크모드·태블릿·모바일로 반복 확인합니다.
"""
import re, sys, time
from playwright.sync_api import sync_playwright

SHARE, SHOTS = sys.argv[1], sys.argv[2]
ROUNDS = int(sys.argv[3]) if len(sys.argv) > 3 else 3
BAD = re.compile(r"\bundefined\b|\bNaN\b|\bnull\b|Invalid Date|\[object Object\]")
VIEWS = [
    ("desktop", dict(viewport={"width": 1366, "height": 900}, color_scheme="light")),
    ("dark", dict(viewport={"width": 1366, "height": 900}, color_scheme="dark")),
    ("tablet", dict(viewport={"width": 820, "height": 1180}, color_scheme="light", device_scale_factor=2)),
    ("mobile", dict(viewport={"width": 390, "height": 844}, color_scheme="light", device_scale_factor=2, is_mobile=True, has_touch=True)),
]
issues, notes = [], []

def issue(round_, view, msg):
    key = (view, msg)
    if key not in [(v, m) for _, v, m in issues]:
        issues.append((round_, view, msg)); print(f"  ISSUE [{view}] {msg}", flush=True)

def overflow(pg):
    return pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")

def run_view(r, vname, pg):
    errs, cons, fails = [], [], []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda q: fails.append(q.url[:90] + " " + (q.failure or "")) if "google.firestore" not in q.url and "Listen/channel" not in q.url and "ERR_ABORTED" not in (q.failure or "") else None)
    t0 = time.time()
    pg.goto(SHARE, wait_until="domcontentloaded")
    try:
        pg.wait_for_function("document.querySelector('#countLine') && /전체 \\d+건/.test(document.querySelector('#countLine').textContent)", timeout=20000)
    except Exception:
        issue(r, vname, "20초 안에 목록이 뜨지 않음: " + pg.locator("#gate").inner_text()[:80]); return
    load = time.time() - t0
    count = pg.locator("#countLine").inner_text()
    if r == 1: notes.append(f"{vname}: 첫 화면 {load:.1f}초 · {count}")
    if load > 6: issue(r, vname, f"로딩 느림 {load:.1f}초")
    if pg.locator("#k-4-lab").inner_text() != "이번 달 마감": issue(r, vname, "열람자 KPI에 금액 항목 노출")
    if "VAT" in pg.locator("#main").inner_text() or re.search(r"\d+만\b|\d+억", pg.locator("#list").inner_text()): issue(r, vname, "열람 화면에 금액 표기 노출")

    # 전체 현황: 범위·단계·필터·검색
    for v in ["all", "done", "active"]:
        pg.locator(f'#scopeSeg button[data-v="{v}"]').click()
    stages = pg.locator("#stages .stage")
    for i in range(stages.count()):
        stages.nth(i).click(); stages.nth(i).click()
    for sel in ["#progSel", "#ownerSel"]:
        opts_ = pg.locator(f"{sel} option").all_inner_texts()
        for o in opts_[1:4]:
            pg.select_option(sel, label=o)
        pg.select_option(sel, index=0)
    pg.fill("#q", "영상"); pg.fill("#q", "")
    pg.locator('#scopeSeg button[data-v="all"]').click()
    rows = pg.locator("#list .row[data-id]")
    n = rows.count()
    # 모든 건 상세 열기 (1회차 데스크톱), 그 외는 표본
    idxs = range(n) if (r == 1 and vname == "desktop") else range(0, n, max(1, n // 6))
    for i in idxs:
        rows.nth(i).scroll_into_view_if_needed(); rows.nth(i).click()
        body = pg.locator("#dBody").inner_text()
        if BAD.search(body): issue(r, vname, f"상세 화면 이상 문구: {pg.locator('#dTitle').inner_text()} → {BAD.search(body).group(0)}")
        if pg.locator("#fm-client").count(): issue(r, vname, "열람자에게 편집 폼 노출")
        pg.keyboard.press("Escape")
        if pg.locator("#drawer").is_visible(): issue(r, vname, "Esc로 상세 창이 닫히지 않음"); pg.locator("#dClose").click()
    if r == 1: pg.screenshot(path=f"{SHOTS}/live_{vname}_board.png", full_page=(vname == "mobile"))
    if overflow(pg) > 1: issue(r, vname, f"전체 현황 가로 스크롤 {overflow(pg)}px")
    if BAD.search(pg.locator("#main").inner_text()): issue(r, vname, "전체 현황에 이상 문구: " + BAD.search(pg.locator("#main").inner_text()).group(0))

    # 팀원별
    pg.locator('.tabs [data-tab="team"]').click()
    for rv in ["pm", "edit", "td", "design", ""]:
        pg.locator(f'#roleSeg button[data-v="{rv}"]').click()
    people = pg.locator("#people .person")
    for i in range(people.count()):
        people.nth(i).click()
        if BAD.search(pg.locator("#v-team").inner_text()): issue(r, vname, "팀원별 이상 문구")
        people.nth(i).click()
    if r == 1:
        notes.append(f"{vname}: 팀원 {people.count()}명 표시")
        pg.screenshot(path=f"{SHOTS}/live_{vname}_team.png", full_page=(vname == "mobile"))
    if overflow(pg) > 1: issue(r, vname, f"팀원별 가로 스크롤 {overflow(pg)}px")

    # 일정
    pg.locator('.tabs [data-tab="timeline"]').click()
    bars = pg.locator("#tl .bar")
    bad_bars = pg.evaluate("""() => [...document.querySelectorAll('#tl .bar')].filter(b => { const l = parseFloat(b.style.left); return isNaN(l) || l < -1 || l > 101; }).map(b => b.dataset.id)""")
    if bad_bars: issue(r, vname, f"일정 막대가 화면 밖에 있음 {len(bad_bars)}개 ({', '.join(bad_bars[:5])})")
    for i in range(min(bars.count(), 3)):
        try:
            bars.nth(i).click(timeout=3000); pg.keyboard.press("Escape")
        except Exception:
            issue(r, vname, f"일정 막대 클릭 불가: {bars.nth(i).get_attribute('data-id')}")
    if r == 1: pg.screenshot(path=f"{SHOTS}/live_{vname}_timeline.png", full_page=(vname == "mobile"))
    if overflow(pg) > 1: issue(r, vname, f"일정 탭 가로 스크롤 {overflow(pg)}px")
    if BAD.search(pg.locator("#v-timeline").inner_text()): issue(r, vname, "일정 탭 이상 문구")

    # 새로고침 후 탭 유지·재접속 안정성
    pg.reload(wait_until="domcontentloaded")
    try:
        pg.wait_for_function("/전체 \\d+건/.test(document.querySelector('#countLine').textContent)", timeout=20000)
    except Exception:
        issue(r, vname, "새로고침 후 목록이 뜨지 않음")
    pg.locator('.tabs [data-tab="board"]').click()
    if errs: issue(r, vname, "자바스크립트 오류: " + errs[0][:120])
    if cons: issue(r, vname, "콘솔 오류: " + cons[0][:120])
    if fails: issue(r, vname, "요청 실패: " + fails[0])

with sync_playwright() as pw:
    br = pw.chromium.launch()
    for r in range(1, ROUNDS + 1):
        print(f"=== {r}회차", flush=True)
        for vname, opts in VIEWS:
            ctx = br.new_context(locale="ko-KR", timezone_id="Asia/Seoul", **opts)
            pg = ctx.new_page()
            try:
                run_view(r, vname, pg)
            except Exception as ex:
                issue(r, vname, "점검 중단: " + str(ex).splitlines()[0][:140])
            ctx.close()
    br.close()

print("\n--- 참고")
for n_ in notes: print(" ", n_)
print(f"\n발견된 문제 {len(issues)}건")
for r, v, m in issues: print(f"  {r}회차 [{v}] {m}")
