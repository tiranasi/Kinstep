import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AppError, applyAction, seedState } from "./domain";
import type { Action } from "./schema";
import type { AppState, Role, DocumentRecord } from "./types";
import { modelEndpoint, type ModelConfig } from "./model-config";

type Preferences = { caseMode: boolean; modeVersion: number; model?: ModelConfig };

export const dataDir = process.env.APP_DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | undefined;
function database() {
  if (db) return db;
  mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, "companion.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspaces (mode TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, expires INTEGER NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO workspaces(mode,value) VALUES('live',?)").run(
    JSON.stringify(seedState("empty")),
  );
  db.prepare("INSERT OR IGNORE INTO preferences(id,value) VALUES(1,?)").run(
    JSON.stringify({ caseMode: false, modeVersion: 0 }),
  );
  return db;
}
function preferences(): Preferences {
  return JSON.parse(
    database().prepare("SELECT value FROM preferences WHERE id=1").get()!.value as string,
  );
}
export function getMode() {
  const { caseMode, modeVersion } = preferences();
  return { caseMode, modeVersion };
}
export function getModelConfig(): ModelConfig {
  const key = process.env.DEEPSEEK_API_KEY || "";
  return (
    preferences().model ?? {
      url: process.env.DEEPSEEK_BASE_URL || (key ? "https://api.deepseek.com" : ""),
      model: process.env.DEEPSEEK_MODEL || (key ? "deepseek-flash" : ""),
      key,
    }
  );
}
function setPreferences(value: Preferences) {
  database().prepare("UPDATE preferences SET value=? WHERE id=1").run(JSON.stringify(value));
}
export function saveModel(config: {
  url: string;
  model: string;
  key?: string;
  clearKey?: boolean;
}) {
  transaction(() => {
    const previous = getModelConfig();
    let sameEndpoint = false;
    if (previous.key) {
      try {
        sameEndpoint = modelEndpoint(previous.url) === modelEndpoint(config.url);
      } catch {
        // An invalid previous URL cannot retain a credential.
      }
    }
    const key = config.clearKey ? "" : config.key || (sameEndpoint ? previous.key : "");
    setPreferences({ ...preferences(), model: { url: config.url, model: config.model, key } });
  });
}
function readWorkspace(mode: "case" | "live"): AppState | undefined {
  const row = database().prepare("SELECT value FROM workspaces WHERE mode=?").get(mode);
  return row && JSON.parse(row.value as string);
}
function writeWorkspace(mode: "case" | "live", value: AppState) {
  database()
    .prepare(
      "INSERT INTO workspaces(mode,value) VALUES(?,?) ON CONFLICT(mode) DO UPDATE SET value=excluded.value",
    )
    .run(mode, JSON.stringify(value));
}
export function getState(): AppState {
  return readWorkspace(getMode().caseMode ? "case" : "live")!;
}
function transaction<T>(update: () => T): T {
  const d = database();
  d.exec("BEGIN IMMEDIATE");
  try {
    const next = update();
    d.exec("COMMIT");
    return next;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function switchMode(caseMode: boolean) {
  transaction(() => {
    const current = preferences();
    if (caseMode === current.caseMode) return;
    const mode = caseMode ? "case" : "live";
    const next = readWorkspace(mode) ?? seedState("start");
    next.revision = Math.max(next.revision, getState().revision) + 1;
    writeWorkspace(mode, next);
    setPreferences({ ...current, caseMode, modeVersion: current.modeVersion + 1 });
  });
}
export function transact(update: (state: AppState) => AppState): AppState {
  return transaction(() => {
    const mode = getMode().caseMode ? "case" : "live";
    const current = readWorkspace(mode)!;
    const next = update(current);
    if (next !== current) writeWorkspace(mode, next);
    return next;
  });
}
export function mutate(a: Action, role: Role, revision: number) {
  return transact((s) => {
    if (s.revision !== revision)
      throw new AppError("家人刚刚更新了安排，请查看最新内容后再操作。", 409);
    if (a.type === "reset" && !getMode().caseMode) throw new AppError("请先开启案例模式。", 403);
    return applyAction(s, a, role);
  });
}
export function addDocument(doc: DocumentRecord, modeVersion: number) {
  return transact((s) => {
    if (getMode().modeVersion !== modeVersion)
      throw new AppError("案例模式已切换，请重新操作。", 409);
    if (s.documents.some((d) => d.fingerprint === doc.fingerprint)) return s;
    const next = structuredClone(s);
    next.documents.unshift(doc);
    next.undo = { label: "保存单据", snapshot: JSON.stringify({ ...s, undo: null }) };
    next.revision++;
    next.updatedAt = new Date().toISOString();
    return next;
  });
}
export function createSession(role: Role) {
  const token = randomBytes(32).toString("hex"),
    d = database();
  d.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  d.prepare("INSERT INTO sessions(token,role,expires) VALUES(?,?,?)").run(
    token,
    role,
    Date.now() + 7 * 86400000,
  );
  return token;
}
export function sessionRole(token: string): Role | null {
  const row = database()
    .prepare("SELECT role FROM sessions WHERE token=? AND expires>?")
    .get(token, Date.now());
  return (row?.role as Role) || null;
}
export function deleteSession(token: string) {
  database().prepare("DELETE FROM sessions WHERE token=?").run(token);
}
