import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, seedState } from "../src/lib/domain";
import { sampleExtraction } from "../src/lib/samples";
import { actionSchema } from "../src/lib/schema";
import { nextDose } from "../src/lib/presentation";
import type { AppState, DocKind, DocumentRecord } from "../src/lib/types";
const now = new Date("2026-10-28T04:00:00Z");
function action(s: AppState, a: unknown, role: "child" | "elder" = "elder") {
  return applyAction(s, actionSchema.parse(a), role, now);
}
function consultation() {
  let s = seedState("start", now);
  for (const type of ["arrive", "checkin", "consult"]) s = action(s, { type });
  return s;
}
function withDoc(s: AppState, kind: DocKind): [AppState, string] {
  const d: DocumentRecord = {
    id: `doc-${s.documents.length}`,
    fingerprint: `hash-${s.documents.length}`,
    filename: "demo",
    url: "",
    createdAt: now.toISOString(),
    provider: "sample",
    extraction: sampleExtraction(kind),
    confirmedAt: null,
    applied: false,
  };
  s = structuredClone(s);
  s.documents.push(d);
  return [s, d.id];
}
test("完整主线：单据确认、检查、报告再接诊、取药及独立服药提醒", () => {
  let s = consultation();
  let docId;
  [s, docId] = withDoc(s, "test_order");
  assert.equal(s.visit.stage, 3);
  s = action(s, { type: "confirmDocument", id: docId });
  assert.equal(s.visit.stage, 4);
  const tid = s.visit.tests[0].id;
  for (const type of ["testPay", "testDone"]) s = action(s, { type, id: tid });
  [s, docId] = withDoc(s, "report");
  s = action(s, { type: "confirmDocument", id: docId });
  s = action(s, { type: "returnDoctor" });
  s = action(s, { type: "reviewReport", needsMedicine: true });
  [s, docId] = withDoc(s, "prescription");
  s = action(s, { type: "confirmDocument", id: docId });
  assert.equal(s.visit.pickedUp, false);
  assert.equal(s.medications[0].active, false);
  s = action(s, { type: "medPay" });
  s = action(s, { type: "collectMedicine" });
  const med = s.medications[0];
  s = action(
    s,
    { type: "saveMedication", medication: { ...med, times: ["08:00", "20:00"] } },
    "child",
  );
  s = action(s, { type: "enableMedication", id: med.id }, "child");
  assert.equal(s.doses.length, 2);
  s = action(s, { type: "doseTaken", id: s.doses[0].id });
  assert.equal(s.visit.stage, 7);
  assert.equal(s.doses[0].status, "taken");
});
test("未经报到不能接诊，未经缴费确认不能完成检查", () => {
  let s = seedState("start", now);
  s = action(s, { type: "arrive" });
  assert.throws(() => action(s, { type: "consult" }), /报到/);
  s = consultation();
  s = action(s, {
    type: "afterConsult",
    tests: [{ name: "血常规", location: "" }],
    needsMedicine: false,
  });
  assert.throws(() => action(s, { type: "testDone", id: s.visit.tests[0].id }), /费用/);
});
test("无需检查、无需药品两条短分支", () => {
  const s = consultation();
  assert.equal(action(s, { type: "afterConsult", tests: [], needsMedicine: true }).visit.stage, 6);
  assert.equal(action(s, { type: "afterConsult", tests: [], needsMedicine: false }).visit.stage, 7);
});
test("两项检查必须各自取得报告", () => {
  let s = consultation();
  s = action(s, {
    type: "afterConsult",
    tests: [
      { name: "血常规", location: "A" },
      { name: "尿常规", location: "B" },
    ],
    needsMedicine: false,
  });
  const id = s.visit.tests[0].id;
  for (const type of ["testPay", "testDone", "reportReceived"]) s = action(s, { type, id });
  assert.throws(() => action(s, { type: "returnDoctor" }), /所有检查/);
});
test("报告回执只保存材料，不能证明检查和报告已完成", () => {
  let s = seedState("tests", now),
    id;
  [s, id] = withDoc(s, "receipt");
  s = action(s, { type: "confirmDocument", id });
  assert.equal(s.visit.tests[0].done, false);
  assert.equal(s.visit.tests[0].report, false);
  assert.equal(s.documents[0].applied, false);
});
test("正式报告也需要先确认检查完成", () => {
  let s = seedState("tests", now),
    id;
  [s, id] = withDoc(s, "report");
  assert.throws(() => action(s, { type: "confirmDocument", id }), /检查已完成/);
});
test("检查时上传处方不得跳过报告与再次接诊", () => {
  let s = seedState("tests", now),
    id;
  [s, id] = withDoc(s, "prescription");
  s = action(s, { type: "confirmDocument", id });
  assert.equal(s.visit.stage, 4);
  assert.equal(s.visit.pickedUp, false);
  assert.throws(
    () => action(s, { type: "enableMedication", id: s.medications[0].id }, "child"),
    /取到药/,
  );
});
test("阶段不匹配的检查单先归档", () => {
  let s = seedState("start", now),
    id;
  [s, id] = withDoc(s, "test_order");
  s = action(s, { type: "confirmDocument", id });
  assert.equal(s.visit.stage, 1);
  assert.equal(s.visit.tests.length, 0);
  assert.equal(s.documents[0].applied, false);
});
test("重复确认同一处方，不增加药品或推进阶段", () => {
  let s = consultation(),
    id;
  [s, id] = withDoc(s, "prescription");
  s = action(s, { type: "confirmDocument", id });
  const same = action(s, { type: "confirmDocument", id });
  assert.equal(same, s);
  assert.equal(same.medications.length, 1);
  assert.equal(same.visit.stage, 6);
});
test("服药剂量缺失不能保存，未取药不能启用", () => {
  const s = seedState("medication", now),
    med = s.medications[0];
  assert.throws(
    () => action(s, { type: "saveMedication", medication: { ...med, dose: "" } }, "child"),
    /用量/,
  );
  s.visit.pickedUp = false;
  assert.throws(() => action(s, { type: "enableMedication", id: med.id }, "child"), /取到药/);
});
test("稍后提醒保留同一剂及原计划，重复确认只有一条记录", () => {
  let s = seedState("medication", now);
  const d = s.doses[0],
    time = d.scheduledAt;
  s = action(s, { type: "doseSnooze", id: d.id });
  assert.equal(s.doses.length, 2);
  assert.equal(s.doses[0].scheduledAt, time);
  assert.equal(s.doses[0].status, "pending");
  s = action(s, { type: "doseTaken", id: d.id });
  assert.equal(action(s, { type: "doseTaken", id: d.id }), s);
  assert.equal(s.doses.filter((d) => d.status === "taken").length, 1);
});
test("到时无回应仍为待确认，尚未到点不能确认服药", () => {
  const s = seedState("medication", now);
  assert.equal(s.doses[0].status, "pending");
  assert.throws(() => action(s, { type: "doseTaken", id: s.doses[1].id }), /还没到/);
});
test("求助处理不推进就医，撤销恢复共享数据", () => {
  let s = seedState("start", now);
  s = action(s, { type: "help", note: "帮忙" });
  const helped = s;
  s = action(s, { type: "resolveHelp" }, "child");
  assert.equal(s.visit.stage, 1);
  assert.equal(s.help, null);
  s = action(s, { type: "undo" });
  assert.equal(s.help?.note, helped.help?.note);
  assert.equal(s.undo, null);
  assert.ok(s.revision > helped.revision);
});
test("长辈不能修改预约、启用药品或重置家庭", () => {
  const s = seedState("start", now);
  assert.throws(
    () => action(s, { type: "appointment", appointment: s.visit.appointment }),
    /子女端/,
  );
  assert.throws(() => action(s, { type: "reset", scenario: "start" }), /子女端/);
});
test("时间与日期验证拒绝无效输入及重复提醒", () => {
  const med = seedState("medication", now).medications[0];
  for (const value of [
    { ...med, times: ["25:00"] },
    { ...med, times: ["08:00", "08:00"] },
    { ...med, startDate: "2026-02-30" },
  ])
    assert.equal(
      actionSchema.safeParse({ type: "saveMedication", medication: value }).success,
      false,
    );
});
test("重新核对已启用计划，保留已发生记录且不重复生成时次", () => {
  let s = seedState("medication", now);
  const med = s.medications[0];
  s = action(s, { type: "doseTaken", id: s.doses[0].id });
  s = action(
    s,
    { type: "saveMedication", medication: { ...med, times: ["08:00", "19:00"] } },
    "child",
  );
  s = action(s, { type: "enableMedication", id: med.id }, "child");
  assert.equal(s.doses.filter((d) => d.status === "taken").length, 1);
  assert.equal(s.doses.length, 2);
  assert.equal(s.doses[1].scheduledAt.endsWith("19:00:00+08:00"), true);
});
test("稍后提醒排序以再次提醒时间为准", () => {
  const s = seedState("medication", now);
  s.doses[0].snoozedUntil = "2026-10-28T04:10:00Z";
  assert.equal(nextDose(s, now)!.id, s.doses[0].id);
});
test("提前归档的检查单可以在接诊后确认使用", () => {
  let s = seedState("start", now),
    id;
  [s, id] = withDoc(s, "test_order");
  s = action(s, { type: "confirmDocument", id });
  assert.equal(s.documents[0].applied, false);
  for (const type of ["arrive", "checkin", "consult"]) s = action(s, { type });
  s = action(s, { type: "confirmDocument", id });
  assert.equal(s.visit.stage, 4);
  assert.equal(s.visit.tests.length, 1);
  assert.equal(s.documents[0].applied, true);
});
test("昨天未确认的记录保留，不作为今天的服药指令", () => {
  const s = seedState("medication", now);
  assert.equal(nextDose(s, new Date("2026-10-29T04:00:00Z")), undefined);
  assert.equal(s.doses[0].status, "pending");
});
test("同一张单据同时有检查和药品，先检查再取药", () => {
  let s = consultation(),
    id;
  [s, id] = withDoc(s, "prescription");
  s.documents[0].extraction.tests = [{ name: "血常规", location: "检验科" }];
  s = action(s, { type: "confirmDocument", id });
  assert.equal(s.visit.stage, 4);
  assert.equal(s.visit.tests.length, 1);
  assert.equal(s.medications.length, 1);
  assert.equal(s.visit.needsMedicine, true);
});
