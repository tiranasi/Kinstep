import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
async function login(role) {
  const r = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ role }),
  });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie()[0].split(";")[0];
}
async function read(cookie) {
  const r = await fetch(`${base}/api/state`, { headers: { cookie } });
  assert.equal(r.status, 200);
  return r.json();
}
async function send(cookie, state, action, expected = 200) {
  const r = await fetch(`${base}/api/state`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: base },
    body: JSON.stringify({ revision: state.revision, action }),
  });
  const result = await r.json();
  assert.equal(r.status, expected, JSON.stringify(result));
  return result.state;
}
async function sample(cookie, kind) {
  const form = new FormData();
  form.append("sample", kind);
  const r = await fetch(`${base}/api/documents`, {
    method: "POST",
    headers: { cookie, origin: base },
    body: form,
  });
  const result = await r.json();
  assert.equal(r.status, 200, JSON.stringify(result));
  return result;
}
async function settings(cookie, action) {
  return fetch(`${base}/api/settings`, {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify(action),
  });
}
assert.equal((await fetch(`${base}/api/state`)).status, 401);
const elder = await login("elder"),
  child = await login("child");
assert.equal((await settings(elder, { type: "mode", caseMode: true })).status, 403);
assert.equal((await settings(child, { type: "mode", caseMode: false })).status, 200);
let empty = await read(child);
assert.equal(empty.caseMode, false);
assert.equal(empty.state.visit.stage, 0);
assert.ok(Object.values(empty.state.visit.appointment).every((field) => field === ""));
assert.ok(!empty.state.childName);
const preset = new FormData();
preset.append("sample", "report");
assert.equal(
  (
    await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: { cookie: elder },
      body: preset,
    })
  ).status,
  403,
);
assert.equal(
  (await fetch(`${base}/samples/report.svg`, { headers: { cookie: elder } })).status,
  404,
);
assert.equal((await settings(child, { type: "mode", caseMode: true })).status, 200);
let s = (await read(child)).state;
assert.equal((await read(elder)).caseMode, true);
s = await send(child, s, { type: "reset", scenario: "start" });
const stale = s;
s = await send(elder, s, { type: "arrive" });
assert.equal((await read(child)).state.visit.stage, 2);
await send(child, stale, { type: "checkin" }, 409);
s = await send(elder, s, { type: "checkin" });
s = await send(elder, s, { type: "consult" });
const pending = await sample(elder, "test_order");
assert.equal(pending.state.visit.stage, 3);
s = await send(elder, pending.state, { type: "confirmDocument", id: pending.document.id });
assert.equal(s.visit.stage, 4);
const duplicate = await sample(child, "test_order");
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.state.documents.length, 1);
const tid = s.visit.tests[0].id;
for (const type of ["testPay", "testDone"]) s = await send(elder, s, { type, id: tid });
const receipt = await sample(elder, "receipt");
s = await send(elder, receipt.state, { type: "confirmDocument", id: receipt.document.id });
assert.equal(s.visit.tests[0].report, false);
const report = await sample(elder, "report");
s = await send(elder, report.state, { type: "confirmDocument", id: report.document.id });
s = await send(elder, s, { type: "returnDoctor" });
s = await send(elder, s, { type: "reviewReport", needsMedicine: true });
const prescription = await sample(elder, "prescription");
s = await send(elder, prescription.state, {
  type: "confirmDocument",
  id: prescription.document.id,
});
assert.equal(s.visit.pickedUp, false);
s = await send(elder, s, { type: "medPay" });
s = await send(elder, s, { type: "collectMedicine" });
assert.equal(s.visit.stage, 7);
const med = s.medications[0];
s = await send(child, s, {
  type: "saveMedication",
  medication: { ...med, times: ["00:00", "23:59"] },
});
s = await send(child, s, { type: "enableMedication", id: med.id });
const dose = s.doses[0],
  count = s.doses.length;
s = await send(elder, s, { type: "doseSnooze", id: dose.id });
assert.equal(s.doses.length, count);
s = await send(elder, s, { type: "doseTaken", id: dose.id });
s = await send(elder, s, { type: "doseTaken", id: dose.id });
assert.equal(s.doses.filter((d) => d.status === "taken").length, 1);
const chat = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: { cookie: elder, "content-type": "application/json", origin: base },
  body: JSON.stringify({ text: "我接下来该去哪里？" }),
});
assert.equal(chat.status, 200);
assert.ok((await chat.json()).reply);
const bad = await fetch(`${base}/api/session`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://other.example" },
  body: JSON.stringify({ role: "child" }),
});
assert.equal(bad.status, 403);
const sync = (await read(child)).state;
assert.equal(sync.revision, s.revision);
assert.equal(sync.doses[0].status, "taken");
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64",
);
const archive = new FormData();
archive.append("image", new Blob([image], { type: "image/png" }), "manual.png");
archive.append(
  "extraction",
  JSON.stringify({
    kind: "other",
    title: "手动归档测试",
    summary: "",
    tests: [],
    medicines: [],
    targetName: "",
    paymentFor: "unknown",
    hospital: "",
    department: "",
    date: "",
    time: "",
    location: "",
    notes: "接口测试材料",
  }),
);
const saved = await fetch(`${base}/api/documents`, {
  method: "POST",
  headers: { cookie: child, origin: base },
  body: archive,
});
assert.equal(saved.status, 200);
const savedDoc = (await saved.json()).document;
assert.equal(savedDoc.provider, "manual");
const photo = await fetch(`${base}${savedDoc.url}`, { headers: { cookie: elder } });
assert.equal(photo.status, 200);
assert.deepEqual(Buffer.from(await photo.arrayBuffer()), image);
assert.equal((await fetch(`${base}${savedDoc.url}`)).status, 401);
if (!(await read(child)).aiConfigured) {
  const form = new FormData();
  form.append(
    "image",
    new Blob(
      [
        Buffer.concat([
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
            "base64",
          ),
          Buffer.from([1]),
        ]),
      ],
      { type: "image/png" },
    ),
    "test.png",
  );
  const upload = await fetch(`${base}/api/documents`, {
    method: "POST",
    headers: { cookie: elder, origin: base },
    body: form,
  });
  assert.equal(upload.status, 503);
  assert.equal((await read(child)).state.visit.stage, 7);
}
console.log(
  "PASS: 两端会话、完整主线、单据待确认与去重、回执归档、服药核对和逐次记录、过期版本冲突、同源校验、无密钥错误恢复。",
);

const draft = {
  hospital: "联调医院",
  department: "联调科室",
  doctor: "",
  date: "2026-12-05",
  time: "09:30",
  location: "东楼 3 层",
  pharmacy: "",
  patient: "测试用户",
};
const calls = [];
const provider = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString());
  calls.push({ url: req.url, auth: req.headers.authorization, ...request });
  const result = request.messages[0].content.startsWith("Extract a hospital appointment")
    ? draft
    : { reply: "The listed test fee is ¥35.00.", action: null };
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
});
provider.listen(0, "127.0.0.1");
await once(provider, "listening");
const url = `http://127.0.0.1:${provider.address().port}/v1/chat/completions`;
const key = "local-test-key";
try {
  assert.equal(
    (await settings(child, { type: "model", url, model: "local-multimodal", key })).status,
    200,
  );
  const visible = await (
    await fetch(`${base}/api/settings`, { headers: { cookie: child } })
  ).json();
  assert.equal(visible.hasKey, true);
  assert.equal(visible.key, undefined);
  assert.equal(visible.url, url);
  assert.equal((await fetch(`${base}/api/settings`, { headers: { cookie: elder } })).status, 403);
  const request = (
    endpoint,
    body,
    headers = { "content-type": "application/json" },
    cookie = child,
  ) =>
    fetch(`${base}/api/${endpoint}`, {
      method: "POST",
      headers: { cookie, origin: base, ...headers },
      body,
    });
  const ask = await request(
    "chat",
    JSON.stringify({ text: "How much is the test?", locale: "en" }),
  );
  assert.equal(ask.status, 200);
  assert.equal((await ask.json()).reply, "The listed test fee is ¥35.00.");
  assert.equal(calls[0].url, "/v1/chat/completions");
  assert.equal(calls[0].model, "local-multimodal");
  assert.equal(calls[0].auth, `Bearer ${key}`);
  for (const fact of ["¥35.00", "¥28.00", "血红蛋白", "药品 A", "市立医院"]) {
    assert.ok(calls[0].messages[0].content.includes(fact), fact);
  }
  assert.equal((await settings(child, { type: "mode", caseMode: false })).status, 200);
  empty = await read(elder);
  assert.equal(empty.state.documents.length, 0);
  assert.equal(empty.state.medications.length, 0);
  assert.equal(empty.state.visit.appointment.patient, "");
  await send(child, s, { type: "arrive" }, 409);
  const voiceDraft = await request("appointment", JSON.stringify({ text: "挂号信息" }));
  assert.equal(voiceDraft.status, 200);
  assert.deepEqual((await voiceDraft.json()).appointment, draft);
  assert.equal(
    (await request("appointment", JSON.stringify({ text: "挂号信息" }), undefined, elder)).status,
    403,
  );
  const upload = new FormData();
  upload.append("image", new Blob([image], { type: "image/png" }), "appointment.png");
  const imageDraft = await request("appointment", upload, {});
  assert.equal(imageDraft.status, 200);
  assert.deepEqual((await imageDraft.json()).appointment, draft);
  assert.match(calls.at(-1).messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal((await read(child)).state.visit.stage, 0);
  const confirmed = await send(child, empty.state, { type: "appointment", appointment: draft });
  assert.deepEqual((await read(elder)).state.visit.appointment, draft);
  await send(child, confirmed, { type: "profile", patient: draft.patient, childName: "Ning" });
  await settings(child, { type: "mode", caseMode: true });
  assert.equal((await read(elder)).state.visit.stage, 7);
  await settings(child, { type: "mode", caseMode: false });
  assert.equal((await read(elder)).state.childName, "Ning");
  await request("chat", JSON.stringify({ text: "下一步？" }));
  assert.ok(!calls.at(-1).messages[0].content.includes("¥35.00"));
  assert.equal(
    (
      await settings(child, {
        type: "model",
        url: url.replace("/v1/", "/next/"),
        model: "local-multimodal",
      })
    ).status,
    200,
  );
  assert.equal((await read(child)).aiConfigured, false);
} finally {
  provider.close();
}
console.log("PASS: 空白与案例隔离、双端切换、模型配置、案例上下文、文字/截图提取与预约确认。");
