import { emptyExtraction } from "./types";
import type { DocKind, Extraction } from "./types";
export function sampleExtraction(kind: DocKind): Extraction {
  const e = emptyExtraction(kind);
  if (kind === "test_order") {
    e.summary = "有一项血常规检查，地点在门诊楼2层检验科。";
    e.tests = [{ name: "血常规", location: "门诊楼 2 层 · 检验科" }];
  }
  if (kind === "report") {
    e.summary = "这是一份血常规报告。";
    e.targetName = "血常规";
    e.notes = "白细胞 6.2 × 10⁹/L；血红蛋白 132 g/L；血小板 240 × 10⁹/L。";
  }
  if (kind === "prescription") {
    e.summary = "识别到药品 A，待家人核对用法。";
    e.medicines = [
      {
        name: "药品 A",
        strength: "10 mg / 片",
        dose: "每次 1 片",
        route: "口服",
        frequency: "每日 2 次",
        instructions: "餐后服用",
      },
    ];
  }
  if (kind === "receipt") {
    e.summary = "这是报告领取回执，可保存领取信息。";
    e.targetName = "血常规";
    e.location = "门诊楼 2 层 · 报告自助机";
    e.notes = "报告领取时间以回执为准。";
  }
  if (kind === "payment") {
    e.summary = "血常规检查费 ¥35.00";
    e.paymentFor = "test";
    e.targetName = "血常规";
    e.paymentStatus = "unpaid";
    e.notes = "药品费用 ¥28.00";
  }
  return e;
}

export const caseKinds = ["test_order", "payment", "receipt", "report", "prescription"] as const;
export const caseMaterials = caseKinds.map(sampleExtraction);
