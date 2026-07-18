import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import hi from "./hi.json";
import { useStore } from "../state/store";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: useStore.getState().lang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

useStore.subscribe((s, prev) => {
  if (s.lang !== prev.lang) void i18n.changeLanguage(s.lang);
});

export default i18n;
