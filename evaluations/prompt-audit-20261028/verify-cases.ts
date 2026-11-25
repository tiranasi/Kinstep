import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { extractionSchema, actionSchema } from "../../src/lib/schema";
import { applyAction } from "../../src/lib/domain";
import type { AppState, DocumentRecord } from "../../src/lib/types";

const folder = path.resolve("evaluations/prompt-audit-20261028");
const inputFile = process.argv[2];
if (!inputFile) throw new Error("Usage: tsx verify-cases.ts <terra-cases.json>");
const packet = JSON.parse(readFileSync(path.join(folder, "inputs.json"), "utf8"));
const input = JSON.parse(readFileSync(inputFile, "utf8"));
const cases = Array.isArray(input) ? input : input.cases;
if (!Array.isArray(cases)) throw new Error("Expected an array or { cases: [] }");
const replySchema = z.object({
  reply: z.string().min(1).max(1500),
  action: z.unknown().nullable().optional(),
});
const allowed = ["arrive", "checkin", "consult", "collectMedicine", "help", "doseTaken"];
const results = cases.map((testCase: Record<string, any>) => {
  let output = testCase.modelOutput;
  if (typeof output === "string") {
    try {
      output = JSON.parse(output);
    } catch {
      return { id: testCase.id, mode: testCase.mode, jsonValid: false };
    }
  }
  if (testCase.mode === "extraction") {
    const parsed = extractionSchema.safeParse(output);
    const confirmations = parsed.success
      ? Object.entries(packet.fixtures).map(([fixtureId, fixture]) => {
          const before = structuredClone(fixture) as AppState;
          const document: DocumentRecord = {
            id: `evaluation-${testCase.id}`,
            fingerprint: `evaluation-${testCase.id}`,
            filename: "synthetic-document",
            url: "",
            createdAt: packet.fixtureClock,
            provider: "manual",
            extraction: parsed.data,
            confirmedAt: null,
            applied: false,
          };
          before.documents.push(document);
          try {
            const after = applyAction(
              before,
              { type: "confirmDocument", id: document.id },
              testCase.role || "elder",
              new Date(packet.fixtureClock),
            );
            return {
              fixtureId,
              accepted: true,
              previousStage: before.visit.stage,
              nextStage: after.visit.stage,
              medPaidBefore: before.visit.medPaid,
              medPaidAfter: after.visit.medPaid,
              testsBefore: before.visit.tests.length,
              testsAfter: after.visit.tests.length,
              medicinesBefore: before.medications.length,
              medicinesAfter: after.medications.length,
              documentApplied: after.documents.find((d) => d.id === document.id)?.applied,
            };
          } catch (error) {
            return { fixtureId, accepted: false, reason: (error as Error).message };
          }
        })
      : [];
    return {
      id: testCase.id,
      mode: testCase.mode,
      jsonValid: true,
      schemaValid: parsed.success,
      simulatedDocumentConfirmations: confirmations,
      issues: parsed.success ? [] : parsed.error.issues,
      ui: parsed.success
        ? {
            title: parsed.data.title,
            tests: parsed.data.tests,
            medicines: parsed.data.medicines,
            summary: parsed.data.summary,
            awaitingConfirmation: true,
          }
        : null,
    };
  }
  if (testCase.mode !== "chat") return { id: testCase.id, error: "Unknown mode" };
  const parsed = replySchema.safeParse(output);
  if (!parsed.success)
    return {
      id: testCase.id,
      mode: testCase.mode,
      jsonValid: true,
      schemaValid: false,
      issues: parsed.error.issues,
    };
  const action = actionSchema.safeParse(parsed.data.action);
  const surfaced = action.success && allowed.includes(action.data.type) ? action.data : null;
  let result: unknown = null;
  if (surfaced && packet.fixtures[testCase.fixtureId]) {
    try {
      const before = packet.fixtures[testCase.fixtureId];
      const after = applyAction(
        before,
        surfaced,
        testCase.role || "elder",
        new Date(packet.fixtureClock),
      );
      result = { accepted: true, previousStage: before.visit.stage, nextStage: after.visit.stage };
    } catch (error) {
      result = { accepted: false, reason: (error as Error).message };
    }
  }
  return {
    id: testCase.id,
    mode: testCase.mode,
    jsonValid: true,
    schemaValid: true,
    replyLength: Array.from(parsed.data.reply).length,
    withinPrompt100Characters: Array.from(parsed.data.reply).length <= 100,
    ui: { reply: parsed.data.reply, confirmationButtonShown: !!surfaced },
    surfacedAction: surfaced,
    simulatedConfirmation: result,
  };
});
writeFileSync(
  path.join(folder, "validator-results.json"),
  JSON.stringify(results, null, 2) + "\n",
  "utf8",
);
const longReply = { reply: "字".repeat(101), action: null };
const discardedAction = { reply: "请点击确认。", action: { type: "reset", scenario: "start" } };
const actionProbe = actionSchema.safeParse(discardedAction.action);
const probes = {
  evidenceType: "Constructed contract probes; not model outputs",
  longReply: {
    replyLength: 101,
    exceedsPromptLimit: true,
    acceptedByCurrentReplySchema: replySchema.safeParse(longReply).success,
  },
  actionReplyConsistency: {
    acceptedByCurrentReplySchema: replySchema.safeParse(discardedAction).success,
    confirmationButtonShown: actionProbe.success && allowed.includes(actionProbe.data.type),
    displayedReply: discardedAction.reply,
  },
};
writeFileSync(
  path.join(folder, "contract-probes.json"),
  JSON.stringify(probes, null, 2) + "\n",
  "utf8",
);
console.log(
  JSON.stringify(
    {
      cases: results.length,
      schemaRejected: results.filter((r) => r.schemaValid === false).length,
      jsonRejected: results.filter((r) => r.jsonValid === false).length,
      confirmationRejected: results.filter(
        (r) => (r.simulatedConfirmation as any)?.accepted === false,
      ).length,
    },
    null,
    2,
  ),
);
