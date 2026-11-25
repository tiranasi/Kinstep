"use client";
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ModelSettings } from "@/lib/types";
import { api } from "./companion";
import { useCompanion } from "./context";
import { LanguageSelect, useLanguage } from "./language";
import { Button, Field } from "./ui";

export function SettingsPanel() {
  const { t } = useLanguage();
  const {
    data: { role, state, caseMode },
    act,
    toast,
    busy,
    refresh,
    previewReminder,
  } = useCompanion();
  const [switching, setSwitching] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [patient, setPatient] = useState(state.visit.appointment.patient);
  const [childName, setChildName] = useState(state.childName || "");

  async function changeMode(enabled: boolean) {
    setModeBusy(true);
    try {
      await api("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mode", caseMode: enabled }),
      });
      refresh();
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setModeBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <Field label={t("语言")}>
        <LanguageSelect />
      </Field>
      {role === "child" && (
        <>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ type: "profile", patient, childName })) toast("已保存姓名");
            }}
          >
            <p className="section-title">{t("姓名")}</p>
            <Field label={t("长辈称呼")}>
              <input value={patient} onChange={(e) => setPatient(e.target.value)} />
            </Field>
            <Field label={t("子女称呼")}>
              <input value={childName} onChange={(e) => setChildName(e.target.value)} />
            </Field>
            <Button
              secondary
              type="submit"
              busy={busy}
              disabled={
                patient === state.visit.appointment.patient && childName === (state.childName || "")
              }
            >
              {t("保存姓名")}
            </Button>
          </form>
          <label className="card case-switch">
            <div>
              <strong>{t("案例模式")}</strong>
              <small>{t("切换预约、检查、缴费、报告和用药记录。")}</small>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={caseMode}
              disabled={modeBusy}
              onChange={(e) => void changeMode(e.target.checked)}
            />
          </label>
          {caseMode && (
            <Button
              secondary
              busy={busy}
              onClick={async () => {
                if (await act({ type: "reset", scenario: "start" })) toast("已重置案例");
              }}
            >
              {t("重置案例")}
            </Button>
          )}
          <ModelSettingsPanel />
        </>
      )}
      {state.undo && (
        <Button
          secondary
          busy={busy}
          onClick={async () => {
            if (await act({ type: "undo" })) toast("已撤销最近一步");
          }}
        >
          <RotateCcw size={19} />
          {t("撤销最近一步")}
        </Button>
      )}
      {caseMode && (
        <Button secondary onClick={previewReminder}>
          {t("预览服药提醒")}
        </Button>
      )}
      <Button
        secondary
        busy={switching}
        onClick={async () => {
          setSwitching(true);
          try {
            await api("/api/session", { method: "DELETE" });
            window.location.reload();
          } catch (error) {
            toast((error as Error).message);
            setSwitching(false);
          }
        }}
      >
        {t("切换身份")}
      </Button>
    </div>
  );
}

function ModelSettingsPanel() {
  const { t } = useLanguage();
  const { refresh, toast } = useCompanion();
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [url, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load(signal?: AbortSignal) {
    return api<ModelSettings>("/api/settings", { signal }).then((saved) => {
      setSettings(saved);
      setUrl(saved.url);
      setModel(saved.model);
    });
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((err) => {
      if (err.name !== "AbortError") setError(err.message);
    });
    return () => controller.abort();
  }, []);

  return (
    <>
      <details className="disclosure-details" open>
        <summary>{t("AI 模型")}</summary>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError("");
            try {
              await api("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "model", url, model, key, clearKey }),
              });
              setKey("");
              setClearKey(false);
              refresh();
              await load();
              toast("已保存模型设置");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Field label={t("请求 URL")}>
            <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label={t("请求模型名")}>
            <input required value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              autoComplete="new-password"
              disabled={clearKey}
              value={key}
              placeholder={
                settings?.hasKey && url === settings.url ? t("留空保留已保存的密钥") : undefined
              }
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          {settings?.hasKey && (
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
              />
              {t("移除已保存的密钥")}
            </label>
          )}
          <Button secondary type="submit" busy={saving} disabled={!settings}>
            {t("保存模型设置")}
          </Button>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
        </form>
      </details>
      <details className="disclosure-details">
        <summary>{t("局域网访问")}</summary>
        <p className="field-help">{t("在同一网络的手机上打开以下地址。")}</p>
        {settings?.lanUrls.length ? (
          settings.lanUrls.map((address) => (
            <a className="lan-address" key={address} href={address}>
              {address}
            </a>
          ))
        ) : (
          <p>{t("暂未找到局域网地址。")}</p>
        )}
      </details>
    </>
  );
}
