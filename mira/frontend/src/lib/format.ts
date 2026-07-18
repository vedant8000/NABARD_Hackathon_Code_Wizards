/** Formatting helpers — Indian digit grouping, months, bands. */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function money(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const neg = x < 0;
  return `${neg ? "−" : ""}₹${inr.format(Math.abs(Math.round(x)))}`;
}

/** Compact: ₹1.2L / ₹45k for chart axes */
export function moneyShort(x: number): string {
  const neg = x < 0 ? "−" : "";
  const a = Math.abs(x);
  if (a >= 1e7) return `${neg}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${neg}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${neg}₹${Math.round(a / 1e3)}k`;
  return `${neg}₹${Math.round(a)}`;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_HI = ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सितं", "अक्टू", "नवं", "दिसं"];

/** "2026-07" → "Jul 26" / "जुला 26" */
export function monthLabel(ym: string, lang: string = "en"): string {
  const [y, m] = ym.split("-").map(Number);
  const names = lang === "hi" ? MONTHS_HI : MONTHS_EN;
  if (!y || !m) return ym;
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

export function dateLabel(iso: string, lang: string = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN",
    { day: "numeric", month: "short" });
}

export type Band = "green" | "amber" | "red";

export const BAND_COLOR: Record<Band, string> = {
  green: "#16a34a", amber: "#d97706", red: "#dc2626",
};
export const BAND_SOFT: Record<Band, string> = {
  green: "#dcfce7", amber: "#fef3c7", red: "#fee2e2",
};
export const BAND_ICON: Record<Band, string> = {
  green: "✓", amber: "!", red: "⚠",
};

export const SECTOR_ICON: Record<string, string> = {
  dairy: "🥛", poultry: "🐔", food_processing: "🍲",
  handicrafts: "🧶", rural_retail: "🛒",
};

/** sector → (output commodity they sell, input commodity they buy) */
export const SECTOR_COMMODITIES: Record<string, { out: string; inp: string }> = {
  dairy: { out: "milk", inp: "fodder" },
  poultry: { out: "broiler", inp: "feed" },
  food_processing: { out: "processed_food", inp: "veg_index" },
  handicrafts: { out: "craft_goods", inp: "raw_craft" },
  rural_retail: { out: "retail_basket", inp: "wholesale_index" },
};

export const COMMODITY_UNIT: Record<string, string> = {
  broiler: "/kg", feed: "/qtl", milk: "/L", fodder: "/qtl",
  veg_index: "/qtl", maize: "/qtl", soymeal: "/qtl",
};

export function commodityLabel(c: string, lang = "en"): string {
  const en: Record<string, string> = {
    milk: "Milk", fodder: "Fodder", broiler: "Broiler", feed: "Feed",
    processed_food: "Processed food", veg_index: "Vegetables",
    craft_goods: "Craft goods", raw_craft: "Raw material",
    retail_basket: "Retail basket", wholesale_index: "Wholesale",
    maize: "Maize", soymeal: "Soymeal",
  };
  const hi: Record<string, string> = {
    milk: "दूध", fodder: "चारा", broiler: "ब्रॉयलर", feed: "दाना",
    processed_food: "खाद्य", veg_index: "सब्ज़ी",
    craft_goods: "शिल्प", raw_craft: "कच्चा माल",
    retail_basket: "खुदरा", wholesale_index: "थोक",
    maize: "मक्का", soymeal: "सोयामील",
  };
  return (lang === "hi" ? hi : en)[c] ?? c;
}

export function sectorLabel(s: string, lang = "en"): string {
  const en: Record<string, string> = {
    dairy: "Dairy", poultry: "Poultry", food_processing: "Food processing",
    handicrafts: "Handicrafts", rural_retail: "Rural retail",
  };
  const hi: Record<string, string> = {
    dairy: "डेयरी", poultry: "मुर्गी पालन", food_processing: "खाद्य प्रसंस्करण",
    handicrafts: "हस्तशिल्प", rural_retail: "ग्रामीण दुकान",
  };
  return (lang === "hi" ? hi : en)[s] ?? s;
}
