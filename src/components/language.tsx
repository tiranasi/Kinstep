"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/types";
import { translate } from "@/lib/translations";

const Language = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: "zh",
  setLocale: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");
  useEffect(() => {
    if (localStorage.getItem("kinstep-language") === "en") setLocale("en");
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
  }, [locale]);
  return (
    <Language.Provider
      value={{
        locale,
        setLocale: (value) => {
          localStorage.setItem("kinstep-language", value);
          setLocale(value);
        },
      }}
    >
      {children}
    </Language.Provider>
  );
}

export function useLanguage() {
  const { locale, setLocale } = useContext(Language);
  return { locale, setLocale, t: (text: string) => translate(locale, text) };
}

export function LanguageSelect() {
  const { locale, setLocale } = useLanguage();
  return (
    <select
      className="language-select"
      aria-label="语言 / Language"
      value={locale}
      onChange={(e) => setLocale(e.target.value === "en" ? "en" : "zh")}
    >
      <option value="zh">简体中文</option>
      <option value="en">English</option>
    </select>
  );
}
