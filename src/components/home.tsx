"use client";
import { useState } from "react";
import {
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  Heart,
  Home,
  MapPin,
  Mic,
  Pill,
  Plus,
  Settings2,
  UsersRound,
  Volume2,
} from "lucide-react";
import { useCompanion } from "./context";
import { Button, Empty, Row, speak } from "./ui";
import { getTask, nextDose } from "@/lib/presentation";
import { clockTime, DOC_NAMES, localDate, STAGES } from "@/lib/types";
import { PRODUCT_NAME } from "@/lib/brand";
import { useLanguage } from "./language";
import { caseMaterials } from "@/lib/samples";

export function ElderHome() {
  const { locale, t } = useLanguage();
  const {
      data: { state: s },
      busy,
      act,
      open,
    } = useCompanion(),
    task = getTask(s, locale),
    dose = nextDose(s),
    med = s.medications.find((m) => m.id === dose?.medicationId),
    now = new Date(),
    due = !!dose && new Date(dose.snoozedUntil || dose.scheduledAt) <= now;
  const medicationMode = s.visit.stage === 7 && !!dose && !!med;
  const title = medicationMode ? (due ? t("该服药了") : t("下一次服药")) : task.title;
  return (
    <>
      <header className="app-header">
        <div className="wordmark">
          <Heart size={20} />
          <span>{locale === "en" ? "KinStep" : PRODUCT_NAME}</span>
        </div>
        <button className="icon-button" aria-label={t("设置")} onClick={() => open("settings")}>
          <Settings2 size={21} />
        </button>
      </header>
      <main className="elder-main">
        <div className="elder-greeting">
          <span>
            {s.visit.appointment.patient
              ? locale === "en"
                ? `Hello, ${t(s.visit.appointment.patient)}`
                : `${s.visit.appointment.patient}，您好`
              : null}
          </span>
          <button
            aria-label={t("读给我听")}
            className="read-button"
            onClick={() =>
              speak(
                medicationMode
                  ? [title, clockTime(dose!.scheduledAt), med!.name, med!.dose, med!.instructions]
                      .map(t)
                      .filter(Boolean)
                      .join(". ")
                  : [task.title, task.location, task.description].filter(Boolean).join(". "),
                locale,
              )
            }
          >
            <Volume2 size={23} />
            {t("听一听")}
          </button>
        </div>
        <h1 className="elder-title">{title}</h1>
        {medicationMode ? (
          <>
            <section className="card elder-task-card">
              <div className="medicine-time">
                <Clock3 size={24} />
                <span>
                  {dose.snoozedUntil ? clockTime(dose.snoozedUntil) : clockTime(dose.scheduledAt)}
                </span>
              </div>
              <div className="elder-drug-name">{t(med.name)}</div>
              <p className="elder-dose">{t(med.dose)}</p>
              <Row title={t("查看用法")} onClick={() => open("dose", dose.id)} />
            </section>
            {due ? (
              <>
                <Button busy={busy} onClick={() => open("dose", dose.id)}>
                  {t("我已服药")}
                </Button>
                <Button
                  secondary
                  busy={busy}
                  onClick={() => act({ type: "doseSnooze", id: dose.id })}
                >
                  {t("稍后提醒")}
                </Button>
              </>
            ) : (
              <p className="elder-description">{t("到时请查看本次用药。")}</p>
            )}
            <Row
              title={t("今日服药安排")}
              icon={<Pill size={26} />}
              onClick={() => open("summary")}
            />
          </>
        ) : (
          <>
            {task.location && (
              <section className="card elder-task-card">
                <div className="location-label">
                  <MapPin size={21} />
                  {s.visit.stage === 1 ? t("就诊医院") : t("请前往")}
                </div>
                <div className="elder-location">
                  {task.location.split(" · ").map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
                </div>
                {task.description && !(s.visit.stage === 2 && !s.visit.registered) && (
                  <p className="elder-card-note">{task.description}</p>
                )}
              </section>
            )}
            {!task.location && (
              <div className="elder-complete">
                <span className={`complete-icon ${s.visit.stage === 7 ? "" : "neutral"}`}>
                  {s.visit.stage === 7 ? <CheckCheck size={40} /> : <CalendarDays size={36} />}
                </span>
                <p>{task.description}</p>
                {s.visit.stage > 0 && s.visit.stage < 7 && <p>{t("地点待补充，请联系家人。")}</p>}
              </div>
            )}
            {task.actionLabel && (
              <Button
                busy={busy}
                onClick={() => (task.dialog ? open(task.dialog) : task.action && act(task.action))}
              >
                {task.actionLabel}
              </Button>
            )}
            {s.visit.stage === 4 && s.visit.tests.some((t) => t.done && !t.report) && (
              <Button secondary onClick={() => open("upload")}>
                {t("拍摄报告")}
              </Button>
            )}
            {s.visit.stage === 7 && s.medications.some((m) => !m.active) && (
              <div className="soft-note">{t("服药安排待家人核对。")}</div>
            )}
            <div className="elder-disclosures">
              {s.visit.stage > 0 && (
                <Row title={t("查看就医安排")} onClick={() => open("appointment")} />
              )}
              {s.visit.stage > 1 && (
                <Row
                  title={s.visit.stage === 7 ? t("查看就医记录") : t("查看已完成步骤")}
                  onClick={() => open("timeline")}
                />
              )}
            </div>
          </>
        )}
        {s.help && (
          <div className="help-sent">
            <UsersRound size={24} />
            <span>{t("求助已发送")}</span>
          </div>
        )}
      </main>
      <nav className="elder-toolbar" aria-label={t("常用操作")}>
        <button onClick={() => open("upload")}>
          <Camera />
          <span>{t("拍单据")}</span>
        </button>
        <button className="voice-utility" onClick={() => open("voice")}>
          <Mic />
          <span>{t("说句话")}</span>
        </button>
        <button onClick={() => open("help")}>
          <UsersRound />
          <span>{t("找家人")}</span>
        </button>
      </nav>
    </>
  );
}
export function ChildHome() {
  const { locale, t } = useLanguage();
  const {
      data: { state: s, caseMode },
      busy,
      act,
      open,
    } = useCompanion(),
    [tab, setTab] = useState("overview"),
    task = getTask(s, locale),
    dose = nextDose(s),
    med = s.medications.find((m) => m.id === dose?.medicationId);
  const date = new Date().toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  });
  const records = s.doses
    .filter((d) => d.scheduledAt.startsWith(localDate()))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return (
    <>
      <header className="app-header child-header">
        <div className="wordmark">
          <Heart size={19} />
          <span>{locale === "en" ? "KinStep" : PRODUCT_NAME}</span>
        </div>
        <button className="icon-button" aria-label={t("设置")} onClick={() => open("settings")}>
          <Settings2 size={21} />
        </button>
      </header>
      <main className="child-main">
        <div className="page-heading">
          <div>
            <h1>
              {tab === "overview" ? t("就医安排") : tab === "documents" ? t("单据") : t("用药")}
            </h1>
            <p className="heading-date">
              {t("今天 ·")}
              {date}
            </p>
          </div>
          {s.childName && (
            <span className="avatar" title={t(s.childName)}>
              {t(s.childName).slice(0, 1)}
              <span className="avatar-dot" />
            </span>
          )}
        </div>
        {tab === "overview" ? (
          <>
            {s.help && (
              <section className="help-card">
                <span className="help-icon">
                  <UsersRound size={23} />
                </span>
                <div>
                  <h3>{t("长辈发来求助")}</h3>
                  <p>{s.help.note}</p>
                  <button disabled={busy} onClick={() => act({ type: "resolveHelp" })}>
                    {t("标记已处理")}
                    <Check size={15} />
                  </button>
                </div>
              </section>
            )}
            <section className="card progress-card">
              <div className="progress-main">
                <div>
                  <p className="section-eyebrow">{t("当前进度")}</p>
                  <h2>{t(STAGES[s.visit.stage])}</h2>
                  <p>
                    {s.visit.stage === 0
                      ? t("请添加医院、科室与预约时间")
                      : s.visit.stage === 4
                        ? s.visit.tests
                            .map((item) => t(item.name))
                            .join(locale === "en" ? ", " : "、")
                        : t(s.visit.appointment.department)}
                  </p>
                  {s.timeline.length > 0 && (
                    <small>
                      {clockTime(s.updatedAt)} · {t(s.timeline.at(-1)!.source)}
                    </small>
                  )}
                </div>
                <span className="progress-emblem">
                  <span>
                    {s.visit.stage === 7 ? <CheckCheck size={32} /> : <FileText size={30} />}
                  </span>
                </span>
              </div>
              <Row
                title={t("查看完整进度")}
                onClick={() => open("timeline")}
                className="blue-row"
              />
            </section>
            <p className="section-title">{t("当前任务")}</p>
            <section className="card current-card">
              <div className="current-location">
                <MapPin size={19} />
                <span>
                  {task.location || (s.visit.stage === 7 ? t("今日安排") : t("地点待补充"))}
                </span>
              </div>
              <h3>{task.title}</h3>
              <p>{task.description}</p>
              {task.actionLabel && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    task.dialog ? open(task.dialog) : task.action && act(task.action)
                  }
                >
                  {t("代为确认")}
                  <ChevronRight size={17} />
                </button>
              )}
              {s.visit.stage === 0 && (
                <Button onClick={() => open("appointment")}>{t("添加就医安排")}</Button>
              )}
            </section>
            <div className="section-heading">
              <p className="section-title">{t("最新单据")}</p>
              <button onClick={() => setTab("documents")}>{t("查看全部")}</button>
            </div>
            {s.documents.length ? (
              <div className="card row-group">
                {s.documents.slice(0, 2).map((d) => (
                  <Row
                    key={d.id}
                    icon={<FileText size={24} />}
                    title={t(d.extraction.title || DOC_NAMES[d.extraction.kind])}
                    detail={`${clockTime(d.createdAt)} · ${d.confirmedAt ? t("已确认") : t("待核对")}`}
                    onClick={() => open("upload", d.id)}
                  />
                ))}
              </div>
            ) : (
              <button className="add-document" onClick={() => open("upload")}>
                <Camera size={24} />
                <span>
                  <strong>{t("添加单据")}</strong>
                  <small>{t("拍照或从相册选择")}</small>
                </span>
                <Plus size={20} />
              </button>
            )}
            <div className="section-space">
              <Row icon={<Mic size={23} />} title={t("问助手")} onClick={() => open("voice")} />
              <Row
                icon={<CalendarDays size={24} />}
                title={s.visit.stage === 0 ? t("添加就医安排") : t("查看就医安排")}
                detail={
                  s.visit.stage === 0
                    ? undefined
                    : `${t(s.visit.appointment.hospital)} · ${s.visit.appointment.time}`
                }
                onClick={() => open("appointment")}
              />
            </div>
            {caseMode && <CaseMaterials />}
          </>
        ) : tab === "documents" ? (
          <>
            <div className="section-heading">
              <p className="section-title">{t("本次就医")}</p>
              <button onClick={() => open("upload")}>
                <Plus size={17} />
                {t("添加")}
              </button>
            </div>
            {s.documents.length ? (
              <div className="card row-group document-list">
                {s.documents.map((d) => (
                  <Row
                    key={d.id}
                    title={t(d.extraction.title || DOC_NAMES[d.extraction.kind])}
                    icon={<FileText size={24} />}
                    detail={`${clockTime(d.createdAt)} · ${d.confirmedAt ? t("已确认") : t("待核对")}`}
                    onClick={() => open("upload", d.id)}
                  />
                ))}
              </div>
            ) : (
              <Empty
                icon={<FileText size={36} />}
                title={t("暂无单据")}
                description={t("可拍摄或上传检查单、报告和处方。")}
              >
                <Button onClick={() => open("upload")}>{t("添加单据")}</Button>
              </Empty>
            )}
          </>
        ) : (
          <>
            {dose && med ? (
              <section className="card progress-card">
                <div className="progress-main medication-hero">
                  <div>
                    <p className="section-eyebrow">
                      {new Date(dose.snoozedUntil || dose.scheduledAt) <= new Date()
                        ? t("到时未确认")
                        : t("下一次提醒")}
                    </p>
                    <h2>{clockTime(dose.snoozedUntil || dose.scheduledAt)}</h2>
                    <h3>{t(med.name)}</h3>
                    <p>{t(med.dose)}</p>
                  </div>
                  <span className="medicine-emblem">
                    <Pill size={37} strokeWidth={1.6} />
                  </span>
                </div>
                <Row
                  className="blue-row"
                  title={t("查看服药安排")}
                  onClick={() => open("medication", med.id)}
                />
              </section>
            ) : (
              <section className="card medication-intro">
                <span className="medicine-emblem">
                  <Pill size={32} />
                </span>
                <h2>
                  {s.medications.length
                    ? s.medications.some((m) => !m.reviewed)
                      ? t("用药安排待核对")
                      : t("用药安排")
                    : t("暂无用药安排")}
                </h2>
                <p>
                  {s.medications.length
                    ? t("打开下方药品，查看用法与提醒。")
                    : t("拍摄处方或药袋，添加用药安排。")}
                </p>
                <Button onClick={() => open("upload")}>{t("拍处方或药袋")}</Button>
              </section>
            )}
            <div className="section-heading">
              <p className="section-title">{t("服药安排")}</p>
              <button onClick={() => open("medication")}>
                <Plus size={16} />
                {t("手动添加")}
              </button>
            </div>
            {s.medications.length ? (
              <div className="card row-group">
                {s.medications.map((m) => (
                  <Row
                    key={m.id}
                    icon={<Pill size={23} />}
                    title={t(m.name)}
                    detail={`${m.active ? (m.endDate < localDate() ? t("提醒周期结束") : m.times.join(" · ")) : m.reviewed ? t("已核对 · 待启用") : t("待核对")} · ${t(m.dose || "用量待补充")}`}
                    onClick={() => open("medication", m.id)}
                  />
                ))}
              </div>
            ) : null}
            <p className="section-title">{t("今日记录")}</p>
            {records.length ? (
              <div className="card dose-records">
                {records.map((d) => {
                  const m = s.medications.find((m) => m.id === d.medicationId),
                    due = new Date(d.scheduledAt) <= new Date();
                  return (
                    <div className="dose-record" key={d.id}>
                      <span className="record-time">
                        {clockTime(d.confirmedAt || d.scheduledAt)}
                      </span>
                      <div>
                        <strong>
                          {d.status === "taken"
                            ? t("已确认服药")
                            : d.status === "skipped"
                              ? t("本次未服")
                              : due
                                ? t("到时未确认")
                                : t("等待提醒")}
                        </strong>
                        <small>
                          {m && t(m.name)}
                          {d.snoozedUntil && d.status === "pending"
                            ? ` · ${t("再次提醒")} ${clockTime(d.snoozedUntil)}`
                            : ""}
                        </small>
                      </div>
                      {d.status === "taken" ? (
                        <Check className="green" size={22} />
                      ) : (
                        <Clock3 className="muted" size={20} />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted section-note">{t("启用提醒后，可在此查看服药记录。")}</p>
            )}
          </>
        )}
      </main>
      <nav className="child-tabs" aria-label={t("主要页面")}>
        {[
          { id: "overview", label: t("概览"), Icon: Home },
          { id: "documents", label: t("单据"), Icon: FileText },
          { id: "medications", label: t("用药"), Icon: Pill },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-label={label}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              window.scrollTo({ top: 0 });
            }}
          >
            <span>
              <Icon size={25} strokeWidth={tab === id ? 2.2 : 1.8} />
            </span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}

function CaseMaterials() {
  const { t } = useLanguage();
  return (
    <details className="disclosure-details case-materials">
      <summary>{t("就医资料")}</summary>
      <dl className="case-material-list">
        {caseMaterials
          .filter((doc) => doc.kind !== "receipt")
          .map((doc) => (
            <div key={doc.kind}>
              <dt>{t(doc.title)}</dt>
              <dd>
                {doc.tests.map((item) => `${t(item.name)} · ${t(item.location)}`).join(", ") ||
                  t(doc.summary)}
              </dd>
              {doc.notes && <dd>{t(doc.notes)}</dd>}
              {doc.medicines.map((m) => (
                <dd key={m.name}>
                  {[m.name, m.strength, m.dose, m.route, m.frequency, m.instructions]
                    .map(t)
                    .join(" · ")}
                </dd>
              ))}
            </div>
          ))}
      </dl>
    </details>
  );
}
