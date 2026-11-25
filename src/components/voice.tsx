"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Volume2 } from "lucide-react";
import { useCompanion } from "./context";
import { Button, Sheet, speak } from "./ui";
import { api } from "./companion";
import type { Action } from "@/lib/schema";
import type { Appointment } from "@/lib/types";
import { useLanguage } from "./language";
interface RecognitionResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface RecognitionEvent {
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function VoiceSheet({
  onClose,
  appointmentMode = false,
}: {
  onClose: () => void;
  appointmentMode?: boolean;
}) {
  const { locale, t } = useLanguage();
  const {
      data: { role, modeVersion },
      busy,
      act,
      toast,
      open,
      appointmentDraft,
      setAppointmentDraft,
    } = useCompanion(),
    [phase, setPhase] = useState("idle"),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [supported, setSupported] = useState(false),
    [answer, setAnswer] = useState<{
      reply: string;
      action: Action | null;
      provider: string;
      revision: number;
    } | null>(null);
  const recognition = useRef<Recognition | null>(null),
    transcript = useRef(""),
    alive = useRef(true),
    sendOnEnd = useRef(false),
    sending = useRef(false),
    request = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function ask(value: string) {
    if (sending.current) return;
    if (!value.trim()) {
      setPhase("idle");
      setError(t("没有识别到文字，请重试或输入文字。"));
      return;
    }
    sending.current = true;
    setPhase("processing");
    setError("");
    request.current = new AbortController();
    try {
      if (appointmentMode) {
        const result = await api<{ appointment: Appointment; modeVersion: number }>(
          "/api/appointment",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: value }),
            signal: request.current.signal,
          },
        );
        if (alive.current && modeVersion === result.modeVersion) {
          const fields = Object.fromEntries(
            Object.entries(result.appointment).filter(([, item]) => item),
          );
          setAppointmentDraft({ ...appointmentDraft, ...fields });
          toast(t("请核对已提取的挂号信息。"));
          open("appointment");
        }
        return;
      }
      const result = await api<{
        reply: string;
        action: Action | null;
        provider: string;
        revision: number;
      }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, locale }),
        signal: request.current.signal,
      });
      if (alive.current) {
        setAnswer(result);
        setPhase("answer");
        speak(result.reply, locale);
      }
    } catch (e) {
      if (alive.current && (e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setPhase("idle");
      }
    } finally {
      sending.current = false;
    }
  }
  function start() {
    const Constructor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor || !window.isSecureContext) {
      setSupported(false);
      setPhase("idle");
      return;
    }
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
    setText("");
    transcript.current = "";
    setAnswer(null);
    setError("");
    sendOnEnd.current = false;
    const rec = new Constructor();
    recognition.current = rec;
    rec.lang = locale === "en" ? "en-US" : "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const parts = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      transcript.current = parts.join("");
      if (alive.current) setText(transcript.current);
    };
    rec.onerror = (e) => {
      if (!alive.current) return;
      sendOnEnd.current = false;
      if (timer.current) clearTimeout(timer.current);
      setError(
        e.error === "not-allowed"
          ? t("麦克风未获授权，可在下方输入文字。")
          : e.error === "no-speech"
            ? t("未检测到语音，请重试。")
            : e.error === "network"
              ? t("暂时无法连接语音服务，可输入文字。")
              : t("暂时无法识别语音，请重试或输入文字。"),
      );
      setPhase("idle");
    };
    rec.onend = () => {
      if (!alive.current) return;
      if (timer.current) clearTimeout(timer.current);
      if (sendOnEnd.current) {
        sendOnEnd.current = false;
        void ask(transcript.current);
      } else setPhase((p) => (p === "listening" ? "idle" : p));
    };
    try {
      rec.start();
      setPhase("listening");
    } catch {
      setError(t("无法打开麦克风，请重试或输入文字。"));
      setPhase("idle");
    }
  }
  function finish() {
    sendOnEnd.current = true;
    recognition.current?.stop();
    setPhase("processing");
    timer.current = setTimeout(() => {
      if (sendOnEnd.current) {
        sendOnEnd.current = false;
        recognition.current?.abort();
        void ask(transcript.current);
      }
    }, 1800);
  }
  useEffect(() => {
    alive.current = true;
    setSupported(
      window.isSecureContext &&
        Boolean(
          (window as SpeechWindow).SpeechRecognition ||
          (window as SpeechWindow).webkitSpeechRecognition,
        ),
    );
    start();
    return () => {
      alive.current = false;
      sendOnEnd.current = false;
      recognition.current?.abort();
      request.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      window.speechSynthesis?.cancel();
    };
  }, []);
  return (
    <Sheet
      title={
        phase === "listening"
          ? t("您说，我在听")
          : phase === "processing"
            ? t("正在处理")
            : phase === "answer"
              ? t("助手回复")
              : appointmentMode
                ? t("录入挂号信息")
                : t("语音输入")
      }
      elder={role === "elder"}
      onClose={appointmentMode ? () => open("appointment") : onClose}
    >
      <div className="voice-content">
        {phase === "answer" && answer ? (
          <>
            <div className="voice-question">{text}</div>
            <p className="voice-answer">{answer.reply}</p>
            <button className="read-button" onClick={() => speak(answer.reply, locale)}>
              <Volume2 size={22} />
              {t("再听一遍")}
            </button>
            {answer.provider === "local" && (
              <p className="source-note">{t("当前任务 · 模型未配置")}</p>
            )}
            {answer.action && (
              <Button
                busy={busy}
                onClick={async () => {
                  if (await act(answer.action!, answer.revision)) {
                    toast(t("已更新记录"));
                    onClose();
                  }
                }}
              >
                {t("确认")}
              </Button>
            )}
            <Button
              secondary
              onClick={() => {
                setAnswer(null);
                setPhase("idle");
                setText("");
              }}
            >
              {t("继续提问")}
            </Button>
          </>
        ) : (
          <>
            <div className={`voice-transcript ${!text ? "placeholder" : ""}`} aria-live="polite">
              {text ||
                (appointmentMode
                  ? t("请说出或输入医院、科室、日期和预约时段。")
                  : phase === "listening"
                    ? t("例如：我接下来该去哪里？")
                    : t("请在下方输入问题。"))}
            </div>
            {phase === "listening" && (
              <div className="waveform" aria-label={t("麦克风已打开")}>
                {[9, 15, 22, 13, 26, 32, 19, 11, 24, 17, 29, 13, 21, 10, 17].map((height, i) => (
                  <span key={i} style={{ height, animationDelay: `${i * 0.08}s` }} />
                ))}
              </div>
            )}
            {phase === "listening" ? (
              <Button onClick={finish}>{t("说完了")}</Button>
            ) : phase === "processing" ? (
              <Button busy>{t("正在处理")}</Button>
            ) : (
              <>
                {supported && (
                  <Button secondary onClick={start}>
                    <Mic size={22} />
                    {t("开始说话")}
                  </Button>
                )}
                <form
                  className="voice-text-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(text);
                  }}
                >
                  <label htmlFor="voice-text">
                    {supported ? t("也可以输入文字") : t("可以用手机键盘上的麦克风输入")}
                  </label>
                  <textarea
                    id="voice-text"
                    value={text}
                    rows={3}
                    placeholder={appointmentMode ? t("输入挂号信息") : t("我接下来该去哪里？")}
                    onChange={(e) => {
                      setText(e.target.value);
                      transcript.current = e.target.value;
                    }}
                  />
                  <Button type="submit" disabled={!text.trim()}>
                    <Send size={20} />
                    {t("发送")}
                  </Button>
                </form>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {t(error)}
              </p>
            )}
            <Button secondary onClick={appointmentMode ? () => open("appointment") : onClose}>
              {t("取消")}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
