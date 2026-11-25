export type Role = "elder" | "child";
export type Locale = "zh" | "en";
export type DocKind =
  "appointment" | "test_order" | "payment" | "report" | "prescription" | "receipt" | "other";
export const DOC_NAMES: Record<DocKind, string> = {
  appointment: "预约凭证",
  test_order: "检查申请单",
  payment: "缴费单",
  report: "检验报告",
  prescription: "处方 / 药袋",
  receipt: "报告回执",
  other: "其他单据",
};
export const STAGES = [
  "未安排",
  "待到院",
  "报到候诊",
  "医生接诊",
  "检查检验",
  "带报告再接诊",
  "缴费取药",
  "就医完成",
];
export interface Appointment {
  hospital: string;
  department: string;
  doctor: string;
  date: string;
  time: string;
  location: string;
  pharmacy: string;
  patient: string;
}
export interface TestTask {
  id: string;
  name: string;
  location: string;
  paid: boolean;
  done: boolean;
  report: boolean;
  source: string;
}
export interface ExtractedMedicine {
  name: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  instructions: string;
}
export interface Extraction {
  kind: DocKind;
  title: string;
  summary: string;
  tests: { name: string; location: string }[];
  medicines: ExtractedMedicine[];
  targetName: string;
  paymentFor: "test" | "medicine" | "unknown";
  hospital: string;
  department: string;
  date: string;
  time: string;
  location: string;
  notes: string;
  patient?: string;
  doctor?: string;
  pharmacy?: string;
  paymentStatus?: "paid" | "unpaid" | "unknown";
}
export interface DocumentRecord {
  id: string;
  fingerprint: string;
  filename: string;
  url: string;
  createdAt: string;
  provider: "deepseek" | "sample" | "manual";
  extraction: Extraction;
  confirmedAt: string | null;
  applied: boolean;
}
export interface Medication extends ExtractedMedicine {
  id: string;
  times: string[];
  startDate: string;
  endDate: string;
  source: string;
  sourceDocId?: string;
  active: boolean;
  reviewed: boolean;
}
export interface Dose {
  id: string;
  medicationId: string;
  scheduledAt: string;
  status: "pending" | "taken" | "skipped";
  confirmedAt: string | null;
  snoozedUntil: string | null;
  source?: string;
}
export interface TimelineItem {
  id: string;
  at: string;
  label: string;
  source: string;
  stage: number;
}
export interface AppState {
  childName?: string;
  revision: number;
  updatedAt: string;
  visit: {
    stage: number;
    appointment: Appointment;
    registered: boolean;
    needsMedicine: boolean;
    medPaid: boolean;
    pickedUp: boolean;
    tests: TestTask[];
  };
  documents: DocumentRecord[];
  medications: Medication[];
  doses: Dose[];
  help: { id: string; note: string; at: string } | null;
  timeline: TimelineItem[];
  undo: { label: string; snapshot: string } | null;
}
export interface AppPayload {
  role: Role;
  state: AppState;
  aiConfigured: boolean;
  caseMode: boolean;
  modeVersion: number;
}
export interface ModelSettings {
  url: string;
  model: string;
  hasKey: boolean;
  lanUrls: string[];
}
export function localDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function clockTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function scheduledISO(date: string, time: string) {
  return `${date}T${time}:00+08:00`;
}
export function emptyExtraction(kind: DocKind = "other"): Extraction {
  return {
    kind,
    title: DOC_NAMES[kind],
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
    notes: "",
  };
}
