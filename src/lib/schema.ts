import { z } from "zod";
const text = z.string().trim().max(500, "内容最多500字。");
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为YYYY-MM-DD。")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "日期无效");
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "提醒时间请使用24小时格式，如08:00。");
export const medicineFields = z.object({
  name: text.min(1, "请填写药品名称。"),
  strength: text,
  dose: text,
  route: text,
  frequency: text,
  instructions: text,
});
export const extractionSchema = z.object({
  kind: z.enum([
    "appointment",
    "test_order",
    "payment",
    "report",
    "prescription",
    "receipt",
    "other",
  ]),
  title: text,
  summary: text,
  tests: z
    .array(z.object({ name: text.min(1, "请填写检查名称。"), location: text }))
    .max(8, "最多添加8项检查。"),
  medicines: z.array(medicineFields).max(8),
  targetName: text,
  paymentFor: z.enum(["test", "medicine", "unknown"]),
  hospital: text,
  department: text,
  date: text,
  time: text,
  location: text,
  notes: text,
  patient: text.optional(),
  doctor: text.optional(),
  pharmacy: text.optional(),
  paymentStatus: z.enum(["paid", "unpaid", "unknown"]).optional(),
});
export const appointmentDraftSchema = z.object({
  hospital: text,
  department: text,
  doctor: text,
  date: z.union([dateSchema, z.literal("")]),
  time: text,
  location: text,
  pharmacy: text,
  patient: text,
});
export const appointmentSchema = z.object({
  hospital: text.min(1, "请填写医院名称。"),
  department: text.min(1, "请填写就诊科室。"),
  doctor: text,
  date: dateSchema,
  time: text.min(1, "请填写预约时段。"),
  location: text,
  pharmacy: text,
  patient: text.min(1, "请填写长辈称呼。"),
});
export const medicationSchema = medicineFields
  .extend({
    id: z.string().optional(),
    times: z.array(timeSchema).min(1, "请至少设置一个提醒时间。").max(6, "最多设置6个提醒时间。"),
    startDate: dateSchema,
    endDate: dateSchema,
    source: text.min(1, "请填写用法来源。"),
    sourceDocId: z.string().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, "提醒结束日期不能早于开始日期")
  .refine(
    (v) => new Date(v.endDate).getTime() - new Date(v.startDate).getTime() <= 90 * 86400000,
    "一次最多设置90天提醒",
  )
  .refine((v) => new Set(v.times).size === v.times.length, "提醒时间重复");
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("profile"), patient: text, childName: text }),
  z.object({ type: z.literal("appointment"), appointment: appointmentSchema }),
  z.object({ type: z.literal("arrive") }),
  z.object({ type: z.literal("checkin") }),
  z.object({ type: z.literal("consult") }),
  z.object({
    type: z.literal("afterConsult"),
    tests: z
      .array(z.object({ name: text.min(1, "请填写检查名称。"), location: text }))
      .max(8, "最多添加8项检查。"),
    needsMedicine: z.boolean(),
  }),
  z.object({ type: z.literal("testPay"), id: z.string() }),
  z.object({ type: z.literal("testDone"), id: z.string() }),
  z.object({ type: z.literal("reportReceived"), id: z.string() }),
  z.object({ type: z.literal("returnDoctor") }),
  z.object({ type: z.literal("reviewReport"), needsMedicine: z.boolean() }),
  z.object({ type: z.literal("medPay") }),
  z.object({ type: z.literal("collectMedicine") }),
  z.object({ type: z.literal("help"), note: text }),
  z.object({ type: z.literal("resolveHelp") }),
  z.object({
    type: z.literal("confirmDocument"),
    id: z.string(),
    extraction: extractionSchema.optional(),
  }),
  z.object({ type: z.literal("saveMedication"), medication: medicationSchema }),
  z.object({ type: z.literal("enableMedication"), id: z.string() }),
  z.object({ type: z.literal("doseTaken"), id: z.string() }),
  z.object({ type: z.literal("doseSkip"), id: z.string() }),
  z.object({ type: z.literal("doseSnooze"), id: z.string() }),
  z.object({ type: z.literal("undo") }),
  z.object({
    type: z.literal("reset"),
    scenario: z.enum(["start", "empty", "tests", "medication"]),
  }),
]);
export type Action = z.infer<typeof actionSchema>;
