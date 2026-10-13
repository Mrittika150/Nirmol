"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AqiLevel } from "./aqi";

export type Lang = "bn" | "en";

const STRINGS = {
  bn: {
    tagline: "বাতাস জানুন, নিরাপদ থাকুন",
    useMyLocation: "আমার অবস্থান",
    locating: "অবস্থান খোঁজা হচ্ছে…",
    locationDenied: "অবস্থান পাওয়া যায়নি, তালিকা থেকে বেছে নিন।",
    myLocation: "আমার অবস্থান",
    pm25Now: "এখন PM2.5",
    aqiLabel: "AQI (US EPA, ঘণ্টাভিত্তিক)",
    updated: "হালনাগাদ",
    minutesAgo: (m: number) => `${toBn(m)} মিনিট আগে`,
    hoursAgo: (h: number) => `${toBn(h)} ঘণ্টা আগে`,
    temperature: "তাপমাত্রা",
    humidity: "আর্দ্রতা",
    wind: "বাতাস",
    forecastTitle: "আগামী ২৪ ঘণ্টার পূর্বাভাস",
    likelyRange: "সম্ভাব্য পরিসর",
    peak: "সর্বোচ্চ",
    lowest: "সর্বনিম্ন",
    at: "সময়",
    planTrip: "যাত্রার সময় ঠিক করুন",
    reportPollution: "দূষণ রিপোর্ট করুন",
    comingSoon: "শীঘ্রই আসছে",
    sourceNirmol: "মডেল প্রাক্কলন — নির্মল (CAMS সংশোধিত)",
    sourceCams: "মডেল প্রাক্কলন — CAMS (Copernicus)",
    camsWarning:
      "বৈশ্বিক মডেল বাংলাদেশে শীতকালীন দূষণ প্রায়ই কম দেখায়। ঢাকায় ২০২২–২৫ সালের শীতে প্রকৃত গড় ছিল CAMS-এর প্রায় দ্বিগুণ। প্রকৃত মাত্রা বেশি হতে পারে।",
    whatIsThis: "এই তথ্য কোথা থেকে?",
    sourceExplain:
      "এটি সরাসরি পরিমাপ নয়, মডেলের হিসাব। ঢাকায় নির্মলের নিজস্ব মডেল মার্কিন দূতাবাসের পরিমাপের সাথে মিলিয়ে CAMS-এর ভুল সংশোধন করে।",
    error: "এই মুহূর্তে বায়ুর তথ্য পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা করুন",
    unavailable: "তথ্য নেই",
    notMedical: "এটি সাধারণ পরামর্শ, চিকিৎসা পরামর্শ নয়।",
    levels: {
      good: "ভালো",
      moderate: "মাঝারি",
      usg: "সংবেদনশীলদের জন্য অস্বাস্থ্যকর",
      unhealthy: "অস্বাস্থ্যকর",
      very_unhealthy: "খুব অস্বাস্থ্যকর",
      hazardous: "বিপজ্জনক",
    } satisfies Record<AqiLevel, string>,
    advice: {
      good: "বাইরে স্বাভাবিক কাজকর্ম করা যায়।",
      moderate: "বেশিরভাগ মানুষের জন্য ঠিক আছে। খুব সংবেদনশীল হলে দীর্ঘ পরিশ্রম কমান।",
      usg: "শিশু, বয়স্ক ও শ্বাসকষ্টের রোগীরা বাইরে দীর্ঘ পরিশ্রম কমান।",
      unhealthy: "বাইরে সময় কমান, বাইরে গেলে ভালো মানের মাস্ক (N95/KN95) পরুন।",
      very_unhealthy: "অপ্রয়োজনে বাইরে যাবেন না। জানালা বন্ধ রাখুন, বাইরে গেলে N95 মাস্ক পরুন।",
      hazardous: "সবাই ঘরের ভেতরে থাকুন। বাইরে যেতেই হলে N95 মাস্ক পরুন ও সময় খুব কম রাখুন।",
    } satisfies Record<AqiLevel, string>,
  },
  en: {
    tagline: "Know your air, stay safe",
    useMyLocation: "My location",
    locating: "Finding your location…",
    locationDenied: "Couldn't get your location. Pick a place from the list.",
    myLocation: "My location",
    pm25Now: "PM2.5 now",
    aqiLabel: "AQI (US EPA, hourly)",
    updated: "Updated",
    minutesAgo: (m: number) => `${m} min ago`,
    hoursAgo: (h: number) => `${h} h ago`,
    temperature: "Temperature",
    humidity: "Humidity",
    wind: "Wind",
    forecastTitle: "Next 24 hours",
    likelyRange: "Likely range",
    peak: "Peak",
    lowest: "Lowest",
    at: "at",
    planTrip: "Plan my trip",
    reportPollution: "Report pollution",
    comingSoon: "Coming soon",
    sourceNirmol: "Model estimate — Nirmol (CAMS corrected)",
    sourceCams: "Model estimate — CAMS (Copernicus)",
    camsWarning:
      "Global models often underestimate winter pollution in Bangladesh. In Dhaka's 2022–25 winters, measured levels averaged about twice CAMS. Actual levels may be higher.",
    whatIsThis: "Where does this come from?",
    sourceExplain:
      "This is a model estimate, not a direct measurement. In Dhaka, Nirmol's own model corrects CAMS using past US Embassy measurements.",
    error: "Air-quality data is unavailable right now. Please try again shortly.",
    retry: "Try again",
    unavailable: "No data",
    notMedical: "General guidance, not medical advice.",
    levels: {
      good: "Good",
      moderate: "Moderate",
      usg: "Unhealthy for sensitive groups",
      unhealthy: "Unhealthy",
      very_unhealthy: "Very unhealthy",
      hazardous: "Hazardous",
    } satisfies Record<AqiLevel, string>,
    advice: {
      good: "Normal outdoor activity is fine.",
      moderate: "Fine for most people. If you are very sensitive, reduce long exertion outdoors.",
      usg: "Children, older adults and people with breathing problems should reduce long exertion outdoors.",
      unhealthy: "Limit time outdoors. Wear a good mask (N95/KN95) when you go out.",
      very_unhealthy: "Avoid going out unless necessary. Keep windows closed; wear an N95 outside.",
      hazardous: "Everyone should stay indoors. If you must go out, wear an N95 and keep it brief.",
    } satisfies Record<AqiLevel, string>,
  },
};

export type Strings = (typeof STRINGS)["en"];

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export function toBn(n: number | string): string {
  return String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

type Ctx = { lang: Lang; t: Strings; setLang: (l: Lang) => void; num: (n: number | string) => string };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("bn");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nirmol.lang");
      if (saved === "bn" || saved === "en") setLangState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("nirmol.lang", l);
    } catch {}
  };

  const value: Ctx = {
    lang,
    t: STRINGS[lang] as Strings,
    setLang,
    num: (n) => (lang === "bn" ? toBn(n) : String(n)),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
