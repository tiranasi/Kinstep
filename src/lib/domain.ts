import { randomUUID } from "node:crypto";
import type { Action } from "./schema";
import { dateSchema } from "./schema";
import type { AppState, DocumentRecord, Medication, Role, TestTask } from "./types";
import { localDate, scheduledISO } from "./types";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError(message);
}
const id = () => randomUUID();
export const blankAppointment = {
  hospital: "",
  department: "",
  doctor: "",
  date: "",
  time: "",
  location: "",
  pharmacy: "",
  patient: "",
};
export function seedState(scenario = "start", now = new Date()): AppState {
  const today = localDate(now),
    at = now.toISOString();
  const s: AppState = {
    revision: 1,
    updatedAt: at,
    visit: {
      stage: scenario === "empty" ? 0 : 1,
      appointment: {
        hospital: "市立医院",
        department: "心内科",
        doctor: "李医生",
        date: today,
        time: "09:00–09:30",
        location: "门诊楼 2 层 · 心内科",
        pharmacy: "门诊楼 1 层 · 西药房",
        patient: "陈阿姨",
      },
      registered: false,
      needsMedicine: false,
      medPaid: false,
      pickedUp: false,
      tests: [],
    },
    documents: [],
    medications: [],
    doses: [],
    help: null,
    timeline: [],
    undo: null,
  };
  if (scenario === "empty") s.visit.appointment = { ...blankAppointment };
  else s.childName = "陈宁";
  if (s.visit.stage)
    s.timeline.push({ id: id(), at, label: "已安排本次就医", source: "预约记录", stage: 1 });
  if (scenario === "tests") {
    s.visit.stage = 4;
    s.visit.registered = true;
    s.visit.tests = [
      {
        id: id(),
        name: "血常规",
        location: "门诊楼 2 层 · 检验科",
        paid: true,
        done: false,
        report: false,
        source: "检查申请单",
      },
    ];
    s.timeline.push({ id: id(), at, label: "已确认血常规检查安排", source: "预约记录", stage: 4 });
  }
  if (scenario === "medication") {
    s.visit.stage = 7;
    s.visit.registered = true;
    s.visit.needsMedicine = true;
    s.visit.medPaid = true;
    s.visit.pickedUp = true;
    s.medications = [
      {
        id: id(),
        name: "药品 A",
        strength: "10 mg / 片",
        dose: "每次 1 片",
        route: "口服",
        frequency: "每日 2 次",
        instructions: "餐后服用",
        times: ["08:00", "20:00"],
        startDate: today,
        endDate: today,
        source: "处方",
        reviewed: true,
        active: true,
      },
    ];
    s.timeline.push({
      id: id(),
      at,
      label: "就医已完成，服药提醒已启用",
      source: "预约记录",
      stage: 7,
    });
    generateDoses(s, s.medications[0]);
  }
  return s;
}
function generateDoses(s: AppState, m: Medication) {
  for (let day = m.startDate; day <= m.endDate;) {
    for (const time of m.times) {
      const doseId = `${m.id}:${day}:${time}`;
      if (!s.doses.some((d) => d.id === doseId))
        s.doses.push({
          id: doseId,
          medicationId: m.id,
          scheduledAt: scheduledISO(day, time),
          status: "pending",
          confirmedAt: null,
          snoozedUntil: null,
        });
    }
    day = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  }
}
function append(s: AppState, label: string, source: string, at: string) {
  s.timeline.push({ id: id(), at, label, source, stage: s.visit.stage });
}
function addTests(s: AppState, tests: { name: string; location: string }[], source: string) {
  for (const t of tests) {
    const existing = s.visit.tests.find((e) => e.name === t.name);
    if (existing) {
      if (t.location) existing.location = t.location;
    } else
      s.visit.tests.push({
        id: id(),
        name: t.name,
        location: t.location,
        paid: false,
        done: false,
        report: false,
        source,
      });
  }
}
function addMedicineDrafts(s: AppState, doc: DocumentRecord, at: string) {
  for (const m of doc.extraction.medicines) {
    if (s.medications.some((e) => e.sourceDocId === doc.id && e.name === m.name)) continue;
    s.medications.push({
      ...m,
      id: id(),
      source: doc.extraction.title,
      sourceDocId: doc.id,
      reviewed: false,
      active: false,
      times: [],
      startDate: localDate(new Date(at)),
      endDate: localDate(new Date(at)),
    });
  }
}
function applyDocument(s: AppState, doc: DocumentRecord, role: Role, at: string) {
  const e = doc.extraction,
    v = s.visit;
  doc.applied = false;
  switch (e.kind) {
    case "appointment":
      if (role === "child") {
        const a = v.appointment;
        for (const key of [
          "hospital",
          "department",
          "time",
          "location",
          "doctor",
          "pharmacy",
          "patient",
        ] as const) {
          if (e[key]) a[key] = e[key];
        }
        if (dateSchema.safeParse(e.date).success) a.date = e.date;
        if (v.stage === 0 && a.hospital && a.department && a.date && a.time) v.stage = 1;
        doc.applied = true;
      }
      break;
    case "test_order":
      if (v.stage === 3 && e.tests.length) {
        addTests(s, e.tests, e.title);
        v.stage = 4;
        doc.applied = true;
      } else if (v.stage === 4 && e.tests.length) {
        addTests(s, e.tests, e.title);
        doc.applied = true;
      }
      if (e.medicines.length) {
        addMedicineDrafts(s, doc, at);
        v.needsMedicine = true;
      }
      break;
    case "report": {
      const task = matchTest(s, e.targetName);
      if (v.stage === 4 && task) {
        requireThat(task.done, "请先确认这项检查已完成，再确认报告。");
        task.report = true;
        doc.applied = true;
      }
      break;
    }
    case "payment":
      if (e.paymentStatus !== "paid") break;
      if (e.paymentFor === "medicine" && v.stage === 6) {
        v.medPaid = true;
        doc.applied = true;
      }
      if (e.paymentFor === "test" && v.stage === 4) {
        const task = matchTest(s, e.targetName);
        if (task) {
          task.paid = true;
          doc.applied = true;
        }
      }
      break;
    case "prescription":
      addMedicineDrafts(s, doc, at);
      doc.applied = e.medicines.length > 0;
      if (e.medicines.length) {
        v.needsMedicine = true;
        if (v.stage === 3) {
          if (e.tests.length) addTests(s, e.tests, e.title);
          v.stage = v.tests.length ? 4 : 6;
        }
      }
      break;
    // A collection receipt is information, never proof of a completed examination.
    case "receipt":
    case "other":
      break;
  }
}
export function matchTest(s: AppState, name: string): TestTask | undefined {
  return name ? s.visit.tests.find((t) => t.name === name) : undefined;
}

export function applyAction(original: AppState, a: Action, role: Role, now = new Date()): AppState {
  const childOnly = [
    "appointment",
    "profile",
    "resolveHelp",
    "saveMedication",
    "enableMedication",
    "reset",
  ];
  requireThat(!childOnly.includes(a.type) || role === "child", "请在子女端完成这项操作。");
  if (a.type === "reset") {
    const reset = seedState(a.scenario, now);
    reset.revision = original.revision + 1;
    return reset;
  }
  if (a.type === "undo") {
    requireThat(original.undo, "暂时没有可以撤销的操作。");
    const restored = JSON.parse(original.undo.snapshot) as AppState;
    restored.revision = original.revision + 1;
    restored.updatedAt = now.toISOString();
    restored.undo = null;
    return restored;
  }
  const s: AppState = structuredClone(original),
    v = s.visit,
    at = now.toISOString(),
    source = role === "elder" ? "长辈确认" : "子女确认";
  let label = "";
  switch (a.type) {
    case "profile":
      v.appointment.patient = a.patient;
      s.childName = a.childName;
      label = "已更新姓名";
      break;
    case "appointment":
      v.appointment = a.appointment;
      if (v.stage === 0) v.stage = 1;
      label = "已更新就医安排";
      break;
    case "arrive":
      requireThat(v.stage === 1, "当前不在待到院阶段。");
      v.stage = 2;
      label = "已到医院";
      break;
    case "checkin":
      requireThat(v.stage === 2, "当前不在报到阶段。");
      if (v.registered) return original;
      v.registered = true;
      label = "已报到，等待叫号";
      break;
    case "consult":
      requireThat(v.stage === 2 && v.registered, "请先完成诊区报到。");
      v.stage = 3;
      label = "轮到接诊";
      break;
    case "afterConsult":
      requireThat(v.stage === 3, "当前不在医生接诊阶段。");
      addTests(s, a.tests, source);
      v.needsMedicine = a.needsMedicine || v.needsMedicine;
      v.stage = v.tests.length ? 4 : v.needsMedicine ? 6 : 7;
      label =
        v.stage === 4 ? "已确认检查安排" : v.stage === 6 ? "无需检查，前往取药" : "就医已完成";
      break;
    case "testPay":
    case "testDone":
    case "reportReceived": {
      requireThat(v.stage === 4, "当前不在检查阶段。");
      const t = v.tests.find((t) => t.id === a.id);
      requireThat(t, "没有找到这项检查。");
      if (a.type === "testPay") {
        if (t.paid) return original;
        t.paid = true;
        label = `${t.name}：已确认缴费`;
      }
      if (a.type === "testDone") {
        requireThat(t.paid, "请先确认检查费用已缴纳。");
        if (t.done) return original;
        t.done = true;
        label = `${t.name}：检查已完成`;
      }
      if (a.type === "reportReceived") {
        requireThat(t.done, "请先确认检查已完成。");
        if (t.report) return original;
        t.report = true;
        label = `${t.name}：报告已拿到`;
      }
      break;
    }
    case "returnDoctor":
      requireThat(
        v.stage === 4 && v.tests.length && v.tests.every((t) => t.done && t.report),
        "请先完成所有检查并取得报告。",
      );
      v.stage = 5;
      label = "带报告返回医生处";
      break;
    case "reviewReport":
      requireThat(v.stage === 5, "当前不在报告再接诊阶段。");
      v.needsMedicine = a.needsMedicine;
      v.stage = a.needsMedicine ? 6 : 7;
      label = a.needsMedicine ? "医生已看过报告，准备取药" : "医生已看过报告，就医完成";
      break;
    case "medPay":
      requireThat(v.stage === 6, "当前不在取药阶段。");
      if (v.medPaid) return original;
      v.medPaid = true;
      label = "药品已确认缴费";
      break;
    case "collectMedicine":
      requireThat(v.stage === 6 && v.medPaid, "请先确认药品费用已缴纳。");
      v.pickedUp = true;
      v.stage = 7;
      label = "药已经拿到，就医完成";
      break;
    case "help":
      if (s.help) return original;
      s.help = { id: id(), note: a.note || "请协助查看当前就医安排。", at };
      label = "求助已发送";
      break;
    case "resolveHelp":
      if (!s.help) return original;
      s.help = null;
      label = "求助已标记为已处理";
      break;
    case "confirmDocument": {
      const doc = s.documents.find((d) => d.id === a.id);
      requireThat(doc, "没有找到这张单据。");
      if (doc.confirmedAt && doc.applied) return original;
      if (a.extraction) {
        requireThat(role === "child", "请在子女端核对详细字段。");
        doc.extraction = a.extraction;
      }
      applyDocument(s, doc, role, at);
      if (doc.confirmedAt && !doc.applied && !a.extraction) return original;
      doc.confirmedAt = at;
      label = `已确认${doc.extraction.title || "单据"}${doc.applied ? "" : "，材料已保存"}`;
      break;
    }
    case "saveMedication": {
      const input = a.medication;
      const existing = input.id ? s.medications.find((m) => m.id === input.id) : undefined;
      requireThat(!input.id || existing, "没有找到这项服药安排。");
      requireThat(input.dose && input.route && input.frequency, "请补充每次用量、服用方式与频次。");
      const med: Medication = {
        ...input,
        id: existing?.id || id(),
        times: [...input.times].sort(),
        reviewed: true,
        active: false,
      };
      if (existing) s.medications[s.medications.indexOf(existing)] = med;
      else s.medications.push(med);
      // Preserve observed records; future unconfirmed reminders are regenerated on activation.
      s.doses = s.doses.filter(
        (d) => d.medicationId !== med.id || d.status !== "pending" || new Date(d.scheduledAt) < now,
      );
      label = `已核对${med.name}的服药安排`;
      break;
    }
    case "enableMedication": {
      requireThat(v.stage === 7 && v.pickedUp, "确认取到药并完成就医后，即可启用提醒。");
      const med = s.medications.find((m) => m.id === a.id);
      requireThat(med, "没有找到这项服药安排。");
      requireThat(
        med.reviewed && med.dose && med.route && med.frequency && med.source && med.times.length,
        "请先核对用法并设置提醒时间。",
      );
      requireThat(med.endDate >= localDate(now), "提醒周期已结束，请重新核对日期。");
      if (med.active) return original;
      med.active = true;
      generateDoses(s, med);
      label = `已启用${med.name}的服药提醒`;
      break;
    }
    case "doseTaken":
    case "doseSkip":
    case "doseSnooze": {
      const d = s.doses.find((d) => d.id === a.id);
      requireThat(d, "没有找到本次服药记录。");
      const med = s.medications.find((m) => m.id === d.medicationId);
      requireThat(med?.active, "这项提醒尚未启用。");
      if (d.status !== "pending") return original;
      requireThat(new Date(d.scheduledAt) <= now, "还没到这次提醒时间。");
      if (a.type === "doseSnooze") {
        d.snoozedUntil = new Date(now.getTime() + 10 * 60000).toISOString();
        label = `${med.name}：10分钟后再提醒`;
      } else {
        d.status = a.type === "doseTaken" ? "taken" : "skipped";
        d.confirmedAt = at;
        d.source = source;
        d.snoozedUntil = null;
        label = `${med.name}：${d.status === "taken" ? "已确认服药" : "本次未服"}`;
      }
      break;
    }
  }
  s.undo = { label, snapshot: JSON.stringify({ ...original, undo: null }) };
  s.revision = original.revision + 1;
  s.updatedAt = at;
  append(s, label, source, at);
  return s;
}
