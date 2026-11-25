"use client";
import { createContext, useContext } from "react";
import type { AppPayload, Appointment } from "@/lib/types";
import type { Action } from "@/lib/schema";
export type SheetName =
  | "settings"
  | "appointment"
  | "timeline"
  | "upload"
  | "voice"
  | "appointmentVoice"
  | "afterConsult"
  | "reviewReport"
  | "help"
  | "medication"
  | "dose"
  | "summary";
export interface Panel {
  name: SheetName;
  id?: string;
  modeVersion?: number;
}
export interface CompanionContext {
  data: AppPayload;
  busy: boolean;
  act: (action: Action, revision?: number) => Promise<boolean>;
  appointmentDraft: Partial<Appointment> | null;
  setAppointmentDraft: (draft: Partial<Appointment> | null) => void;
  open: (name: SheetName, id?: string) => void;
  close: () => void;
  toast: (message: string) => void;
  refresh: () => void;
  previewReminder: () => void;
}
export const Context = createContext<CompanionContext | null>(null);
export function useCompanion() {
  const value = useContext(Context);
  if (!value) throw new Error("Companion context missing");
  return value;
}
