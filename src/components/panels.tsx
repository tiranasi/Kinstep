"use client";
import { useLanguage } from "./language";
import { SettingsPanel } from "./settings";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  HeartHandshake,
  MapPin,
  Pill,
  Plus,
  UsersRound,
  Volume2,
} from "lucide-react";
import { useCompanion, type Panel } from "./context";
import { Button, Empty, Field, Row, Sheet, speak } from "./ui";
import { api } from "./companion";
import type { Appointment, Medication } from "@/lib/types";
import { clockTime, localDate, STAGES } from "@/lib/types";
export function StandardPanels({ panel, onClose }: { panel: Panel; onClose: () => void }) {
  const { t } = useLanguage();
  const {
    data: { role },
  } = useCompanion();
  let content: React.ReactNode,
    title = "";
  switch (panel.name) {
    case "appointment":
      title = t("就医安排");
      content = <AppointmentPanel />;
      break;
    case "timeline":
      title = t("就医进度");
      content = <TimelinePanel />;
      break;
    case "afterConsult":
      title = t("就诊后安排");
      content = <AfterConsultPanel />;
      break;
    case "reviewReport":
      title = t("报告后续安排");
      content = <AfterConsultPanel report />;
      break;
    case "help":
      title = role === "elder" ? t("找家人") : t("家人求助");
      content = <HelpPanel />;
      break;
    case "settings":
      title = t("设置");
      content = <SettingsPanel />;
      break;
    case "medication":
      title = t("服药安排");
      content = <MedicationPanel id={panel.id} />;
      break;
    case "dose":
      title = t("本次服药");
      content = <DosePanel id={panel.id} />;
      break;
    case "summary":
      title = t("今日服药安排");
      content = <MedicationSummary />;
      break;
  }
  return (
    <Sheet title={title} onClose={onClose} elder={role === "elder"}>
      {content}
    </Sheet>
  );
}
function AppointmentPanel() {
  const { t } = useLanguage();
  const {
      data: { state: s, role },
      busy,
      act,
      toast,
      open,
      appointmentDraft,
      setAppointmentDraft,
    } = useCompanion(),
    [editing, setEditing] = useState(
      role === "child" && (s.visit.stage === 0 || !!appointmentDraft),
    ),
    [a, setA] = useState<Appointment>({ ...s.visit.appointment, ...appointmentDraft }),
    [reading, setReading] = useState(false),
    [error, setError] = useState("");
  async function readScreenshot(file: File) {
    const form = new FormData();
    form.append("image", file);
    setReading(true);
    setError("");
    try {
      const { appointment } = await api<{ appointment: Appointment }>("/api/appointment", {
        method: "POST",
        body: form,
      });
      const fields = Object.fromEntries(Object.entries(appointment).filter(([, value]) => value));
      setA((current) => ({ ...current, ...fields }));
      toast(t("请核对已提取的挂号信息。"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  const fields: [keyof Appointment, string, string][] = [
    ["hospital", t("医院"), t("就诊医院")],
    ["department", t("科室"), t("就诊科室")],
    ["doctor", t("医生"), t("可稍后补充")],
    ["date", t("日期"), ""],
    ["time", t("预约时段"), t("例如：09:00–09:30")],
    ["location", t("报到与接诊地点"), t("可稍后补充")],
    ["pharmacy", t("取药地点"), t("可稍后补充")],
    ["patient", t("长辈称呼"), ""],
  ];
  if (editing)
    return (
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ type: "appointment", appointment: a })) {
            setAppointmentDraft(null);
            setEditing(false);
            toast(t("已保存就医安排"));
          }
        }}
      >
        <div className="appointment-intake">
          <Field label={t("上传挂号截图")}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={reading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void readScreenshot(file);
              }}
            />
          </Field>
          <Button
            type="button"
            secondary
            disabled={reading}
            onClick={() => {
              setAppointmentDraft(a);
              open("appointmentVoice");
            }}
          >
            {t("语音录入挂号信息")}
          </Button>
          {reading && <p role="status">{t("正在识别挂号信息")}</p>}
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
        </div>
        {fields.map(([key, label, placeholder]) => (
          <Field label={label} key={key}>
            <input
              required={!["doctor", "pharmacy", "location"].includes(key)}
              type={key === "date" ? "date" : "text"}
              value={a[key]}
              placeholder={placeholder}
              onChange={(e) => setA({ ...a, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Button type="submit" busy={busy || reading}>
          {t("保存安排")}
        </Button>
      </form>
    );
  return (
    <>
      <div className="appointment-heading">
        <span className="row-icon large">
          <CalendarDays size={30} />
        </span>
        <h3>{t(a.hospital)}</h3>
        <p>
          {t(a.department)} · {t(a.doctor || "医生待补充")}
        </p>
      </div>
      <div className="card detail-list">
        {[
          [t("日期"), a.date],
          [t("时间"), a.time],
          [t("报到地点"), a.location],
          [t("药房"), a.pharmacy || t("待补充")],
          [t("就诊人"), a.patient],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{t(value)}</strong>
          </div>
        ))}
      </div>
      <p className="section-title">{t("出门带好")}</p>
      <div className="checklist">
        {[t("身份证"), t("医保凭证"), t("已有病历与检查报告")].map((t) => (
          <p key={t}>
            <Check size={19} />
            {t}
          </p>
        ))}
      </div>
      {role === "child" && (
        <Button secondary onClick={() => setEditing(true)}>
          {t("编辑安排")}
        </Button>
      )}
    </>
  );
}
function TimelinePanel() {
  const { t } = useLanguage();
  const {
    data: { state: s, role },
    open,
  } = useCompanion();
  return (
    <>
      <div className="timeline">
        {STAGES.slice(1).map((label, i) => {
          const stage = i + 1,
            event = s.timeline.find((t) => t.stage === stage),
            current = s.visit.stage === stage,
            passed = s.visit.stage > stage;
          return (
            <div
              className={`timeline-step ${current ? "current" : passed ? "done" : ""}`}
              key={stage}
            >
              <span className="timeline-dot">
                {passed ? <Check size={14} /> : current ? <span /> : null}
              </span>
              <span className="timeline-time">
                {current ? t("现在") : event ? clockTime(event.at) : passed ? "—" : t("待办")}
              </span>
              <div>
                <strong>{t(label)}</strong>
                {current && (
                  <small>
                    {stage === 4
                      ? s.visit.tests.map((test) => t(test.name)).join(", ")
                      : stage === 2
                        ? s.visit.registered
                          ? t("已报到，等待叫号")
                          : t("待报到")
                        : t(s.visit.appointment.department)}
                  </small>
                )}
                {passed && !event && <small>{t("本次无需此步骤")}</small>}
              </div>
            </div>
          );
        })}
      </div>
      {s.visit.tests.length > 0 && (
        <>
          <p className="section-title">{t("检查明细")}</p>
          <div className="card test-detail">
            {s.visit.tests.map((test) => (
              <div key={test.id}>
                <strong>{t(test.name)}</strong>
                <small>{t(test.location || "地点待补充")}</small>
                <div className="status-chips">
                  <span className={test.paid ? "complete" : ""}>
                    {test.paid ? t("已确认缴费") : t("缴费待确认")}
                  </span>
                  <span className={test.done ? "complete" : ""}>
                    {t(test.done ? "检查已完成" : "检查待完成")}
                  </span>
                  <span className={test.report ? "complete" : ""}>
                    {t(test.report ? "报告已取得" : "报告待取得")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <details className="disclosure-details">
        <summary>
          {t("查看操作记录")}
          <ChevronRight size={18} />
        </summary>
        <div className="activity-list">
          {s.timeline
            .slice()
            .reverse()
            .map((event) => (
              <div key={event.id}>
                <time>{clockTime(event.at)}</time>
                <span>
                  {t(event.label)}
                  <small>{t(event.source)}</small>
                </span>
              </div>
            ))}
        </div>
      </details>
      {role === "child" && <Button onClick={() => open("help")}>{t("查看求助")}</Button>}
    </>
  );
}
function AfterConsultPanel({ report = false }: { report?: boolean }) {
  const { t } = useLanguage();
  const {
      data: { state: s },
      busy,
      act,
      close,
      open,
    } = useCompanion(),
    [choice, setChoice] = useState(""),
    [tests, setTests] = useState([{ name: "", location: "" }]),
    [medicine, setMedicine] = useState(s.visit.needsMedicine);
  return (
    <div className="form-stack">
      <p className="panel-intro">
        {report ? t("医生看过报告后，需要取药吗？") : t("请拍摄单据，或填写医生确认的后续安排。")}
      </p>
      {!report && (
        <Row icon={<CameraIcon />} title={t("拍摄单据")} onClick={() => open("upload")} />
      )}
      <div className="choice-list">
        {(report
          ? [
              ["medicine", t("需要取药"), t("前往药房领取药品")],
              ["finish", t("不需要取药"), t("本次就医完成")],
            ]
          : [
              ["tests", t("需要检查"), t("添加要做的检查")],
              ["medicine", t("只需要取药"), t("无需检查，前往药房")],
              ["finish", t("本次就医结束"), t("无需检查，也无需取药")],
            ]
        ).map(([key, title, detail]) => (
          <button
            type="button"
            className={`choice ${choice === key ? "selected" : ""}`}
            key={key}
            onClick={() => setChoice(key)}
          >
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <span className="radio-mark">{choice === key && <span />}</span>
          </button>
        ))}
      </div>
      {choice === "tests" && (
        <div className="form-stack">
          {tests.map((test, i) => (
            <div className="inset-form" key={i}>
              <Field label={`${t("检查")}${tests.length > 1 ? ` ${i + 1}` : ""}`}>
                <input
                  value={test.name}
                  placeholder={t("检查名称")}
                  onChange={(e) =>
                    setTests(
                      tests.map((item, n) => (n === i ? { ...item, name: e.target.value } : item)),
                    )
                  }
                />
              </Field>
              <Field label={t("地点")}>
                <input
                  value={test.location}
                  placeholder={t("单据上写的地点，可稍后补充")}
                  onChange={(e) =>
                    setTests(
                      tests.map((item, n) =>
                        n === i ? { ...item, location: e.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
          {tests.length < 2 && (
            <button
              className="text-link"
              onClick={() => setTests([...tests, { name: "", location: "" }])}
            >
              <Plus size={18} />
              {t("添加检查项目")}
            </button>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={medicine}
              onChange={(e) => setMedicine(e.target.checked)}
            />
            {t("医生也开了药")}
          </label>
        </div>
      )}
      <Button
        busy={busy}
        disabled={!choice || (choice === "tests" && tests.some((t) => !t.name.trim()))}
        onClick={async () => {
          const action = report
            ? { type: "reviewReport" as const, needsMedicine: choice === "medicine" }
            : {
                type: "afterConsult" as const,
                tests: choice === "tests" ? tests : [],
                needsMedicine: choice === "tests" ? medicine : choice === "medicine",
              };
          if (await act(action)) close();
        }}
      >
        {t("确认安排")}
      </Button>
    </div>
  );
}
function CameraIcon() {
  return <FileText size={24} />;
}
function HelpPanel() {
  const { t } = useLanguage();
  const {
      data: { role, state: s },
      busy,
      act,
      close,
      open,
    } = useCompanion(),
    [note, setNote] = useState("");
  return role === "elder" ? (
    <div className="form-stack">
      <Empty
        icon={<HeartHandshake size={38} />}
        title={s.help ? t("求助已发送") : t("请求家人帮助")}
        description={s.help ? t("家人可在概览中查看求助。") : t("发送后，家人可查看当前就医安排。")}
      />
      <Field label={t("补充说明（可选）")}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("可以不填写")}
          rows={2}
        />
      </Field>
      <Button
        busy={busy}
        disabled={!!s.help}
        onClick={async () => {
          if (await act({ type: "help", note })) {
            close();
          }
        }}
      >
        {s.help ? t("求助已发送") : t("发送求助")}
      </Button>
    </div>
  ) : (
    <div className="form-stack">
      <Empty
        icon={<UsersRound size={38} />}
        title={t("家人求助")}
        description={s.help ? s.help.note : t("暂无待处理求助。")}
      />
      <Row
        title={t("查看当前进度")}
        icon={<ClipboardList size={23} />}
        onClick={() => open("timeline")}
      />
      {s.help && (
        <Button
          busy={busy}
          onClick={async () => {
            if (await act({ type: "resolveHelp" })) close();
          }}
        >
          {t("标记已处理")}
        </Button>
      )}
    </div>
  );
}
function MedicationPanel({ id }: { id?: string }) {
  const { t } = useLanguage();
  const {
      data: { state: s, role },
      busy,
      act,
      toast,
      open,
    } = useCompanion(),
    existing = s.medications.find((m) => m.id === id),
    [editing, setEditing] = useState(!existing || !existing.reviewed);
  const [m, setM] = useState<Medication>(
    existing
      ? { ...existing }
      : {
          id: "",
          name: "",
          strength: "",
          dose: "",
          route: "",
          frequency: "",
          instructions: "",
          times: [],
          startDate: localDate(),
          endDate: localDate(),
          source: "",
          reviewed: false,
          active: false,
        },
  );
  const [times, setTimes] = useState(m.times.join("、"));
  if (role === "elder") return <MedicationSummary />;
  if (editing)
    return (
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const parsed = times.split(/[、,，\s]+/).filter(Boolean);
          const { reviewed, active, ...fields } = m;
          void reviewed;
          void active;
          if (
            await act({
              type: "saveMedication",
              medication: { ...fields, id: m.id || undefined, times: parsed },
            })
          ) {
            setEditing(false);
            toast(t("已保存用药安排"));
          }
        }}
      >
        <p className="panel-intro">{t("对照处方或药袋，核对医生写明的用法。")}</p>
        {m.sourceDocId && (
          <Row
            title={t("查看原始单据")}
            icon={<FileText size={23} />}
            onClick={() => open("upload", m.sourceDocId)}
          />
        )}
        {(
          [
            ["name", t("药品名称"), ""],
            ["strength", t("规格"), t("原文未注明可留空")],
            ["dose", t("每次用量"), t("保留原文单位，如：每次 1 片")],
            ["route", t("服用方式"), t("例如：口服")],
            ["frequency", t("频次"), t("例如：每日 2 次")],
            ["instructions", t("用法说明"), t("餐前 / 餐后等明确要求")],
            ["source", t("用法来源"), t("例如：处方、药袋或医生明确说明")],
          ] as const
        ).map(([key, label, placeholder]) => (
          <Field label={label} key={key}>
            <input
              required={!["strength", "instructions"].includes(key)}
              value={m[key]}
              placeholder={placeholder}
              onChange={(e) => setM({ ...m, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Field label={t("提醒时间")}>
          <input
            required
            value={times}
            placeholder={t("如：08:00、20:00")}
            onChange={(e) => setTimes(e.target.value)}
          />
        </Field>
        <div className="form-columns">
          <Field label={t("开始日期")}>
            <input
              required
              type="date"
              value={m.startDate}
              onChange={(e) => setM({ ...m, startDate: e.target.value })}
            />
          </Field>
          <Field label={t("提醒至")}>
            <input
              required
              type="date"
              min={m.startDate}
              value={m.endDate}
              onChange={(e) => setM({ ...m, endDate: e.target.value })}
            />
          </Field>
        </div>
        <p className="field-help">{t("用药疗程按医嘱执行。")}</p>
        <Button busy={busy} type="submit">
          {t("保存用药安排")}
        </Button>
      </form>
    );
  const current = s.medications.find((item) => item.id === (id || m.id)) || s.medications.at(-1);
  if (!current) return null;
  return (
    <div className="form-stack">
      <div className="medication-detail-heading">
        <span className="medicine-emblem">
          <Pill size={36} />
        </span>
        <h3>{t(current.name)}</h3>
        <p>{t(current.strength)}</p>
      </div>
      <div className="card detail-list">
        {[
          [t("每次用量"), current.dose],
          [t("服用方式"), current.route],
          [t("频次"), current.frequency],
          [t("说明"), current.instructions || t("原文未注明")],
          [t("提醒时间"), current.times.join(" · ")],
          [t("提醒周期"), `${current.startDate} – ${current.endDate}`],
          [t("来源"), current.source],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{t(value)}</strong>
          </div>
        ))}
      </div>
      {!current.active && (
        <Button
          busy={busy}
          disabled={s.visit.stage !== 7 || !s.visit.pickedUp}
          onClick={async () => {
            if (await act({ type: "enableMedication", id: current.id })) toast(t("服药提醒已启用"));
          }}
        >
          {t("启用提醒")}
        </Button>
      )}
      {s.visit.stage !== 7 || !s.visit.pickedUp ? (
        <p className="field-help">{t("取到药并完成就医后，可启用提醒。")}</p>
      ) : current.active ? (
        <p className="success-note">
          <CheckCheck size={19} />
          {current.endDate < localDate() ? t("提醒周期已结束") : t("提醒已启用")}
        </p>
      ) : null}
      <Button
        secondary
        onClick={() => {
          setM({ ...current });
          setTimes(current.times.join("、"));
          setEditing(true);
        }}
      >
        {t("重新核对用法")}
      </Button>
      {current.sourceDocId && (
        <Row title={t("查看原始单据")} onClick={() => open("upload", current.sourceDocId)} />
      )}
    </div>
  );
}
function DosePanel({ id }: { id?: string }) {
  const { t } = useLanguage();
  const {
      data: { state: s },
      busy,
      act,
      close,
    } = useCompanion(),
    d = s.doses.find((d) => d.id === id),
    m = s.medications.find((m) => m.id === d?.medicationId);
  if (!d || !m) return <p>{t("这次安排已更新，请关闭后重新查看。")}</p>;
  const due = new Date(d.scheduledAt) <= new Date();
  return (
    <div className="form-stack">
      <div className="dose-heading">
        <span className="pill-outline">
          <Pill size={30} />
        </span>
        <p>{clockTime(d.scheduledAt)}</p>
        <h3>{t(m.name)}</h3>
      </div>
      <div className="card detail-list">
        {[
          [t("每次用量"), m.dose],
          [t("服用方式"), m.route],
          [t("用法"), m.instructions || m.frequency],
          [t("来源"), m.source],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{t(value)}</strong>
          </div>
        ))}
      </div>
      <button
        className="read-button"
        onClick={() =>
          speak(
            [m.name, m.dose, m.route, m.instructions, m.source].filter(Boolean).map(t).join(". "),
          )
        }
      >
        <Volume2 size={23} />
        {t("读给我听")}
      </button>
      {d.status === "pending" && due ? (
        <>
          <p className="confirm-question">
            {t("确认已服药")} · {t(m.name)}
          </p>
          <Button
            busy={busy}
            onClick={async () => {
              if (await act({ type: "doseTaken", id: d.id })) close();
            }}
          >
            {t("确认已服药")}
          </Button>
          <Button
            secondary
            busy={busy}
            onClick={async () => {
              if (await act({ type: "doseSnooze", id: d.id })) close();
            }}
          >
            {t("10分钟后再提醒")}
          </Button>
          <details className="disclosure-details">
            <summary>
              {t("本次没有服药")}
              <ChevronRight size={18} />
            </summary>
            <Button
              secondary
              busy={busy}
              onClick={async () => {
                if (await act({ type: "doseSkip", id: d.id })) close();
              }}
            >
              {t("记录本次未服")}
            </Button>
          </details>
        </>
      ) : (
        <p className="success-note">
          {d.status === "taken"
            ? t("已确认本次服药")
            : d.status === "skipped"
              ? t("已记录本次未服")
              : t("还没到本次提醒时间")}
        </p>
      )}
    </div>
  );
}
function MedicationSummary() {
  const { t } = useLanguage();
  const {
    data: { state: s },
    open,
  } = useCompanion();
  return (
    <div className="form-stack">
      {s.medications.length ? (
        s.medications.map((m) => (
          <div className="card" key={m.id}>
            <div className="summary-med">
              <Pill size={27} />
              <div>
                <h3>{t(m.name)}</h3>
                <p>{t(m.dose || "请家人核对用量")}</p>
                <p>{m.active ? m.times.join(" · ") : t("请家人确认服药安排")}</p>
              </div>
            </div>
            {s.doses
              .filter((d) => d.medicationId === m.id && d.scheduledAt.startsWith(localDate()))
              .map((d) => (
                <Row
                  key={d.id}
                  title={`${clockTime(d.scheduledAt)} · ${d.status === "taken" ? t("已确认服药") : d.status === "skipped" ? t("本次未服") : t("待确认服药")}`}
                  onClick={() => open("dose", d.id)}
                />
              ))}
          </div>
        ))
      ) : (
        <Empty
          icon={<Pill size={35} />}
          title={t("暂无用药安排")}
          description={t("请家人添加并核对用药安排。")}
        />
      )}
    </div>
  );
}
