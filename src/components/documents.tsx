"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  FileText,
  ImagePlus,
  LoaderCircle,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useCompanion } from "./context";
import { api } from "./companion";
import { Button, Field, Sheet } from "./ui";
import { useLanguage } from "./language";
import {
  DOC_NAMES,
  emptyExtraction,
  type AppPayload,
  type AppState,
  type DocKind,
  type DocumentRecord,
  type Extraction,
} from "@/lib/types";

export function DocumentSheet({
  onClose,
  documentId,
}: {
  onClose: () => void;
  documentId?: string;
}) {
  const { locale, t } = useLanguage();
  const {
      data: { state: s, role, aiConfigured, caseMode },
      act,
      busy,
      toast,
    } = useCompanion(),
    client = useQueryClient();
  const existing = s.documents.find((d) => d.id === documentId),
    [doc, setDoc] = useState<DocumentRecord | null>(existing || null),
    [extraction, setExtraction] = useState<Extraction>(existing?.extraction || emptyExtraction()),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [manual, setManual] = useState(false),
    [editing, setEditing] = useState(false);
  const camera = useRef<HTMLInputElement>(null),
    album = useRef<HTMLInputElement>(null),
    mounted = useRef(true),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const live = doc ? s.documents.find((d) => d.id === doc.id) || doc : null;
  const mayEdit = role === "child" && Boolean(live && !live.applied);
  const canApplyArchived =
    !!live?.confirmedAt &&
    !live.applied &&
    ((extraction.kind === "test_order" &&
      [3, 4].includes(s.visit.stage) &&
      extraction.tests.length > 0) ||
      (extraction.kind === "report" && s.visit.stage === 4) ||
      (extraction.kind === "payment" &&
        extraction.paymentStatus === "paid" &&
        [4, 6].includes(s.visit.stage)) ||
      (extraction.kind === "appointment" && role === "child"));
  function selectFile(f?: File) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setError(t("请选择10MB以内的照片。"));
      return;
    }
    setFile(f);
    setDoc(null);
    setManual(false);
    setError("");
  }
  async function submit(sample?: DocKind, manualData?: Extraction) {
    if (working) return;
    setWorking(true);
    setError("");
    const form = new FormData();
    form.append("locale", locale);
    if (file && !sample) form.append("image", file);
    if (sample) form.append("sample", sample);
    if (manualData) form.append("extraction", JSON.stringify(manualData));
    abort.current = new AbortController();
    try {
      const result = await api<{ document: DocumentRecord; state: AppState; duplicate: boolean }>(
        "/api/documents",
        { method: "POST", body: form, signal: abort.current.signal },
      );
      if (!mounted.current) return;
      await client.cancelQueries({ queryKey: ["family"] });
      client.setQueryData<AppPayload>(
        ["family"],
        (old) =>
          old && {
            ...old,
            state: result.state.revision >= old.state.revision ? result.state : old.state,
          },
      );
      setDoc(result.document);
      setExtraction(result.document.extraction);
      setManual(false);
      setEditing(false);
      if (result.duplicate) toast(t("单据已存在，已打开原记录。"));
    } catch (e) {
      if (mounted.current && (e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (mounted.current) setWorking(false);
    }
  }
  const reportTask =
    extraction.kind === "report"
      ? s.visit.tests.find((t) => t.name === extraction.targetName)
      : undefined;
  return (
    <Sheet
      title={
        working
          ? t("正在处理")
          : live
            ? live.confirmedAt
              ? t("单据详情")
              : t("核对单据")
            : manual
              ? t("补充单据信息")
              : file
                ? t("预览照片")
                : t("拍下单据")
      }
      onClose={onClose}
      elder={role === "elder"}
    >
      <input
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        ref={camera}
        onChange={(e) => selectFile(e.target.files?.[0])}
        aria-label={t("拍摄单据")}
      />
      <input
        className="visually-hidden"
        type="file"
        accept="image/*"
        ref={album}
        onChange={(e) => selectFile(e.target.files?.[0])}
        aria-label={t("从相册选择单据")}
      />
      {working ? (
        <div className="recognizing">
          <div className="scan-document">
            <FileText size={65} strokeWidth={1.1} />
            <span />
          </div>
          <h3>{t("正在整理单据信息")}</h3>
          <p>{t("请稍候")}</p>
          <LoaderCircle size={24} className="spin" />
        </div>
      ) : live ? (
        <div className="form-stack">
          <span className={`status-label ${live.confirmedAt ? "confirmed" : ""}`}>
            {live.confirmedAt ? (
              <>
                <Check size={15} />
                {t("已确认")}
              </>
            ) : (
              t("待确认")
            )}
            {live.provider === "sample"
              ? t(" · 就医记录")
              : live.provider === "manual"
                ? t(" · 手动补充")
                : t(" · 图片识别")}
          </span>
          <div className="card recognition-result">
            <span className="document-placeholder">
              <FileText size={52} strokeWidth={1} />
            </span>
            <div>
              <p>{t("单据类型")}</p>
              <h3>{t(extraction.title || DOC_NAMES[extraction.kind])}</h3>
              {extraction.tests.map((test) => (
                <div key={test.name}>
                  <p>{t("检查项目")}</p>
                  <strong>{t(test.name)}</strong>
                  {test.location && <small>{t(test.location)}</small>}
                </div>
              ))}
              {extraction.medicines.map((m, i) => (
                <div key={i}>
                  <p>{t("药品名称")}</p>
                  <strong>{t(m.name)}</strong>
                  <small>{t(m.dose || "每次用量待补充")}</small>
                </div>
              ))}
              {extraction.targetName && <strong>{t(extraction.targetName)}</strong>}
            </div>
          </div>
          {extraction.summary && <p className="recognition-summary">{t(extraction.summary)}</p>}
          {!live.confirmedAt && (
            <p className="field-help">
              {extraction.kind === "receipt"
                ? t("保存领取信息后，请在拿到正式报告时确认。")
                : extraction.kind === "prescription"
                  ? t("确认后保存为用药草稿，由家人核对。")
                  : extraction.kind === "test_order"
                    ? s.visit.stage === 3 || s.visit.stage === 4
                      ? t("确认后添加检查项目。")
                      : t("先保存单据，到了接诊后再确认检查安排。")
                    : extraction.kind === "report"
                      ? reportTask
                        ? t("确认此项报告已取得。")
                        : t("请家人核对报告对应的检查项目。")
                      : extraction.kind === "payment"
                        ? extraction.paymentStatus === "paid"
                          ? t("请确认对应项目已缴费。")
                          : t("可先保存单据，缴费后再更新进度。")
                        : t("请对照单据确认信息。")}
            </p>
          )}
          {!live.confirmedAt && reportTask && !reportTask.done && (
            <Button
              secondary
              busy={busy}
              onClick={() => act({ type: "testDone", id: reportTask.id })}
            >
              {t("我已做完这项检查")}
            </Button>
          )}
          {mayEdit && (
            <button className="text-link" onClick={() => setEditing(!editing)}>
              {editing ? t("收起详细字段") : t("核对或修改识别信息")}
            </button>
          )}
          {editing && <ExtractionFields value={extraction} onChange={setExtraction} state={s} />}
          {(!live.confirmedAt || canApplyArchived || (mayEdit && editing)) && (
            <Button
              busy={busy}
              disabled={!!reportTask && !reportTask.done}
              onClick={async () => {
                if (
                  await act({
                    type: "confirmDocument",
                    id: live.id,
                    ...(role === "child" ? { extraction } : {}),
                  })
                ) {
                  toast(t("单据已确认"));
                  onClose();
                }
              }}
            >
              {live.confirmedAt
                ? t("补充到就医安排")
                : extraction.kind === "payment" && extraction.paymentStatus === "paid"
                  ? t("确认已缴费")
                  : t("确认信息")}
            </Button>
          )}
          {!live.confirmedAt && (
            <Button
              secondary
              onClick={() => {
                setDoc(null);
                setFile(null);
                setManual(false);
              }}
            >
              {t("重新拍照")}
            </Button>
          )}
          <details className="disclosure-details">
            <summary>{t("查看单据详情")}</summary>
            <div className="document-original">
              {live.url && (
                <a
                  href={live.provider === "sample" ? `${live.url}?lang=${locale}` : live.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={live.provider === "sample" ? `${live.url}?lang=${locale}` : live.url}
                    alt={t(extraction.title || t("单据原图"))}
                  />
                </a>
              )}
              <div className="card detail-list">
                {[
                  [t("类型"), t(DOC_NAMES[extraction.kind])],
                  [t("说明"), t(extraction.notes || "暂无补充")],
                  [
                    t("状态"),
                    live.confirmedAt
                      ? live.applied
                        ? t("已确认并更新安排")
                        : t("已保存材料")
                      : t("待确认"),
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      ) : manual ? (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(undefined, extraction);
          }}
        >
          <ExtractionFields value={extraction} onChange={setExtraction} state={s} />
          <Button type="submit">{t("保存信息")}</Button>
          <Button secondary onClick={() => setManual(false)}>
            {t("返回")}
          </Button>
        </form>
      ) : file ? (
        <div className="form-stack">
          <div className="photo-preview">
            <img src={preview} alt={t("待识别的单据照片")} />
          </div>
          <p className="panel-intro">{t("请确保单据完整、文字清晰。")}</p>
          <Button onClick={() => submit()}>{t("识别单据")}</Button>
          <Button secondary onClick={() => camera.current?.click()}>
            <RotateCcw size={20} />
            {t("重新拍照")}
          </Button>
          <button
            className="text-link"
            onClick={() => {
              setManual(true);
              setExtraction(emptyExtraction());
            }}
          >
            {t("手动补充信息")}
          </button>
        </div>
      ) : (
        <div className="form-stack">
          <div className="upload-intro">
            <span className="upload-icon">
              <FileText size={52} strokeWidth={1.2} />
            </span>
            <p>{t("支持挂号截图、检查单、报告和处方。")}</p>
          </div>
          <Button onClick={() => camera.current?.click()}>
            <Camera size={24} />
            {t("拍摄单据")}
          </Button>
          <Button secondary onClick={() => album.current?.click()}>
            <ImagePlus size={24} />
            {t("从相册选择")}
          </Button>
          {caseMode && (
            <details className="disclosure-details sample-picker">
              <summary>{t("选择已有单据")}</summary>
              <div className="sample-grid">
                {(["test_order", "report", "prescription", "receipt", "payment"] as DocKind[]).map(
                  (kind) => (
                    <button key={kind} onClick={() => submit(kind)}>
                      <FileText size={23} />
                      <span>{t(DOC_NAMES[kind])}</span>
                    </button>
                  ),
                )}
              </div>
            </details>
          )}
          <button
            className="text-link"
            onClick={() => {
              setManual(true);
              setExtraction(emptyExtraction());
            }}
          >
            {t("手动补充信息")}
          </button>
          {!aiConfigured && <p className="source-note">{t("请先在子女端设置中配置模型。")}</p>}
        </div>
      )}
      {error && (
        <div className="upload-error" role="alert">
          <p>{t(error)}</p>
          {file && !manual && !working && (
            <button
              className="text-link"
              onClick={() => {
                setManual(true);
                setDoc(null);
              }}
            >
              {t("手动补充信息")}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
function ExtractionFields({
  value: e,
  onChange,
  state: s,
}: {
  value: Extraction;
  onChange: (v: Extraction) => void;
  state: AppState;
}) {
  const { t } = useLanguage();
  function change<K extends keyof Extraction>(key: K, value: Extraction[K]) {
    onChange({ ...e, [key]: value });
  }
  return (
    <div className="form-stack extraction-fields">
      <Field label={t("单据类型")}>
        <select
          value={e.kind}
          onChange={(event) => {
            const kind = event.target.value as DocKind;
            onChange({ ...e, kind, title: DOC_NAMES[kind] });
          }}
        >
          {Object.entries(DOC_NAMES).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {t(label)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("单据名称")}>
        <input required value={e.title} onChange={(ev) => change("title", ev.target.value)} />
      </Field>
      {e.kind === "test_order" && (
        <>
          {e.tests.map((test, i) => (
            <div key={i} className="inset-form">
              <Field label={t("检查名称")}>
                <input
                  required
                  value={test.name}
                  onChange={(ev) =>
                    change(
                      "tests",
                      e.tests.map((v, n) => (n === i ? { ...v, name: ev.target.value } : v)),
                    )
                  }
                />
              </Field>
              <Field label={t("地点")}>
                <input
                  value={test.location}
                  onChange={(ev) =>
                    change(
                      "tests",
                      e.tests.map((v, n) => (n === i ? { ...v, location: ev.target.value } : v)),
                    )
                  }
                />
              </Field>
            </div>
          ))}
          <button
            type="button"
            className="text-link"
            onClick={() => change("tests", [...e.tests, { name: "", location: "" }])}
          >
            <Plus size={17} />
            {t("添加检查项目")}
          </button>
        </>
      )}
      {(e.kind === "report" || e.kind === "payment") && (
        <Field label={t("对应项目")}>
          <select value={e.targetName} onChange={(ev) => change("targetName", ev.target.value)}>
            <option value="">{t("请核对对应项目")}</option>
            {s.visit.tests.map((test) => (
              <option value={test.name} key={test.id}>
                {t(test.name)}
              </option>
            ))}
            {e.targetName && !s.visit.tests.some((t) => t.name === e.targetName) && (
              <option>{e.targetName}</option>
            )}
          </select>
        </Field>
      )}
      {e.kind === "payment" && (
        <>
          <Field label={t("费用用途")}>
            <select
              value={e.paymentFor}
              onChange={(ev) => change("paymentFor", ev.target.value as Extraction["paymentFor"])}
            >
              <option value="unknown">{t("尚未确认")}</option>
              <option value="test">{t("检查费用")}</option>
              <option value="medicine">{t("药品费用")}</option>
            </select>
          </Field>
          <Field label={t("缴费状态")}>
            <select
              value={e.paymentStatus ?? "unknown"}
              onChange={(ev) =>
                change("paymentStatus", ev.target.value as Extraction["paymentStatus"])
              }
            >
              <option value="unknown">{t("尚未确认")}</option>
              <option value="unpaid">{t("未缴费")}</option>
              <option value="paid">{t("已缴费")}</option>
            </select>
          </Field>
        </>
      )}
      {e.kind === "prescription" && (
        <>
          {e.medicines.map((m, i) => (
            <div key={i} className="inset-form">
              {(
                [
                  ["name", t("药品名称")],
                  ["strength", t("规格")],
                  ["dose", t("每次用量与单位")],
                  ["route", t("服用方式")],
                  ["frequency", t("频次")],
                  ["instructions", t("明确的用法要求")],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    required={key === "name"}
                    value={m[key]}
                    placeholder={t("未注明时留空")}
                    onChange={(ev) =>
                      change(
                        "medicines",
                        e.medicines.map((v, n) => (n === i ? { ...v, [key]: ev.target.value } : v)),
                      )
                    }
                  />
                </Field>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="text-link"
            onClick={() =>
              change("medicines", [
                ...e.medicines,
                { name: "", strength: "", dose: "", route: "", frequency: "", instructions: "" },
              ])
            }
          >
            <Plus size={17} />
            {t("添加药品")}
          </button>
        </>
      )}
      {e.kind === "appointment" &&
        (["hospital", "department", "date", "time", "location"] as const).map((key, i) => (
          <Field label={[t("医院"), t("科室"), t("日期"), t("时段"), t("地点")][i]} key={key}>
            <input value={e[key]} onChange={(ev) => change(key, ev.target.value)} />
          </Field>
        ))}
      <Field label={t("补充说明")}>
        <textarea rows={2} value={e.notes} onChange={(ev) => change("notes", ev.target.value)} />
      </Field>
    </div>
  );
}
