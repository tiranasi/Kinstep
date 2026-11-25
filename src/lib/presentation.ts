import { localDate, type AppState, type Dose, type Locale } from "./types";
import type { Action } from "./schema";
import { translate } from "./translations";
export interface TaskView {
  title: string;
  description: string;
  location: string;
  actionLabel: string;
  action: Action | null;
  dialog?: "afterConsult" | "reviewReport";
}
export function getTask(s: AppState, locale: Locale = "zh"): TaskView {
  const v = s.visit,
    a = v.appointment;
  const t = (value: string) => translate(locale, value);
  const task = (
    title: string,
    description: string,
    location: string,
    actionLabel = "",
    action: Action | null = null,
    dialog?: TaskView["dialog"],
  ): TaskView => ({
    title: t(title),
    description: t(description),
    location: t(location),
    actionLabel: t(actionLabel),
    action,
    dialog,
  });
  switch (v.stage) {
    case 0:
      return task("暂无就医安排", "请家人添加本次就医安排。", "");
    case 1:
      return task("今天去看医生", "带好身份证、医保凭证和已有病历。", a.hospital, "我到医院了", {
        type: "arrive",
      });
    case 2:
      return v.registered
        ? task("请等待叫号", "请在诊区附近休息，留意现场叫号。", a.location, "轮到我了", {
            type: "consult",
          })
        : task("请到诊区报到", "请按诊区指引完成报到。", a.location, "我已报到", {
            type: "checkin",
          });
    case 3:
      return task(
        "正在就诊",
        "就诊后，请拍下医生开具的单据。",
        a.location,
        "我看完医生了",
        null,
        "afterConsult",
      );
    case 4: {
      const t = v.tests.find((t) => !t.report);
      if (!t)
        return task("报告已齐全", "请带齐报告返回诊室。", a.location, "去找医生看报告", {
          type: "returnDoctor",
        });
      if (!t.paid)
        return task("请先缴检查费", t.name, t.location, "确认已缴费", {
          type: "testPay",
          id: t.id,
        });
      if (!t.done)
        return task("请前往检查", t.name, t.location, "我已完成检查", {
          type: "testDone",
          id: t.id,
        });
      return task("等待检查报告", t.name, t.location, "报告已拿到", {
        type: "reportReceived",
        id: t.id,
      });
    }
    case 5:
      return task(
        "带报告再看医生",
        "请将检查报告交给医生。",
        a.location,
        "医生已看过报告",
        null,
        "reviewReport",
      );
    case 6:
      return v.medPaid
        ? task("请到药房取药", "取药后，请拍下处方或有用法的药袋。", a.pharmacy, "我已取到药", {
            type: "collectMedicine",
          })
        : task("请先缴药费", "缴费后，请到药房取药。", a.pharmacy, "确认已缴费", {
            type: "medPay",
          });
    default:
      return task(
        "本次就医已完成",
        s.medications.length ? "用药信息已保存。" : "可查看本次就医记录。",
        "",
      );
  }
}
export function nextDose(s: AppState, now = new Date()): Dose | undefined {
  return s.doses
    .filter(
      (d) =>
        d.status === "pending" &&
        d.scheduledAt.slice(0, 10) >= localDate(now) &&
        s.medications.some((m) => m.id === d.medicationId && m.active),
    )
    .sort(
      (a, b) =>
        new Date(a.snoozedUntil || a.scheduledAt).getTime() -
        new Date(b.snoozedUntil || b.scheduledAt).getTime(),
    )[0];
}
