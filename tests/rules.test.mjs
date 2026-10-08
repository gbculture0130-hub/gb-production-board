// Firestore 보안 규칙 테스트 — `npm run test:rules` (에뮬레이터 필요)
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp, writeBatch, collectionGroup, query } from "firebase/firestore";

const OWNER = "gbculture12@gmail.com";
const KEY = "TestBoardKey1234567890";
const B = `boards/${KEY}`;
let env;

const verified = email => ({ email, email_verified: true });
const as = {
  anon: () => env.unauthenticatedContext().firestore(),
  owner: () => env.authenticatedContext("u-owner", verified(OWNER)).firestore(),
  editor: () => env.authenticatedContext("u-ed", verified("editor@gb.kr")).firestore(),
  admin: () => env.authenticatedContext("u-ad", verified("admin@gb.kr")).firestore(),
  stranger: () => env.authenticatedContext("u-st", verified("stranger@gb.kr")).firestore(),
  unverified: () => env.authenticatedContext("u-uv", { email: "editor@gb.kr", email_verified: false }).firestore()
};
const proj = (o = {}) => ({ client: "테스트업체", title: "홍보영상", status: "plan", order: 2, lang: "국문, 영문", narration: "성우", updatedBy: "편집자", ...o });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-gb-rules",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "editors/editor@gb.kr"), { email: "editor@gb.kr", name: "편집자", role: "editor" });
    await setDoc(doc(db, "editors/admin@gb.kr"), { email: "admin@gb.kr", name: "관리자", role: "admin" });
    await setDoc(doc(db, B), { name: "GB" });
    await setDoc(doc(db, `${B}/projects/p001`), proj());
    await setDoc(doc(db, `${B}/amounts/p001`), { amount: 1500, vat: "별도", memo: "" });
    await setDoc(doc(db, `${B}/logs/l1`), { by: "editor@gb.kr", action: "update" });
  });
});

test("로그인 없이: 키를 알면 프로젝트 열람 가능", async () => {
  await assertSucceeds(getDocs(collection(as.anon(), `${B}/projects`)));
  await assertSucceeds(getDoc(doc(as.anon(), B)));
});
test("로그인 없이: 제작 금액·변경 이력·편집자 명단 열람 불가", async () => {
  await assertFails(getDoc(doc(as.anon(), `${B}/amounts/p001`)));
  await assertFails(getDocs(collection(as.anon(), `${B}/amounts`)));
  await assertFails(getDocs(collection(as.anon(), `${B}/logs`)));
  await assertFails(getDocs(collection(as.anon(), "editors")));
});
test("로그인 없이: 보드 목록 조회·전체 검색 불가 (키 추측 방지)", async () => {
  await assertFails(getDocs(collection(as.anon(), "boards")));
  await assertFails(getDocs(query(collectionGroup(as.anon(), "projects"))));
});
test("로그인 없이: 쓰기 전부 불가", async () => {
  await assertFails(setDoc(doc(as.anon(), `${B}/projects/p002`), proj()));
  await assertFails(updateDoc(doc(as.anon(), `${B}/projects/p001`), { status: "done" }));
  await assertFails(deleteDoc(doc(as.anon(), `${B}/projects/p001`)));
});
test("등록 안 된 구글 계정: 열람만, 쓰기·금액 불가", async () => {
  const db = as.stranger();
  await assertSucceeds(getDocs(collection(db, `${B}/projects`)));
  await assertFails(getDoc(doc(db, `${B}/amounts/p001`)));
  await assertFails(updateDoc(doc(db, `${B}/projects/p001`), { status: "done" }));
  await assertFails(setDoc(doc(db, `${B}/projects/p009`), proj()));
  await assertFails(getDocs(collection(db, "editors")));
});
test("이메일 미인증 계정은 편집자 이메일이어도 쓰기 불가", async () => {
  await assertFails(updateDoc(doc(as.unverified(), `${B}/projects/p001`), { status: "done" }));
});
test("편집자: 추가·수정·삭제·금액·이력 가능", async () => {
  const db = as.editor();
  await assertSucceeds(setDoc(doc(db, `${B}/projects/p002`), proj({ client: "신규" })));
  await assertSucceeds(updateDoc(doc(db, `${B}/projects/p001`), { status: "edit", narration: "AI" }));
  await assertSucceeds(getDoc(doc(db, `${B}/amounts/p001`)));
  await assertSucceeds(setDoc(doc(db, `${B}/amounts/p002`), { amount: 300, vat: "포함", memo: "" }));
  await assertSucceeds(getDocs(collection(db, `${B}/logs`)));
  const b = writeBatch(db);
  b.delete(doc(db, `${B}/projects/p002`));
  b.delete(doc(db, `${B}/amounts/p002`));
  b.set(doc(collection(db, `${B}/logs`)), { at: serverTimestamp(), by: "editor@gb.kr", byName: "편집자", action: "delete", pid: "p002", label: "신규", changes: [] });
  await assertSucceeds(b.commit());
});
test("편집자: 공개 문서에 금액 필드·잘못된 값 저장 불가", async () => {
  const db = as.editor();
  await assertFails(setDoc(doc(db, `${B}/projects/p003`), proj({ amount: 1000 })));
  await assertFails(setDoc(doc(db, `${B}/projects/p003`), proj({ status: "unknown" })));
  await assertFails(setDoc(doc(db, `${B}/projects/p003`), proj({ client: "" })));
  await assertFails(setDoc(doc(db, `${B}/projects/p003`), proj({ narration: "아무거나" })));
});
test("편집자: 이력 위조·수정·삭제 불가", async () => {
  const db = as.editor();
  await assertFails(setDoc(doc(db, `${B}/logs/x`), { at: serverTimestamp(), by: "admin@gb.kr", action: "update" }));
  await assertFails(updateDoc(doc(db, `${B}/logs/l1`), { action: "delete" }));
  await assertFails(deleteDoc(doc(db, `${B}/logs/l1`)));
});
test("편집자: 편집자 명단 열람 가능, 관리는 불가", async () => {
  const db = as.editor();
  await assertSucceeds(getDocs(collection(db, "editors")));
  await assertFails(setDoc(doc(db, "editors/new@gb.kr"), { email: "new@gb.kr", name: "신입", role: "editor" }));
  await assertFails(updateDoc(doc(db, "editors/editor@gb.kr"), { role: "admin" }));
});
test("관리자: 편집자 추가·권한 변경·삭제 가능, 소유자 문서는 불가", async () => {
  const db = as.admin();
  await assertSucceeds(setDoc(doc(db, "editors/new@gb.kr"), { email: "new@gb.kr", name: "신입", role: "editor", addedAt: serverTimestamp(), addedBy: "admin@gb.kr" }));
  await assertSucceeds(updateDoc(doc(db, "editors/new@gb.kr"), { role: "admin" }));
  await assertSucceeds(deleteDoc(doc(db, "editors/new@gb.kr")));
  await assertFails(setDoc(doc(db, `editors/${OWNER}`), { email: OWNER, name: "x", role: "editor" }));
  await assertFails(setDoc(doc(db, "editors/bad@gb.kr"), { email: "other@gb.kr", name: "x", role: "editor" }));
});
test("소유자: 등록 없이 관리자 권한, 새 보드 생성 가능", async () => {
  const db = as.owner();
  await assertSucceeds(getDoc(doc(db, `${B}/amounts/p001`)));
  await assertSucceeds(setDoc(doc(db, "editors/x@gb.kr"), { email: "x@gb.kr", name: "X", role: "editor" }));
  await assertSucceeds(setDoc(doc(db, "boards/AnotherBoardKey123456"), { name: "GB", createdAt: serverTimestamp(), createdBy: OWNER }));
  await assertFails(setDoc(doc(as.editor(), "boards/EditorBoardKey1234567"), { name: "GB" }));
});
test("본인 편집자 문서는 직접 조회 가능 (권한 확인용)", async () => {
  await assertSucceeds(getDoc(doc(as.editor(), "editors/editor@gb.kr")));
  await assertSucceeds(getDoc(doc(as.stranger(), "editors/stranger@gb.kr")));
  await assertFails(getDoc(doc(as.stranger(), "editors/editor@gb.kr")));
});
