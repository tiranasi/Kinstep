"use client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Heart,
  HeartHandshake,
  LoaderCircle,
  UsersRound,
  X,
} from "lucide-react";
import type { AppPayload, Appointment, Role } from "@/lib/types";
import type { Action } from "@/lib/schema";
import { Context, type Panel, type SheetName } from "./context";
import { ChildHome, ElderHome } from "./home";
import { StandardPanels } from "./panels";
import { DocumentSheet } from "./documents";
import { VoiceSheet } from "./voice";
import { Button, speak } from "./ui";
import { nextDose } from "@/lib/presentation";
import { PRODUCT_NAME } from "@/lib/brand";
import { LanguageProvider, LanguageSelect, useLanguage } from "./language";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "操作未完成，请重试。");
  return data;
}
export function Companion() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <Workspace />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
function Workspace() {
  const { locale, t } = useLanguage();
  const client = useQueryClient(),
    [panel, setPanel] = useState<Panel | null>(null),
    [message, setMessage] = useState(""),
    [loginBusy, setLoginBusy] = useState<Role | null>(null),
    [loadingError, setLoadingError] = useState(""),
    [draft, setDraft] = useState<{ value: Partial<Appointment>; modeVersion: number } | null>(null);
  const announced = useRef(new Set<string>()),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = useQuery<AppPayload | null>({
    queryKey: ["family"],
    queryFn: async ({ signal }) => {
      if (!client.getQueryData(["family"])) {
        const session = await fetch("/api/session", { signal }).then((r) => r.json());
        if (!session.role) return null;
      }
      const res = await fetch("/api/state", { signal });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(t("暂时无法连接，请重试。"));
      return res.json();
    },
    refetchInterval: (q) => (q.state.data ? 2000 : false),
  });
  const mutation = useMutation({
    mutationFn: async ({ action, revision }: { action: Action; revision?: number }) => {
      await client.cancelQueries({ queryKey: ["family"] });
      const state = client.getQueryData<AppPayload>(["family"])!.state;
      return api<AppPayload>("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revision ?? state.revision, action }),
      });
    },
    onSuccess: (data) => client.setQueryData(["family"], data),
    onError: () => {
      void client.invalidateQueries({ queryKey: ["family"] });
    },
  });
  function toast(text: string) {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(""), 4500);
  }
  async function act(a: Action, revision?: number) {
    if (mutation.isPending) return false;
    try {
      await mutation.mutateAsync({ action: a, revision });
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    }
  }
  function open(name: SheetName, id?: string) {
    setPanel({ name, id, modeVersion: query.data?.modeVersion });
  }
  async function login(role: Role) {
    setLoginBusy(role);
    setLoadingError("");
    try {
      await api("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await client.invalidateQueries({ queryKey: ["family"] });
    } catch (e) {
      setLoadingError((e as Error).message);
    } finally {
      setLoginBusy(null);
    }
  }
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!query.data || query.data.role !== "elder") return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const s = client.getQueryData<AppPayload>(["family"])?.state;
      if (!s || s.visit.stage !== 7) return;
      const d = nextDose(s);
      if (d && new Date(d.snoozedUntil || d.scheduledAt) <= new Date()) {
        const key = d.id + (d.snoozedUntil || "");
        if (!announced.current.has(key)) {
          announced.current.add(key);
          toast(t("该服药了，请查看用法。"));
          speak(t("该服药了，请查看本次的服药安排。"), locale);
        }
      }
    };
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [query.data?.role, query.data?.state.revision, client, locale]);
  const data = query.data;
  const activePanel = panel?.modeVersion === data?.modeVersion ? panel : null;
  if (query.isPending)
    return (
      <main className="loading">
        <span className="brand-mark">
          <Heart size={26} />
        </span>
        <LoaderCircle className="spin" />
        <p>{t("正在加载就医安排")}</p>
      </main>
    );
  if (query.isError && !data)
    return (
      <main className="loading">
        <HeartHandshake size={40} />
        <p>{t(query.error.message)}</p>
        <Button onClick={() => query.refetch()}>{t("重新连接")}</Button>
      </main>
    );
  if (!data)
    return (
      <main className="login-page">
        <div className="login-top">
          <span className="brand-mark">
            <Heart size={25} />
          </span>
          <span>{locale === "en" ? "KinStep" : PRODUCT_NAME}</span>
          <LanguageSelect />
        </div>
        <div className="login-content">
          <div className="login-symbol">
            <HeartHandshake strokeWidth={1.3} size={58} />
          </div>
          <h1>{t("选择身份")}</h1>
          <p className="login-intro">{t("查看就医安排与进度")}</p>
          <div className="role-options">
            <button
              disabled={!!loginBusy}
              className="role-card elder-role"
              onClick={() => login("elder")}
            >
              <span className="role-icon">
                <HeartHandshake size={28} />
              </span>
              <span>
                <strong>{t("我是长辈")}</strong>
                <small>{t("大字指引，查看当前任务")}</small>
              </span>
              {loginBusy === "elder" ? <LoaderCircle className="spin" /> : <ArrowRight size={22} />}
            </button>
            <button disabled={!!loginBusy} className="role-card" onClick={() => login("child")}>
              <span className="role-icon">
                <UsersRound size={27} />
              </span>
              <span>
                <strong>{t("我是子女")}</strong>
                <small>{t("管理就医与用药安排")}</small>
              </span>
              {loginBusy === "child" ? <LoaderCircle className="spin" /> : <ArrowRight size={22} />}
            </button>
          </div>
          {loadingError && (
            <p className="form-error" role="alert">
              {t(loadingError)}
            </p>
          )}
        </div>
      </main>
    );
  return (
    <Context.Provider
      value={{
        data,
        busy: mutation.isPending,
        act,
        appointmentDraft: draft?.modeVersion === data.modeVersion ? draft.value : null,
        setAppointmentDraft: (value) =>
          setDraft(value ? { value, modeVersion: data.modeVersion } : null),
        open,
        close: () => setPanel(null),
        toast,
        refresh: () => {
          void client.invalidateQueries({ queryKey: ["family"] });
        },
        previewReminder: () => {
          speak(t("这是一次提醒预览。该服药了。"), locale);
          toast(t("服药提醒预览"));
        },
      }}
    >
      <div className={`app-shell ${data.role === "elder" ? "elder" : "child"}`}>
        {data.role === "elder" ? <ElderHome /> : <ChildHome />}
        {query.isError && (
          <div className="offline" role="status">
            {t("连接中断，当前内容可能未更新。")}
            <button onClick={() => query.refetch()}>{t("重试")}</button>
          </div>
        )}
        {activePanel?.name === "upload" ? (
          <DocumentSheet
            key={activePanel.name + (activePanel.id || "")}
            onClose={() => setPanel(null)}
            documentId={activePanel.id}
          />
        ) : activePanel?.name === "voice" || activePanel?.name === "appointmentVoice" ? (
          <VoiceSheet
            key={activePanel.name}
            appointmentMode={activePanel.name === "appointmentVoice"}
            onClose={() => setPanel(null)}
          />
        ) : activePanel ? (
          <StandardPanels
            key={activePanel.name + (activePanel.id || "")}
            panel={activePanel}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {message && (
          <div className="toast" role="status">
            <Check size={19} />
            <span>{t(message)}</span>
            <button onClick={() => setMessage("")} aria-label={t("关闭提示")}>
              <X size={17} />
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
