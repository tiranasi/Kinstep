"use client";
import { useLanguage } from "./language";
import { useEffect, useRef } from "react";
import { ChevronRight, LoaderCircle, X } from "lucide-react";
import type { Locale } from "@/lib/types";
export function Button({
  children,
  secondary = false,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${secondary ? "secondary" : "primary"} ${props.className || ""}`}
    >
      {busy && <LoaderCircle size={20} className="spin" />}
      {children}
    </button>
  );
}
export function Row({
  icon,
  title,
  detail,
  onClick,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  detail?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button className={`disclosure ${className}`} onClick={onClick}>
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-copy">
        <span>{title}</span>
        {detail && <small>{detail}</small>}
      </span>
      <ChevronRight className="chevron" size={21} />
    </button>
  );
}
export function Sheet({
  title,
  onClose,
  children,
  elder = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  elder?: boolean;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      el?.close();
    };
  }, []);
  return (
    <dialog
      className={`sheet ${elder ? "elder-sheet" : ""}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <div className="sheet-handle" />
      <header className="sheet-header">
        <h2>{title}</h2>
        <button className="icon-button close" aria-label={t("关闭")} onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function speak(text: string, locale?: Locale) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang =
    locale === "en" || (!locale && document.documentElement.lang === "en") ? "en-US" : "zh-CN";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}
