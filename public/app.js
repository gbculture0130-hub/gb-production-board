// GB 프로덕션 보드 — 지비컬쳐 프로젝트 현황
// 열람: 공유 링크(보드 키)만 있으면 로그인 없이 / 편집: 등록된 구글 계정
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged, signInWithCredential
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, onSnapshot, getDoc, setDoc, updateDoc,
  deleteDoc, writeBatch, serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { firebaseConfig, OWNER_EMAIL } from "./config.js";

/* ───────── 상수 ───────── */
const ST = [
  { k: "todo", n: "미착수", c: "var(--s-todo)" },
  { k: "plan", n: "구성", c: "var(--s-plan)" },
  { k: "shoot", n: "촬영", c: "var(--s-shoot)" },
  { k: "prod", n: "그래픽", c: "var(--s-prod)" },
  { k: "edit", n: "편집", c: "var(--s-edit)" },
  { k: "revise", n: "수정", c: "var(--s-revise)" },
  { k: "review", n: "검수", c: "var(--s-review)" },
  { k: "hold", n: "보류", c: "var(--hold)" },
  { k: "done", n: "완료", c: "var(--s-done)" }
];
const SI = Object.fromEntries(ST.map((s, i) => [s.k, i]));
const ROLES = [["pm", "PM"], ["edit", "편집"], ["td", "3D"], ["design", "디자인"]];
const PUB = ["program", "client", "purpose", "title", "technique", "outsource", "pm", "edit", "td", "design",
  "lang", "narration", "status", "done", "doneText", "first", "firstText", "note"];
const LANGS = ["국문", "영문", "중문", "일문"];
const NARR = [["", "미정"], ["성우", "있음 · 성우"], ["AI", "있음 · AI 보이스"], ["없음", "없음"]];
function narrText(v) { return v === "성우" ? "내레이션 성우" : v === "AI" ? "내레이션 AI" : v === "없음" ? "내레이션 없음" : ""; }
const LABEL = {
  program: "지원사업", client: "업체명", purpose: "목적", title: "내용", technique: "제작 기법", outsource: "외주",
  pm: "PM", edit: "편집", td: "3D", design: "디자인", lang: "언어", narration: "내레이션", status: "상태", done: "완료일", doneText: "완료 메모",
  first: "1차 시안일", firstText: "1차 메모", note: "비고"
};
const DAY = 86400000;
const OWNER = OWNER_EMAIL.toLowerCase();

/* ───────── Firebase 연결 ───────── */
const params = new URLSearchParams(location.search);
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const EMU = params.has("emu") || (LOCAL && !firebaseConfig.apiKey);
const cfg = EMU ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-gb-board" } : firebaseConfig;
const CONFIGURED = !!(cfg.apiKey && cfg.projectId);

let auth = null, db = null;
if (CONFIGURED) {
  const app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  if (EMU) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
}

/* ───────── 상태 ───────── */
const $ = id => document.getElementById(id);
const S = {
  key: "", meta: undefined, items: [], amounts: {}, logs: [], editors: [],
  user: null, role: "viewer", // viewer | denied | editor | admin
  tab: "board", stage: null, scope: "active", prog: "", owner: "", q: "", roleF: "", person: "",
  loaded: false, drawer: null, unsub: {}
};
const isEditor = () => S.role === "editor" || S.role === "admin";
const isAdmin = () => S.role === "admin";
const base = () => "boards/" + S.key;

function readKey() {
  const k = new URLSearchParams(location.hash.slice(1)).get("b") || "";
  return /^[A-Za-z0-9_-]{12,64}$/.test(k) ? k : "";
}

/* ───────── 유틸 ───────── */
function today0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function pd(s) { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function dday(s) { const d = pd(s); if (!d) return null; return Math.round((d - today0()) / DAY); }
function md(s) { const d = pd(s); return d ? String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0") : ""; }
function money(v) { if (!v) return "0"; if (v >= 10000) return (Math.round(v / 100) / 100).toLocaleString("ko-KR") + "억"; return Math.round(v).toLocaleString("ko-KR") + "만"; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function st(it) { return ST[SI[it.status] ?? 0]; }
function sc(it) { return st(it).c; }
function isActive(it) { return it.status !== "done"; }
function crewOf(it) { return ROLES.map(([k]) => it[k]).filter(Boolean); }
function amt(it) { return isEditor() ? S.amounts[it.id] : null; }
function tsDate(t) { return t && typeof t.toDate === "function" ? t.toDate() : null; }
function fmtTs(t) {
  const d = tsDate(t); if (!d) return "";
  const p = n => String(n).padStart(2, "0");
  return p(d.getMonth() + 1) + "." + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }
function notice(msg, err) { const n = $("notice"); if (!msg) { n.hidden = true; return; } n.textContent = msg; n.className = "notice" + (err ? " err" : ""); n.hidden = false; }
function myName() { return (S.user && (S.user.displayName || (S.user.email || "").split("@")[0])) || ""; }
function myEmail() { return ((S.user && S.user.email) || "").toLowerCase(); }
function amountText(a) {
  if (!a) return "";
  if (a.amount != null && a.amount !== "") return Number(a.amount).toLocaleString("ko-KR") + "만원" + (a.vat ? "(VAT" + a.vat + ")" : "") + (a.memo ? " · " + a.memo : "");
  return a.memo || "";
}
function randKey(n = 22) {
  const al = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, x => al[x % al.length]).join("");
}

const td = new Date();
$("today").textContent = td.getFullYear() + "." + String(td.getMonth() + 1).padStart(2, "0") + "." + String(td.getDate()).padStart(2, "0") + " " + ["일", "월", "화", "수", "목", "금", "토"][td.getDay()];

/* ───────── 정렬·필터 ───────── */
function sortDue(a, b) {
  const x = pd(a.done), y = pd(b.done);
  if (x && y) return x - y; if (x) return -1; if (y) return 1;
  if (a.doneText && !b.doneText) return -1; if (!a.doneText && b.doneText) return 1;
  return (a.order || 0) - (b.order || 0);
}
function filtered() {
  const q = S.q.trim().toLowerCase();
  return S.items.filter(it => {
    if (S.stage !== null && (SI[it.status] ?? 0) !== S.stage) return false;
    else if (S.stage === null) {
      if (S.scope === "active" && !isActive(it)) return false;
      if (S.scope === "done" && isActive(it)) return false;
    }
    if (S.prog && it.program !== S.prog) return false;
    if (S.owner && !crewOf(it).includes(S.owner)) return false;
    if (q) { const h = [it.client, it.title, it.program, it.purpose, it.technique, it.note, it.outsource, it.lang, narrText(it.narration), ...crewOf(it)].join(" ").toLowerCase(); if (!h.includes(q)) return false; }
    return true;
  }).sort((a, b) => {
    const da = isActive(a) ? 0 : 1, dbb = isActive(b) ? 0 : 1; if (da !== dbb) return da - dbb;
    if (!isActive(a)) { const x = pd(a.done), y = pd(b.done); if (x && y) return y - x; if (x) return -1; if (y) return 1; return (b.order || 0) - (a.order || 0); }
    return sortDue(a, b);
  });
}

/* ───────── 화면: 전체 현황 ───────── */
function renderKpis() {
  const act = S.items.filter(isActive);
  const soon = act.filter(it => { const d = dday(it.done); return d !== null && d >= 0 && d <= 14; }).sort(sortDue);
  const over = act.filter(it => { const d = dday(it.done); return d !== null && d < 0; });
  const undated = act.filter(it => !pd(it.done)).length;
  const clients = new Set(act.map(i => i.client)).size;
  $("k-active").textContent = act.length;
  $("k-active-sub").textContent = clients + "개 업체 · 일정 미정 " + undated + "건";
  $("k-soon").textContent = soon.length;
  $("k-soon-sub").textContent = soon[0] ? (soon[0].client + " " + md(soon[0].done) + " 가장 임박") : " ";
  $("k-over").textContent = over.length;
  $("k-over-sub").textContent = over.length ? over.map(i => i.client).slice(0, 3).join(", ") : " ";
  if (isEditor()) {
    const sum = act.reduce((s, it) => s + (Number(S.amounts[it.id]?.amount) || 0), 0);
    $("k-4-lab").textContent = "진행 중 제작비";
    $("k-4").textContent = money(sum);
    $("k-4-sub").textContent = "금액 입력된 건 기준 · 편집자에게만 표시";
  } else {
    const t0 = today0();
    const mon = act.filter(it => { const d = pd(it.done); return d && d.getFullYear() === t0.getFullYear() && d.getMonth() === t0.getMonth(); });
    $("k-4-lab").textContent = "이번 달 마감";
    $("k-4").textContent = mon.length;
    $("k-4-sub").textContent = mon.length ? mon.map(i => i.client).slice(0, 3).join(", ") : " ";
  }
}

function renderStages() {
  const el = $("stages"); el.innerHTML = "";
  ST.forEach((s, i) => {
    const its = S.items.filter(it => (SI[it.status] ?? 0) === i);
    const b = document.createElement("button"); b.type = "button"; b.className = "stage"; b.style.setProperty("--sc", s.c); b.setAttribute("aria-pressed", S.stage === i ? "true" : "false");
    const sub = s.k === "done" ? (its.filter(x => pd(x.done) && pd(x.done).getFullYear() === td.getFullYear()).length + "건 올해") : (its.slice().sort(sortDue).slice(0, 2).map(x => x.client).join(" · ") || "—");
    b.innerHTML = '<span class="nm">' + esc(s.n) + '</span><span class="ct">' + its.length + '</span><span class="sub">' + esc(sub) + "</span>";
    b.addEventListener("click", () => { S.stage = S.stage === i ? null : i; render(); });
    el.appendChild(b);
  });
}

function allNames() { const set = new Set(); S.items.forEach(it => crewOf(it).forEach(o => set.add(o))); return [...set].sort((a, b) => a.localeCompare(b, "ko")); }
function uniq(key) { return [...new Set(S.items.map(i => i[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")); }
function renderSelects() {
  const names = allNames();
  $("ownerSel").innerHTML = '<option value="">담당자 전체</option>' + names.map(o => "<option" + (o === S.owner ? " selected" : "") + ">" + esc(o) + "</option>").join("");
  $("progSel").innerHTML = '<option value="">지원사업 전체</option>' + uniq("program").map(o => "<option" + (o === S.prog ? " selected" : "") + ">" + esc(o) + "</option>").join("");
}

function dueHtml(it) {
  const d = dday(it.done);
  if (d === null) return '<span class="dd none">' + esc(it.doneText || "미정") + "</span>" + (it.firstText ? '<span class="date">1차 ' + esc(it.firstText) + "</span>" : "");
  let cls = "", txt;
  if (!isActive(it)) { txt = md(it.done); cls = "none"; }
  else if (d < 0) { cls = "over"; txt = "D+" + (-d); }
  else if (d === 0) { cls = "over"; txt = "D-DAY"; }
  else { cls = d <= 14 ? "soon" : ""; txt = "D-" + d; }
  return '<span class="dd ' + cls + '">' + txt + "</span>" + (isActive(it) ? '<span class="date">' + md(it.done) + "</span>" : "");
}
function crewHtml(it) {
  const parts = ROLES.filter(([k]) => it[k]).map(([k, l]) => "<span><b>" + l + "</b>" + esc(it[k]) + "</span>");
  if (it.outsource) parts.push("<span><b>외주</b>" + esc(it.outsource) + "</span>");
  return parts.join("") || '<span style="color:var(--faint)">담당 미정</span>';
}
function rowHtml(it) {
  const s = st(it), a = amt(it);
  const tags = [it.program, it.purpose, it.technique, it.lang, narrText(it.narration)].filter(Boolean).map(t => '<span class="tag">' + esc(t) + "</span>").join("");
  const money_ = a && a.amount ? '<span class="mono">' + money(Number(a.amount)) + (a.vat ? ' <span style="color:var(--faint)">VAT' + esc(a.vat) + "</span>" : "") + "</span>" : "";
  return '<button type="button" class="row" data-id="' + esc(it.id) + '" style="--sc:' + s.c + '">'
    + '<span class="stripe"></span>'
    + '<span class="c-name"><div class="p-name"><span class="cl">' + esc(it.client || "(업체 미정)") + "</span>" + (it.title ? ' <span class="tt">· ' + esc(it.title) + "</span>" : "") + '</div><div class="p-sub">' + tags + money_ + "</div></span>"
    + '<span class="c-crew crew">' + crewHtml(it) + "</span>"
    + '<span class="c-note note">' + (it.note ? esc(it.note) : '<span style="color:var(--faint)">—</span>') + "</span>"
    + '<span class="c-due due">' + dueHtml(it) + '<span class="pill pill-m">' + s.n + "</span></span>"
    + '<span class="c-status"><span class="pill">' + s.n + "</span></span>"
    + "</button>";
}
const HEAD = '<div class="row head" role="presentation"><span class="stripe"></span><span>업체 · 내용</span><span>담당</span><span>비고</span><span>마감</span><span>상태</span></div>';
function bindRows(el) { el.querySelectorAll(".row[data-id]").forEach(r => r.addEventListener("click", () => openDrawer(r.dataset.id))); }

function renderList() {
  const el = $("list"); const rows = filtered();
  let h = HEAD;
  if (!S.loaded) h += '<div class="empty">프로젝트를 불러오는 중입니다</div>';
  else if (!S.items.length) h += '<div class="empty"><strong>등록된 프로젝트가 없습니다</strong><span>' + (isEditor() ? "오른쪽 위 ‘+ 프로젝트 추가’로 첫 건을 등록하세요." : "편집자가 등록하면 바로 여기에 표시됩니다.") + "</span></div>";
  else if (!rows.length) h += '<div class="empty"><strong>조건에 맞는 프로젝트가 없습니다</strong><span>필터를 해제해 보세요.</span></div>';
  h += rows.map(rowHtml).join("");
  el.innerHTML = h; bindRows(el);
  $("countLine").textContent = S.loaded ? ("표시 " + rows.length + "건 / 전체 " + S.items.length + "건 (진행 " + S.items.filter(isActive).length + ")") : "";
}

/* ───────── 화면: 팀원별 ───────── */
function renderTeam() {
  const act = S.items.filter(isActive);
  const stats = {};
  S.items.forEach(it => ROLES.forEach(([k]) => { const n = it[k]; if (!n) return; stats[n] = stats[n] || { roles: new Set(), active: [], total: 0 }; stats[n].roles.add(k); stats[n].total++; if (isActive(it) && (!S.roleF || k === S.roleF)) stats[n].active.push(it); }));
  const names = Object.keys(stats).filter(n => !S.roleF || stats[n].roles.has(S.roleF)).sort((a, b) => stats[b].active.length - stats[a].active.length || a.localeCompare(b, "ko"));
  if (S.person && !names.includes(S.person)) S.person = "";
  $("people").innerHTML = names.map(n => {
    const s = stats[n];
    return '<button type="button" class="person" data-n="' + esc(n) + '" aria-pressed="' + (S.person === n) + '"><span class="nm">' + esc(n) + '<span class="n">' + s.active.length + '</span></span><span class="roles">' + ROLES.map(([k, l]) => '<i class="' + (s.roles.has(k) ? "on" : "") + '">' + l + "</i>").join("") + '</span><span class="load">' + s.active.slice().sort(sortDue).map(it => '<i style="--sc:' + sc(it) + '"></i>').join("") + "</span></button>";
  }).join("") || '<span class="hint">담당자가 입력된 프로젝트가 없습니다</span>';
  $("people").querySelectorAll(".person").forEach(b => b.addEventListener("click", () => { S.person = S.person === b.dataset.n ? "" : b.dataset.n; renderTeam(); }));

  const mine = (S.person ? act.filter(it => crewOf(it).includes(S.person) && (!S.roleF || it[S.roleF] === S.person)) : act.filter(it => !S.roleF || it[S.roleF])).slice().sort(sortDue);
  const who = S.person || "팀 전체";
  const buckets = [["이번 주", 0, 7], ["다음 주", 7, 14], ["이후 · 미정", 14, 1e9]];
  const t0 = today0(); const dow = (t0.getDay() + 6) % 7; const wkStart = new Date(t0 - dow * DAY);
  $("personWeek").innerHTML = buckets.map(([lab, a, b]) => {
    const its = mine.filter(it => { const d = pd(it.done); if (!d) return b > 1e8; const off = Math.round((d - wkStart) / DAY); if (a === 0) return off < 7; return off >= a && off < b; });
    return '<div class="col"><h3>' + lab + " <b>" + its.length + "</b></h3>" + (its.map(it => '<button type="button" class="mini" data-id="' + esc(it.id) + '" style="--sc:' + sc(it) + '"><span class="t">' + esc(it.client) + (it.title ? " · " + esc(it.title) : "") + '</span><span class="m"><span>' + st(it).n + (S.person ? "" : (it.pm ? " · PM " + esc(it.pm) : "")) + '</span><span class="mono">' + (pd(it.done) ? md(it.done) : esc(it.doneText || "미정")) + "</span></span></button>").join("") || '<span class="hint">없음</span>') + "</div>";
  }).join("");
  $("personWeek").querySelectorAll(".mini").forEach(b => b.addEventListener("click", () => openDrawer(b.dataset.id)));
  $("personList").innerHTML = HEAD + (mine.length ? mine.map(rowHtml).join("") : '<div class="empty"><strong>' + esc(who) + " 진행 중 건이 없습니다</strong></div>");
  bindRows($("personList"));
}

/* ───────── 화면: 일정 ───────── */
function renderTimeline() {
  const act = S.items.filter(isActive).slice().sort(sortDue);
  const t0 = today0();
  let min = new Date(t0.getFullYear(), t0.getMonth(), 1), max = new Date(t0.getFullYear(), t0.getMonth() + 3, 0);
  act.forEach(it => { const a = pd(it.first), b = pd(it.done); if (a && a < min) min = new Date(a.getFullYear(), a.getMonth(), 1); if (b && b > max) max = new Date(b.getFullYear(), b.getMonth() + 1, 0); });
  const back = new Date(t0 - 45 * DAY);
  if (min > back) min = new Date(back.getFullYear(), back.getMonth(), 1);
  const span = (max - min) / DAY + 1;
  const pct = d => ((d - min) / DAY / span * 100);
  const wk = (7 / span * 100) + "%";
  let h = '<div class="lbl hd" style="font-family:var(--mono);font-size:11px;color:var(--faint);letter-spacing:.08em">PROJECT</div><div class="trk hd" style="--wk:' + wk + '">';
  for (let m = new Date(min); m <= max; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) h += '<span class="mo" style="left:' + pct(m) + '%">' + (m.getMonth() + 1) + "월</span>";
  h += '<span class="today" style="left:' + pct(t0) + '%"></span></div>';
  act.forEach(it => {
    const a = pd(it.first), b = pd(it.done); const c = sc(it);
    h += '<div class="lbl"><span class="t">' + esc(it.client) + (it.title ? " · " + esc(it.title) : "") + '</span><span class="s">' + st(it).n + (it.pm ? " · " + esc(it.pm) : "") + (it.program ? " · " + esc(it.program) : "") + "</span></div>";
    h += '<div class="trk" style="--wk:' + wk + '"><span class="today" style="left:' + pct(t0) + '%"></span>';
    if (b) {
      const start = a && a < b ? a : new Date(Math.max(min, b - 21 * DAY));
      const l = Math.max(0, pct(start)), r = Math.min(100, pct(b) + 100 / span);
      if (a && a < b) h += '<button type="button" class="bar" data-id="' + esc(it.id) + '" style="--sc:' + c + ";left:" + l + "%;width:" + Math.max(1.2, r - l) + '%">' + md(it.first) + " → " + md(it.done) + "</button>";
      else h += '<button type="button" class="bar pt" data-id="' + esc(it.id) + '" style="--sc:' + c + ";left:" + pct(b) + '%" title="' + md(it.done) + '"></button><span class="cap" style="left:' + Math.min(92, pct(b) + 1.5) + '%">' + md(it.done) + " 납품</span>";
    } else {
      h += '<button type="button" class="bar txt" data-id="' + esc(it.id) + '" style="--sc:' + c + ";left:" + pct(t0) + '%;width:22%">' + esc(it.doneText || it.firstText || "일정 미정") + "</button>";
    }
    h += "</div>";
  });
  $("tl").innerHTML = h;
  $("tl").querySelectorAll(".bar").forEach(b => b.addEventListener("click", () => openDrawer(b.dataset.id)));
  $("legend").innerHTML = ST.filter(s => s.k !== "done").map(s => '<span><i style="--sc:' + s.c + '"></i>' + s.n + "</span>").join("");
  const groups = {};
  act.forEach(it => { const d = pd(it.done); const key = d ? (d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")) : "미정"; (groups[key] = groups[key] || []).push(it); });
  const keys = Object.keys(groups).sort((a, b) => a === "미정" ? 1 : b === "미정" ? -1 : a.localeCompare(b));
  $("months").innerHTML = keys.map(k => {
    const its = groups[k]; const lab = k === "미정" ? "일정 미정" : (Number(k.slice(0, 4)) !== t0.getFullYear() ? k.slice(0, 4) + "년 " : "") + Number(k.slice(5)) + "월";
    const sum = isEditor() ? its.reduce((s, i) => s + (Number(S.amounts[i.id]?.amount) || 0), 0) : 0;
    return '<div class="col"><h3>' + lab + " <b>" + its.length + "건" + (sum ? " · " + money(sum) : "") + "</b></h3>" + its.map(it => '<button type="button" class="mini" data-id="' + esc(it.id) + '" style="--sc:' + sc(it) + '"><span class="t">' + esc(it.client) + (it.title ? " · " + esc(it.title) : "") + '</span><span class="m"><span>' + st(it).n + (it.pm ? " · " + esc(it.pm) : "") + '</span><span class="mono">' + (pd(it.done) ? md(it.done) : esc(it.doneText || "—")) + "</span></span></button>").join("") + "</div>";
  }).join("") || '<span class="hint">진행 중 프로젝트가 없습니다</span>';
  $("months").querySelectorAll(".mini").forEach(b => b.addEventListener("click", () => openDrawer(b.dataset.id)));
}

/* ───────── 화면: 변경 이력 ───────── */
const ACT = { create: "추가", update: "수정", delete: "삭제", import: "가져오기" };
function renderLogs() {
  const el = $("logs");
  if (!S.logs.length) { el.innerHTML = '<div class="empty"><strong>아직 기록이 없습니다</strong><span>추가·수정·삭제하면 여기에 남습니다.</span></div>'; return; }
  el.innerHTML = S.logs.map(l => {
    const exists = l.pid && S.items.some(i => i.id === l.pid);
    const tag = exists ? "button" : "div";
    return "<" + tag + ' class="log"' + (exists ? ' type="button" data-id="' + esc(l.pid) + '"' : "") + '><span class="t">' + esc(fmtTs(l.at) || "저장 중") + '</span><span class="b">' + esc(l.byName || l.by || "") + '</span><span class="w"><div class="lb"><span class="act ' + esc(l.action) + '">' + esc(ACT[l.action] || l.action) + "</span>" + esc(l.label || "") + '</div><div class="ch">' + esc((l.changes || []).join(" · ")) + "</div></span></" + tag + ">";
  }).join("");
  el.querySelectorAll("button.log").forEach(b => b.addEventListener("click", () => openDrawer(b.dataset.id)));
}

/* ───────── 화면: 관리 ───────── */
function shareUrl() { return location.origin + location.pathname + "#b=" + S.key; }
function renderAdmin() {
  $("shareUrl").textContent = shareUrl();
  const rows = [{ email: OWNER, name: "", role: "owner" }].concat(S.editors.filter(e => e.email !== OWNER).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "ko")));
  $("editorRows").innerHTML = rows.map(e => {
    if (e.role === "owner") return "<tr><td>" + esc(OWNER === myEmail() ? myName() : "소유자") + "</td><td>" + esc(e.email) + '</td><td><span class="tag">소유자</span></td><td></td><td></td></tr>';
    return '<tr data-e="' + esc(e.email) + '"><td>' + esc(e.name || "—") + "</td><td>" + esc(e.email) + '</td><td><select data-act="role"><option value="editor"' + (e.role !== "admin" ? " selected" : "") + '>편집자</option><option value="admin"' + (e.role === "admin" ? " selected" : "") + ">관리자</option></select></td><td class=\"mono\" style=\"font-size:12px;color:var(--muted)\">" + esc(fmtTs(e.addedAt).slice(0, 5)) + '</td><td><button class="btn sm danger" type="button" data-act="del">삭제</button></td></tr>';
  }).join("");
  $("editorRows").querySelectorAll("tr[data-e]").forEach(tr => {
    const email = tr.dataset.e;
    tr.querySelector('[data-act="role"]').addEventListener("change", async e => {
      try { await updateDoc(doc(db, "editors", email), { role: e.target.value }); toast("권한을 변경했습니다"); }
      catch (err) { toast("변경 실패: " + (err.code || err.message)); renderAdmin(); }
    });
    tr.querySelector('[data-act="del"]').addEventListener("click", async e => {
      const b = e.currentTarget;
      if (!b.dataset.armed) { // 브라우저 확인창 대신 두 번 눌러 확인
        b.dataset.armed = "1"; b.textContent = "정말 삭제";
        setTimeout(() => { delete b.dataset.armed; b.textContent = "삭제"; }, 4000);
        return;
      }
      try { await deleteDoc(doc(db, "editors", email)); toast("삭제했습니다"); }
      catch (err) { toast("삭제 실패: " + (err.code || err.message)); }
    });
  });
}

$("copyShare").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(shareUrl()); toast("공유 링크를 복사했습니다"); }
  catch (e) { toast("복사가 안 되면 링크를 직접 선택해 복사하세요"); }
});
$("addEditor").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("ae-email").value.trim().toLowerCase();
  const name = $("ae-name").value.trim();
  const role = $("ae-role").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("이메일 형식을 확인하세요"); return; }
  if (email === OWNER) { toast("소유자 계정은 이미 관리자입니다"); return; }
  try {
    await setDoc(doc(db, "editors", email), { email, name, role, addedAt: serverTimestamp(), addedBy: myEmail() });
    $("ae-email").value = ""; $("ae-name").value = "";
    toast(email + " 추가 완료");
  } catch (err) { toast("추가 실패: " + (err.code || err.message)); }
});

/* ───────── 렌더 ───────── */
function render() {
  if (!S.key) return;
  renderKpis(); renderStages(); renderSelects(); renderList();
  if (S.tab === "team") renderTeam();
  if (S.tab === "timeline") renderTimeline();
  if (S.tab === "logs") renderLogs();
  if (S.tab === "admin") renderAdmin();
  document.querySelectorAll("#scopeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === S.scope ? "true" : "false"));
  document.querySelectorAll("#roleSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === S.roleF ? "true" : "false"));
  updateSyncLine();
}
function updateSyncLine() {
  if (!S.loaded) return;
  let last = null;
  S.items.forEach(it => { const d = tsDate(it.updatedAt); if (d && (!last || d > last)) last = d; });
  $("sync").textContent = "실시간" + (last ? " · 최종 수정 " + fmtTs({ toDate: () => last }) : "");
}
const TABS = ["board", "team", "timeline", "logs", "admin"];
function tabAllowed(t) { return (t !== "logs" || isEditor()) && (t !== "admin" || isAdmin()); }
function setTab(t) {
  if (!TABS.includes(t) || !tabAllowed(t)) t = "board";
  S.tab = t;
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"));
  TABS.forEach(k => $("v-" + k).hidden = k !== t);
  try { localStorage.setItem("gb-tab", t); } catch (e) { }
  render();
}
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

/* ───────── 상세 / 편집 서랍 ───────── */
function kv(l, v) { return v ? "<dt>" + l + "</dt><dd>" + v + "</dd>" : ""; }
function openDrawer(id) {
  const it = S.items.find(x => x.id === id); if (!it) return;
  if (isEditor()) return openEditor(it);
  const s = st(it);
  S.drawer = { id, mode: "view" };
  $("dTitle").textContent = it.client || "프로젝트";
  $("dBody").innerHTML = '<div class="d-title">' + esc(it.client) + (it.title ? ' <span style="color:var(--muted);font-weight:500">· ' + esc(it.title) + "</span>" : "") + "</div>"
    + '<div class="d-sub"><span class="pill" style="--sc:' + s.c + '">' + s.n + "</span>" + [it.program, it.purpose, it.technique].filter(Boolean).map(t => '<span class="tag">' + esc(t) + "</span>").join("") + "</div>"
    + '<dl class="kv">'
    + kv("마감(완료)", pd(it.done) ? ('<span class="mono">' + esc(it.done) + "</span> " + dueHtml(it).replace(/<span class="date">.*?<\/span>/, "")) : esc(it.doneText || "미정"))
    + kv("1차", pd(it.first) ? '<span class="mono">' + esc(it.first) + "</span>" : esc(it.firstText || ""))
    + kv("PM", esc(it.pm)) + kv("편집", esc(it.edit)) + kv("3D", esc(it.td)) + kv("디자인", esc(it.design)) + kv("외주", esc(it.outsource))
    + kv("언어", esc(it.lang)) + kv("내레이션", esc(NARR.find(n => n[0] === it.narration && n[0])?.[1] || ""))
    + kv("비고", esc(it.note))
    + "</dl>" + (it.updatedAt ? '<div class="meta">최종 수정 ' + esc(fmtTs(it.updatedAt)) + (it.updatedBy ? " · " + esc(it.updatedBy) : "") + "</div>" : "");
  $("dFoot").innerHTML = '<span class="hint">' + (S.role === "denied" ? "이 계정은 편집 권한이 없습니다" : "보기 전용 · 편집은 편집자 로그인 후 가능") + '</span><div class="r"><button class="btn primary" type="button" data-act="close">닫기</button></div>';
  $("dFoot").querySelector('[data-act="close"]').addEventListener("click", closeDrawer);
  showDrawer();
}
function showDrawer() { $("scrim").hidden = false; $("drawer").hidden = false; setTimeout(() => $("dClose").focus(), 30); }
function closeDrawer() { $("scrim").hidden = true; $("drawer").hidden = true; S.drawer = null; }

function dl(id, values) { return '<datalist id="' + id + '">' + values.map(v => '<option value="' + esc(v) + '">').join("") + "</datalist>"; }
function fld(id, label, val, opt = {}) {
  return '<div class="f"><label for="fm-' + id + '">' + label + (opt.req ? '<span class="req">*</span>' : "") + "</label><input id=\"fm-" + id + '" type="' + (opt.type || "text") + '" value="' + esc(val ?? "") + '"' + (opt.list ? ' list="' + opt.list + '"' : "") + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : "") + (opt.attrs || "") + "></div>";
}

function splitLang(s) { return String(s || "").split(/[,/·]+/).map(x => x.trim()).filter(Boolean); }
function langField(val) {
  const cur = splitLang(val);
  const extra = cur.filter(x => !LANGS.includes(x)).join(", ");
  return '<div class="f"><label>언어</label><div class="chips" id="langChips">' + LANGS.map(l => '<button type="button" data-l="' + l + '" aria-pressed="' + cur.includes(l) + '">' + l + "</button>").join("")
    + '<input id="fm-langx" type="text" placeholder="기타 (예: 베트남어)" value="' + esc(extra) + '"></div></div>';
}
function readLang() {
  const sel = [...$("langChips").querySelectorAll('button[aria-pressed="true"]')].map(b => b.dataset.l);
  return sel.concat(splitLang($("fm-langx").value).filter(x => !sel.includes(x))).join(", ");
}

// it: 기존 건(수정) 또는 null(신규). preset: 신규 시 미리 채울 값
function openEditor(it, preset) {
  const isNew = !it;
  const v = isNew ? Object.assign({ status: "todo" }, preset || {}) : it;
  const a = isNew ? {} : (S.amounts[it.id] || {});
  S.drawer = { id: isNew ? null : it.id, mode: "edit", orig: isNew ? {} : Object.assign({}, it), origAmt: Object.assign({}, a), openedAt: isNew ? null : (tsDate(it.updatedAt)?.getTime() || 0), status: v.status || "todo" };
  $("dTitle").textContent = isNew ? "새 프로젝트" : (it.client || "프로젝트");
  const names = allNames();
  $("dBody").innerHTML = '<div id="dWarn"></div>'
    + dl("dl-names", names) + dl("dl-prog", uniq("program")) + dl("dl-purpose", uniq("purpose")) + dl("dl-tech", uniq("technique")) + dl("dl-client", uniq("client"))
    + '<div class="f"><label>상태</label><div class="stpick" id="stpick">' + ST.map(s => '<button type="button" data-k="' + s.k + '" style="--sc:' + s.c + '" aria-pressed="' + (s.k === (v.status || "todo")) + '">' + s.n + "</button>").join("") + "</div></div>"
    + '<div class="f2">' + fld("client", "업체명", v.client, { req: true, list: "dl-client" }) + fld("title", "내용", v.title, { ph: "예: 기업 홍보영상" }) + "</div>"
    + '<div class="f2">' + fld("program", "지원사업", v.program, { list: "dl-prog" }) + fld("purpose", "목적", v.purpose, { list: "dl-purpose" }) + "</div>"
    + '<div class="f2">' + fld("technique", "제작 기법", v.technique, { list: "dl-tech" }) + fld("outsource", "외주", v.outsource) + "</div>"
    + langField(v.lang)
    + '<div class="f"><label for="fm-narration">내레이션</label><select id="fm-narration">' + NARR.map(([k, l]) => '<option value="' + k + '"' + ((v.narration || "") === k ? " selected" : "") + ">" + l + "</option>").join("") + "</select></div>"
    + '<div class="d-sec">담당</div>'
    + '<div class="f4">' + fld("pm", "PM", v.pm, { list: "dl-names" }) + fld("edit", "편집", v.edit, { list: "dl-names" }) + fld("td", "3D", v.td, { list: "dl-names" }) + fld("design", "디자인", v.design, { list: "dl-names" }) + "</div>"
    + '<div class="d-sec">일정</div>'
    + '<div class="f"><label for="fm-first">1차 시안일</label><div class="pair"><input id="fm-first" type="date" value="' + esc(pd(v.first) ? v.first : "") + '"><input id="fm-firstText" type="text" placeholder="날짜 미정 시 메모 (예: 9월 중)" value="' + esc(v.firstText || "") + '"></div></div>'
    + '<div class="f"><label for="fm-done">완료(납품)일</label><div class="pair"><input id="fm-done" type="date" value="' + esc(pd(v.done) ? v.done : "") + '"><input id="fm-doneText" type="text" placeholder="날짜 미정 시 메모 (예: 10월 말)" value="' + esc(v.doneText || "") + '"></div></div>'
    + '<div class="d-sec">제작 금액 <span class="lock">· 편집자에게만 보임</span></div>'
    + '<div class="f2">' + fld("amount", "금액 (만원)", a.amount ?? "", { type: "text", ph: "예: 1500", attrs: ' inputmode="numeric"' })
    + '<div class="f"><label for="fm-vat">VAT</label><select id="fm-vat"><option value=""' + (!a.vat ? " selected" : "") + '>—</option><option value="별도"' + (a.vat === "별도" ? " selected" : "") + '>별도</option><option value="포함"' + (a.vat === "포함" ? " selected" : "") + ">포함</option></select></div></div>"
    + fld("memo", "금액 메모", a.memo, { ph: "예: 2차 추가분 별도" })
    + '<div class="f"><label for="fm-note">비고</label><textarea id="fm-note" rows="3">' + esc(v.note || "") + "</textarea></div>"
    + (isNew ? "" : '<div class="meta">' + (it.updatedAt ? "최종 수정 " + esc(fmtTs(it.updatedAt)) + (it.updatedBy ? " · " + esc(it.updatedBy) : "") : "") + "</div>")
    + '<div id="fmErr" class="notice err" hidden></div>';
  $("langChips").querySelectorAll("button").forEach(b => b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true")));
  $("stpick").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    S.drawer.status = b.dataset.k;
    $("stpick").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  }));
  $("dFoot").innerHTML = (isNew ? "" : '<button class="btn danger" type="button" data-act="del">삭제</button>')
    + '<div class="r">' + (isNew ? "" : '<button class="btn" type="button" data-act="dup">같은 업체로 추가</button>')
    + '<button class="btn" type="button" data-act="cancel">취소</button><button class="btn primary" type="button" data-act="save">' + (isNew ? "등록" : "저장") + "</button></div>";
  const f = $("dFoot");
  f.querySelector('[data-act="cancel"]').addEventListener("click", closeDrawer);
  f.querySelector('[data-act="save"]').addEventListener("click", e => saveProject(e.currentTarget));
  if (!isNew) {
    f.querySelector('[data-act="del"]').addEventListener("click", () => askDelete(it));
    f.querySelector('[data-act="dup"]').addEventListener("click", () => openEditor(null, { client: it.client, program: it.program, purpose: it.purpose, pm: it.pm }));
  }
  showDrawer();
  if (isNew) setTimeout(() => $("fm-" + (v.client ? "title" : "client")).focus(), 40);
}

function askDelete(it) {
  const f = $("dFoot");
  f.innerHTML = '<span class="confirm">「' + esc(it.client + (it.title ? " · " + it.title : "")) + '」을(를) 삭제할까요?</span><div class="r"><button class="btn" type="button" data-act="no">취소</button><button class="btn danger" type="button" data-act="yes">삭제</button></div>';
  f.querySelector('[data-act="no"]').addEventListener("click", () => openEditor(S.items.find(x => x.id === it.id) || it));
  f.querySelector('[data-act="yes"]').addEventListener("click", async e => {
    e.currentTarget.disabled = true;
    try {
      const b = writeBatch(db);
      b.delete(doc(db, base() + "/projects", it.id));
      b.delete(doc(db, base() + "/amounts", it.id));
      b.set(doc(collection(db, base() + "/logs")), { at: serverTimestamp(), by: myEmail(), byName: myName(), action: "delete", pid: it.id, label: labelOf(it), changes: [st(it).n + (it.done ? " · " + it.done : "")] });
      await b.commit();
      closeDrawer(); toast("삭제했습니다");
    } catch (err) { toast("삭제 실패: " + (err.code || err.message)); e.currentTarget.disabled = false; }
  });
}

function labelOf(p) { return (p.client || "") + (p.title ? " · " + p.title : ""); }
function readForm() {
  const g = id => ($("fm-" + id).value || "").trim();
  const v = {};
  PUB.forEach(k => { if (!["status", "note", "lang", "narration"].includes(k)) v[k] = g(k); });
  v.status = S.drawer.status || "todo";
  v.lang = readLang();
  v.narration = $("fm-narration").value;
  v.note = ($("fm-note").value || "").trim();
  const raw = g("amount").replace(/[,\s]/g, "").replace(/만원?$/, "");
  v.amount = raw === "" ? null : Number(raw);
  v.vat = $("fm-vat").value;
  v.memo = g("memo");
  return v;
}
function short(k, val) {
  if (k === "status") return ST[SI[val] ?? 0].n;
  if (k === "narration") return (NARR.find(n => n[0] === (val || "")) || NARR[0])[1];
  if (k === "done" || k === "first") return md(val) || "없음";
  const s = String(val || "없음"); return s.length > 18 ? s.slice(0, 17) + "…" : s;
}
function formErr(msg) { const e = $("fmErr"); e.textContent = msg; e.hidden = false; }

async function saveProject(btn) {
  const D = S.drawer; if (!D) return;
  const v = readForm();
  if (!v.client) return formErr("업체명을 입력하세요.");
  if (v.amount !== null && !(isFinite(v.amount) && v.amount >= 0)) return formErr("금액은 만원 단위 숫자로 입력하세요. 예: 1500");
  const isNew = !D.id;
  const pub = {}; PUB.forEach(k => pub[k] = v[k] || "");
  const orig = D.orig || {};
  const changed = PUB.filter(k => (orig[k] || "") !== pub[k]);
  const oa = D.origAmt || {};
  const na = { amount: v.amount, vat: v.vat || "", memo: v.memo || "" };
  const amtChanged = (oa.amount ?? null) !== na.amount || (oa.vat || "") !== na.vat || (oa.memo || "") !== na.memo;
  if (!isNew && !changed.length && !amtChanged) { closeDrawer(); toast("변경 사항이 없습니다"); return; }

  btn.disabled = true;
  const id = isNew ? doc(collection(db, base() + "/projects")).id : D.id;
  const pref = doc(db, base() + "/projects", id);
  const by = myName();
  const b = writeBatch(db);
  if (isNew) {
    const order = S.items.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
    b.set(pref, Object.assign({}, pub, { order, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: by }));
  } else {
    const upd = {}; changed.forEach(k => upd[k] = pub[k]);
    upd.updatedAt = serverTimestamp(); upd.updatedBy = by;
    b.update(pref, upd);
  }
  if (amtChanged) {
    const aref = doc(db, base() + "/amounts", id);
    if (na.amount === null && !na.vat && !na.memo) b.delete(aref); else b.set(aref, na);
  }
  const changes = isNew ? ["신규 등록 · " + st(pub).n] : changed.map(k => {
    if (["status", "done", "first", "pm", "edit", "td", "design", "lang", "narration"].includes(k)) return LABEL[k] + " " + short(k, orig[k]) + " → " + short(k, pub[k]);
    return LABEL[k] + " 수정";
  });
  if (amtChanged && !isNew) changes.push("제작 금액 수정");
  b.set(doc(collection(db, base() + "/logs")), { at: serverTimestamp(), by: myEmail(), byName: by, action: isNew ? "create" : "update", pid: id, label: labelOf(pub), changes: changes.slice(0, 20) });
  try {
    await b.commit();
    closeDrawer(); toast(isNew ? "등록했습니다" : "저장했습니다");
  } catch (err) {
    btn.disabled = false;
    if (err.code === "not-found") formErr("다른 분이 이 건을 삭제했습니다. 저장할 수 없습니다.");
    else if (err.code === "permission-denied") formErr("저장 권한이 없습니다. 편집자 등록 여부를 확인하세요.");
    else formErr("저장 실패: " + (err.code || err.message));
  }
}

// 편집 중인 건을 다른 사람이 바꾸면 알림
function checkDrawerConflict() {
  const D = S.drawer; if (!D || D.mode !== "edit" || !D.id) return;
  const cur = S.items.find(x => x.id === D.id);
  const w = $("dWarn"); if (!w) return;
  if (!cur) { w.innerHTML = '<div class="d-warn">다른 분이 이 건을 삭제했습니다.</div>'; return; }
  const t = tsDate(cur.updatedAt)?.getTime() || 0;
  if (D.openedAt && t && t !== D.openedAt && cur.updatedBy !== myName()) {
    w.innerHTML = '<div class="d-warn">방금 ' + esc(cur.updatedBy || "다른 분") + "님이 이 건을 수정했습니다. 저장하면 내가 바꾼 항목만 반영되고 나머지는 그대로 유지됩니다.</div>";
  }
}

$("dClose").addEventListener("click", closeDrawer);
$("scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("drawer").hidden) closeDrawer(); });
$("q").addEventListener("input", e => { S.q = e.target.value; renderList(); });
$("ownerSel").addEventListener("change", e => { S.owner = e.target.value; render(); });
$("progSel").addEventListener("change", e => { S.prog = e.target.value; render(); });
document.querySelectorAll("#scopeSeg button").forEach(b => b.addEventListener("click", () => { S.scope = b.dataset.v; S.stage = null; render(); }));
document.querySelectorAll("#roleSeg button").forEach(b => b.addEventListener("click", () => { S.roleF = b.dataset.v; render(); }));
$("addBtn").addEventListener("click", () => openEditor(null));

/* ───────── 로그인 ───────── */
async function login() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") { await signInWithRedirect(auth, p); return; }
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    if (e.code === "auth/unauthorized-domain") { notice("이 주소가 Firebase 로그인 허용 도메인에 등록되지 않았습니다. 관리자에게 알려주세요.", true); return; }
    toast("로그인 실패: " + e.code);
  }
}
async function resolveRole(u) {
  if (!u || !u.email) return "viewer";
  const email = u.email.toLowerCase();
  if (email === OWNER) return "admin";
  try {
    const s = await getDoc(doc(db, "editors", email));
    if (s.exists()) return s.data().role === "admin" ? "admin" : "editor";
  } catch (e) { }
  return "denied";
}
function renderAuth() {
  const box = $("authBox");
  if (!CONFIGURED) { box.innerHTML = ""; return; }
  if (!S.user) {
    box.innerHTML = '<button class="btn" type="button" id="loginBtn">편집자 로그인</button>';
    $("loginBtn").addEventListener("click", login);
  } else {
    const rl = S.role === "admin" ? "관리자" : S.role === "editor" ? "편집자" : "권한 없음";
    box.innerHTML = '<span class="who"><span class="nm"></span><span class="rl' + (S.role === "denied" ? " no" : "") + '">' + rl + '</span><button type="button" id="logoutBtn">로그아웃</button></span>';
    box.querySelector(".nm").textContent = myName();
    box.querySelector(".nm").title = S.user.email || "";
    $("logoutBtn").addEventListener("click", () => signOut(auth));
  }
  $("addBtn").hidden = !(isEditor() && S.key && S.meta);
  document.querySelector('.tabs [data-tab="logs"]').hidden = !isEditor();
  document.querySelector('.tabs [data-tab="admin"]').hidden = !isAdmin();
}

function stopPrivate() { ["amounts", "logs", "editors"].forEach(k => { if (S.unsub[k]) { S.unsub[k](); S.unsub[k] = null; } }); S.amounts = {}; S.logs = []; S.editors = []; }
function startPrivate() {
  if (!S.key) return;
  if (isEditor() && !S.unsub.amounts) {
    S.unsub.amounts = onSnapshot(collection(db, base() + "/amounts"), snap => {
      const m = {}; snap.docs.forEach(d => m[d.id] = d.data()); S.amounts = m; render();
    }, err => console.warn("amounts", err.code));
    S.unsub.logs = onSnapshot(query(collection(db, base() + "/logs"), orderBy("at", "desc"), limit(200)), snap => {
      S.logs = snap.docs.map(d => Object.assign({ id: d.id }, d.data({ serverTimestamps: "estimate" }))); if (S.tab === "logs") renderLogs();
    }, err => console.warn("logs", err.code));
  }
  if (isAdmin() && !S.unsub.editors) {
    S.unsub.editors = onSnapshot(collection(db, "editors"), snap => {
      S.editors = snap.docs.map(d => d.data()); if (S.tab === "admin") renderAdmin();
    }, err => console.warn("editors", err.code));
  }
}

/* ───────── 보드 연결 ───────── */
function showGate(html) { $("gate").innerHTML = html; $("gate").hidden = false; $("main").hidden = true; }
function hideGate() { $("gate").hidden = true; $("main").hidden = false; }

function renderGate() {
  if (!CONFIGURED) {
    $("sync").textContent = "설정 필요";
    return showGate("<h2>Firebase 연결 설정이 필요합니다</h2><p>public/config.js에 Firebase 프로젝트 설정값을 넣으면 보드가 열립니다.</p>");
  }
  if (!S.key) {
    $("sync").textContent = "보드 링크 필요";
    if (isAdmin()) {
      showGate("<h2>새 보드 만들기</h2><p>아직 연결된 보드가 없습니다. 새 보드를 만들면 공유 링크가 생성되고, 관리 탭에서 기존 데이터를 가져올 수 있습니다.</p><button class=\"btn primary\" id=\"newBoard\" type=\"button\">새 보드 만들기</button>");
      $("newBoard").addEventListener("click", createBoard);
    } else {
      showGate("<h2>보드 링크로 접속해 주세요</h2><p>공유받은 GB 프로덕션 보드 링크(주소 끝에 #b=… 포함)로 열어야 내용이 보입니다.</p>" + (S.user ? "" : "<p class=\"hint\">관리자는 로그인 후 새 보드를 만들 수 있습니다.</p>"));
    }
    return;
  }
  if (S.meta === undefined) { $("sync").textContent = "불러오는 중"; return showGate("<p>보드를 불러오는 중입니다</p>"); }
  if (S.meta === null) {
    $("sync").textContent = "링크 확인 필요";
    return showGate("<h2>보드를 찾을 수 없습니다</h2><p>링크가 올바르지 않거나 보드가 바뀌었습니다. 최신 공유 링크를 받아 다시 열어 주세요.</p>");
  }
  hideGate();
}

async function createBoard(e) {
  e.currentTarget.disabled = true;
  const key = randKey();
  try {
    await setDoc(doc(db, "boards", key), { name: "GB 프로덕션 보드", createdAt: serverTimestamp(), createdBy: myEmail() });
    location.hash = "b=" + key;
    toast("새 보드를 만들었습니다. 관리 탭에서 데이터를 가져오세요.");
  } catch (err) { toast("만들기 실패: " + (err.code || err.message)); e.currentTarget.disabled = false; }
}

function stopBoard() { ["meta", "projects"].forEach(k => { if (S.unsub[k]) { S.unsub[k](); S.unsub[k] = null; } }); stopPrivate(); S.items = []; S.loaded = false; S.meta = undefined; }
function startBoard() {
  stopBoard();
  S.key = readKey();
  if (!CONFIGURED || !S.key) { renderGate(); renderAuth(); return; }
  S.unsub.meta = onSnapshot(doc(db, "boards", S.key), s => {
    S.meta = s.exists() ? s.data() : null;
    renderGate(); renderAuth();
    if (S.meta) render();
  }, err => { S.meta = null; renderGate(); notice("보드 연결 오류: " + err.code, true); });
  S.unsub.projects = onSnapshot(collection(db, base() + "/projects"), snap => {
    S.items = snap.docs.map(d => Object.assign({ id: d.id }, d.data({ serverTimestamps: "estimate" })));
    S.loaded = true;
    $("rec").classList.remove("off");
    render(); checkDrawerConflict();
  }, err => { $("rec").classList.add("off"); notice("데이터를 불러오지 못했습니다 (" + err.code + "). 새로고침해 보세요.", true); });
  startPrivate();
  renderGate(); renderAuth();
}

/* ───────── 가져오기 / 내보내기 ───────── */
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function normDate(s) {
  s = (s || "").trim();
  let m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/) || s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return [m[1] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[3]).padStart(2, "0"), ""];
  return ["", s];
}
const STATUS_KO = { "구성": "plan", "촬영": "shoot", "그래픽": "prod", "제작": "prod", "편집": "edit", "수정": "revise", "검수": "review", "완료": "done", "보류": "hold", "대기": "hold", "미착수": "todo" };
function canonAmt(n, vat) { return Number(n).toLocaleString("ko-KR") + "만원" + (vat ? "(VAT" + vat + ")" : ""); }
function parseAmount(raw) {
  raw = (raw || "").trim(); if (!raw) return null;
  const m = raw.match(/([\d,]+)\s*만\s*원/);
  const amount = m ? Number(m[1].replace(/,/g, "")) : null;
  const ns = raw.replace(/\s/g, "");
  const vat = ns.includes("VAT포함") ? "포함" : ns.includes("VAT별도") ? "별도" : "";
  const memo = amount != null && ns === canonAmt(amount, vat).replace(/\s/g, "") ? "" : raw;
  return { amount, vat, memo };
}
function narrFrom(s) {
  s = (s || "").replace(/\s/g, "");
  if (!s) return "";
  if (/없|무|X|N/i.test(s) && !/있/.test(s)) return "없음";
  if (/AI|TTS|보이스/i.test(s)) return "AI";
  return "성우";
}
function fromSheetCSV(text) {
  let rows = parseCSV(text);
  const hi = rows.slice(0, 15).findIndex(r => r.some(c => (c || "").trim() === "업체명"));
  if (hi < 0) throw new Error("‘업체명’ 열을 찾을 수 없습니다. 프로젝트 목록이 있는 시트(탭)인지 확인하세요.");
  rows = rows.slice(hi);
  if (rows.length < 2) throw new Error("시트에 프로젝트 데이터가 없습니다");
  const head = rows[0].map(h => (h || "").trim());
  const col = (...keys) => { for (const k of keys) { const i = head.indexOf(k); if (i >= 0) return i; } return -1; };
  const C = { program: col("지원사업명", "지원사업"), client: col("업체명"), purpose: col("목적"), title: col("내용"), technique: col("제작 기법", "제작기법"), outsource: col("외주"), pm: col("PM"), edit: col("편집"), td: col("3D"), design: col("디자인"), lang: col("언어"), narration: col("내레이션", "나레이션"), status: col("상태"), done: col("완료", "완료일"), first: col("1차", "1차 시안일"), note: col("비고"), amount: col("제작 금액", "제작금액") };
  if (C.client < 0) throw new Error("‘업체명’ 열을 찾을 수 없습니다. 구글시트 원본 CSV인지 확인하세요.");
  const projects = [], amounts = {};
  let pc = "", pp = "";
  rows.slice(1).forEach((r, i) => {
    const g = k => C[k] >= 0 ? (r[C[k]] || "").trim() : "";
    if (!r.some(x => (x || "").trim())) return;
    let client = g("client"), program = g("program").replace(/\s/g, "");
    program = ({ "그외": "그 외" })[program] || program;
    if (client) pc = client; else client = pc;
    if (program) pp = program; else program = pp;
    if (!client) return;
    const [done, doneText] = normDate(g("done")); const [first, firstText] = normDate(g("first"));
    const sraw = g("status");
    let status = sraw === "" ? "todo" : STATUS_KO[sraw];
    let note = g("note");
    if (!status) { status = "plan"; note = (note ? note + " " : "") + "(시트 상태: " + sraw + ")"; }
    const id = "p" + String(i + 1).padStart(3, "0");
    projects.push({ id, order: i + 2, program, client, purpose: g("purpose"), title: g("title"), technique: g("technique"), outsource: g("outsource"), pm: g("pm"), edit: g("edit"), td: g("td"), design: g("design"), lang: splitLang(g("lang")).join(", "), narration: narrFrom(g("narration")), status, done, doneText, first, firstText, note });
    const a = parseAmount(g("amount")); if (a && (a.amount != null || a.memo)) amounts[id] = a;
  });
  return { projects, amounts };
}
function fromJSON(text) {
  const d = JSON.parse(text);
  if (!Array.isArray(d.projects)) throw new Error("projects 목록이 없는 JSON입니다");
  const projects = [], amounts = {};
  d.projects.forEach((p, i) => {
    if (!p || !p.client) return;
    const id = /^[A-Za-z0-9_-]{1,60}$/.test(p.id || "") ? p.id : "p" + String(i + 1).padStart(3, "0");
    const o = { id, order: Number(p.order) || i + 2 };
    PUB.forEach(k => o[k] = typeof p[k] === "string" ? p[k] : "");
    if (!SI.hasOwnProperty(o.status)) o.status = "todo";
    if (!NARR.some(n => n[0] === o.narration)) o.narration = narrFrom(o.narration);
    if (o.done && !pd(o.done)) { o.doneText = o.doneText || o.done; o.done = ""; }
    if (o.first && !pd(o.first)) { o.firstText = o.firstText || o.first; o.first = ""; }
    projects.push(o);
    let a = d.amounts && d.amounts[p.id];
    if (!a && (p.amount != null || p.amountRaw)) {
      a = p.amountRaw ? parseAmount(p.amountRaw) : { amount: p.amount, vat: p.vat || "", memo: "" };
      if (a && a.amount == null && p.amount != null) a.amount = Number(p.amount);
    }
    if (a && (a.amount != null || a.memo)) amounts[id] = { amount: a.amount == null ? null : Number(a.amount), vat: a.vat || "", memo: a.memo || "" };
  });
  return { projects, amounts };
}

let pendingImport = null;
function importMsg(text, kind) { const el = $("importInfo"); el.textContent = text; el.className = kind || ""; }
function setPending(data, name) {
  disarmImport();
  if (!data.projects.length) throw new Error("가져올 프로젝트가 없습니다");
  pendingImport = { data, name };
  const active = data.projects.filter(p => p.status !== "done").length;
  importMsg(name + " — 프로젝트 " + data.projects.length + "건 (진행 " + active + "), 금액 " + Object.keys(data.amounts).length + "건 확인. ‘가져오기 실행’을 누르세요.", "ok");
  $("importBtn").disabled = false;
}
function decodeText(buf) {
  const u = new TextDecoder("utf-8").decode(buf);
  if (u.includes("\uFFFD") || !u.slice(0, 2000).includes("업체명")) {
    try { const k = new TextDecoder("euc-kr").decode(buf); if (k.slice(0, 2000).includes("업체명")) return k; } catch (e) { }
  }
  return u;
}
async function xlsxToCSV(buf) {
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
  const name = wb.SheetNames.find(n => XLSX.utils.sheet_to_csv(wb.Sheets[n]).includes("업체명")) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_csv(wb.Sheets[name], { rawNumbers: false });
}
function sheetCsvUrl(s) {
  s = (s || "").trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) || s.match(/^([a-zA-Z0-9_-]{30,})$/);
  if (!m) return null;
  const gid = (s.match(/[#&?]gid=(\d+)/) || [])[1];
  return "https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=csv" + (gid ? "&gid=" + gid : "");
}
try { $("sheetUrl").value = localStorage.getItem("gb-sheet-url") || ""; } catch (e) { }
$("sheetBtn").addEventListener("click", async () => {
  pendingImport = null; $("importBtn").disabled = true; $("importFile").value = "";
  const url = sheetCsvUrl($("sheetUrl").value);
  if (!url) { importMsg("구글시트 주소를 확인하세요. https://docs.google.com/spreadsheets/d/… 형태여야 합니다.", "err"); return; }
  importMsg("구글시트를 불러오는 중…");
  try {
    const r = await fetch(url, { cache: "no-store" });
    const text = r.ok ? await r.text() : "";
    if (!r.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error("시트를 열 수 없습니다. 시트 공유 설정을 ‘링크가 있는 모든 사용자 · 뷰어’로 바꾼 뒤 다시 시도하세요.");
    setPending(fromSheetCSV(text), "구글시트");
    try { localStorage.setItem("gb-sheet-url", $("sheetUrl").value.trim()); } catch (e) { }
  } catch (err) {
    importMsg((err.message || String(err)).replace("Failed to fetch", "시트에 연결하지 못했습니다. 공유 설정(링크가 있는 모든 사용자)을 확인하세요."), "err");
  }
});
$("importFile").addEventListener("change", async e => {
  const file = e.target.files[0]; pendingImport = null; $("importBtn").disabled = true;
  if (!file) return;
  importMsg("파일을 읽는 중…");
  try {
    const buf = await file.arrayBuffer();
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    let data;
    if (ext === "json") data = fromJSON(new TextDecoder("utf-8").decode(buf));
    else if (ext === "xlsx" || ext === "xls") data = fromSheetCSV(await xlsxToCSV(buf));
    else { const t = decodeText(buf); data = t.trim().startsWith("{") ? fromJSON(t) : fromSheetCSV(t); }
    setPending(data, file.name);
  } catch (err) { importMsg("파일을 읽지 못했습니다: " + (err.message || err), "err"); }
});
function disarmImport() { const b = $("importBtn"); clearTimeout(b._t); delete b.dataset.armed; b.textContent = "가져오기 실행"; b.classList.remove("danger"); }
$("importBtn").addEventListener("click", async e => {
  if (!pendingImport) return;
  const { data, name } = pendingImport;
  const btn = e.currentTarget;
  // 기존 데이터가 있으면 한 번 더 눌러 확인 (브라우저 확인창은 일부 환경에서 막힘)
  if (S.items.length && !btn.dataset.armed) {
    btn.dataset.armed = "1"; btn.textContent = "교체 확인 — 한 번 더 누르기"; btn.classList.add("danger");
    importMsg("현재 보드의 " + S.items.length + "건이 지워지고 " + data.projects.length + "건으로 교체됩니다. 계속하려면 버튼을 한 번 더 누르세요. (먼저 ‘전체 백업 JSON’을 받아두면 안전합니다)", "err");
    btn._t = setTimeout(disarmImport, 10000);
    return;
  }
  disarmImport();
  btn.disabled = true;
  importMsg("가져오는 중… 창을 닫지 마세요.");
  try {
    const ops = [];
    S.items.forEach(it => { ops.push(["del", base() + "/projects", it.id]); });
    Object.keys(S.amounts).forEach(id => ops.push(["del", base() + "/amounts", id]));
    const by = myName();
    data.projects.forEach(p => {
      const o = {}; PUB.forEach(k => o[k] = p[k] || ""); o.status = p.status || "todo";
      o.order = p.order; o.createdAt = serverTimestamp(); o.updatedAt = serverTimestamp(); o.updatedBy = by;
      ops.push(["set", base() + "/projects", p.id, o]);
    });
    Object.entries(data.amounts).forEach(([id, a]) => ops.push(["set", base() + "/amounts", id, { amount: a.amount ?? null, vat: a.vat || "", memo: a.memo || "" }]));
    // 같은 문서를 지우고 다시 쓰는 경우, 지우기를 생략
    const setKeys = new Set(ops.filter(o => o[0] === "set").map(o => o[1] + "/" + o[2]));
    const final = ops.filter(o => o[0] === "set" || !setKeys.has(o[1] + "/" + o[2]));
    for (let i = 0; i < final.length; i += 400) {
      const b = writeBatch(db);
      final.slice(i, i + 400).forEach(([op, c, id, val]) => op === "del" ? b.delete(doc(db, c, id)) : b.set(doc(db, c, id), val));
      await b.commit();
    }
    await setDoc(doc(collection(db, base() + "/logs")), { at: serverTimestamp(), by: myEmail(), byName: by, action: "import", pid: "", label: name, changes: [data.projects.length + "건 가져오기 (금액 " + Object.keys(data.amounts).length + "건)"] });
    toast(data.projects.length + "건을 가져왔습니다");
    pendingImport = null; $("importFile").value = ""; importMsg("가져오기 완료 — " + data.projects.length + "건이 보드에 반영되었습니다.", "ok");
  } catch (err) {
    btn.disabled = false;
    const hint = err.code === "permission-denied" ? " — 저장 권한이 없습니다. 관리자 계정(" + OWNER + ")으로 로그인했는지 확인하세요." : "";
    importMsg("가져오기 실패: " + (err.code || "") + " " + (err.message || "") + hint, "err");
  }
});

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function stamp() { const d = new Date(); const p = n => String(n).padStart(2, "0"); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()); }
function csvCell(v) { v = String(v ?? ""); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
$("expCsv").addEventListener("click", () => {
  const head = ["지원사업명", "업체명", "목적", "내용", "제작 기법", "외주", "PM", "편집", "3D", "디자인", "언어", "내레이션", "상태", "완료", "1차", "비고", "제작 금액"];
  const rows = S.items.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(p => {
    const a = S.amounts[p.id];
    const am = a ? (a.amount != null ? canonAmt(a.amount, a.vat) + (a.memo ? " / " + a.memo : "") : a.memo) : "";
    return [p.program, p.client, p.purpose, p.title, p.technique, p.outsource, p.pm, p.edit, p.td, p.design, p.lang, p.narration === "AI" ? "AI 보이스" : p.narration, p.status === "todo" ? "" : st(p).n, p.done || p.doneText, p.first || p.firstText, p.note, am];
  });
  download("GB프로덕션보드_" + stamp() + ".csv", "﻿" + [head].concat(rows).map(r => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
});
$("expJson").addEventListener("click", () => {
  const projects = S.items.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(p => { const o = { id: p.id, order: p.order || 0 }; PUB.forEach(k => o[k] = p[k] || ""); return o; });
  download("GB프로덕션보드_백업_" + stamp() + ".json", JSON.stringify({ exportedAt: new Date().toISOString(), projects, amounts: S.amounts }, null, 1), "application/json");
});

/* ───────── 시작 ───────── */
let savedTab = "board"; try { savedTab = localStorage.getItem("gb-tab") || "board"; } catch (e) { }
S.tab = TABS.includes(savedTab) ? savedTab : "board";
window.addEventListener("hashchange", () => { closeDrawer(); startBoard(); });

if (CONFIGURED) {
  getRedirectResult(auth).catch(e => { if (e.code === "auth/unauthorized-domain") notice("이 주소가 Firebase 로그인 허용 도메인에 등록되지 않았습니다.", true); });
  onAuthStateChanged(auth, async u => {
    S.user = u;
    S.role = await resolveRole(u);
    stopPrivate();
    if (S.role === "denied") notice((u.email || "") + " 계정은 편집 권한이 없습니다. 관리자에게 편집자 등록을 요청하세요. (보기는 그대로 가능합니다)");
    else notice("");
    startPrivate();
    renderAuth();
    if (!tabAllowed(S.tab)) S.tab = "board";
    setTab(S.tab);
    renderGate();
    if (S.drawer) closeDrawer();
  });
}
startBoard();
setTab(S.tab);

// 로컬 에뮬레이터 테스트 전용 (운영 환경에서는 동작하지 않음)
if (EMU) window.__gbTest = {
  signIn: (email, name) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: "u-" + email.replace(/\W/g, ""), email, email_verified: true, name }))),
  signOut: () => signOut(auth)
};
