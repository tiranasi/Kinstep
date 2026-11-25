import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { extractImage, chat } from "../../src/lib/assistant";
import { seedState } from "../../src/lib/domain";
import { emptyExtraction } from "../../src/lib/types";
import { getTask } from "../../src/lib/presentation";

async function main() {
  const folder = path.resolve("evaluations/prompt-audit-20261028");
  mkdirSync(folder, { recursive: true });
  const captured: unknown[] = [];
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "local-capture-placeholder";
  // Capture actual outbound messages locally. No provider is contacted.
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    captured.push(request);
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify(
              captured.length === 1
                ? emptyExtraction()
                : { reply: "本地捕获占位回复", action: null },
            ),
          },
        },
      ],
    });
  };
  try {
    await extractImage(Buffer.from("synthetic-image-placeholder"), "image/jpeg");
    const extractionRequest = captured[0];
    const at = new Date("2026-10-28T04:00:00Z");
    const start = seedState("start", at);
    const arrived = structuredClone(start);
    arrived.visit.stage = 2;
    const checkedIn = structuredClone(arrived);
    checkedIn.visit.registered = true;
    const consulting = structuredClone(checkedIn);
    consulting.visit.stage = 3;
    const testing = seedState("tests", at);
    const pharmacy = structuredClone(testing);
    pharmacy.visit.stage = 6;
    pharmacy.visit.needsMedicine = true;
    const pharmacyPaid = structuredClone(pharmacy);
    pharmacyPaid.visit.medPaid = true;
    const medication = seedState("medication", at);
    const fixtures = {
      start,
      arrived,
      checkedIn,
      consulting,
      testing,
      pharmacy,
      pharmacyPaid,
      medication,
    };
    const requests: Record<string, unknown> = {};
    for (const [name, state] of Object.entries(fixtures)) {
      await chat("{{USER_MESSAGE}}", state, "elder");
      requests[name] = captured.at(-1);
    }
    const sources: Record<string, { sha256: string; content: string }> = {};
    for (const filename of [
      "src/lib/assistant.ts",
      "src/lib/schema.ts",
      "src/lib/domain.ts",
      "src/lib/presentation.ts",
      "src/components/documents.tsx",
      "src/components/voice.tsx",
      "src/app/api/state/route.ts",
    ]) {
      const content = readFileSync(filename, "utf8");
      sources[filename] = { sha256: createHash("sha256").update(content).digest("hex"), content };
    }
    const packet = {
      capturedAt: new Date().toISOString(),
      captureMethod: "Actual application functions with local fetch replacement; no model API call",
      fixtureClock: at.toISOString(),
      extractionRequest,
      chatRequests: requests,
      fixtures,
      taskViews: Object.fromEntries(
        Object.entries(fixtures).map(([key, state]) => [key, getTask(state)]),
      ),
      sources,
    };
    writeFileSync(path.join(folder, "inputs.json"), JSON.stringify(packet, null, 2) + "\n", "utf8");
    console.log(
      "Captured two prompt types and eight synthetic state fixtures; no external API called.",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
