import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "officer" | "enterprise";

interface AuthState {
  token: string | null;
  role: Role | null;
  enterpriseId: number | null;
  displayName: string;
  lang: "en" | "hi";
  online: boolean;
  login: (t: { token: string; role: Role; enterprise_id: number | null; display_name: string }) => void;
  logout: () => void;
  setLang: (l: "en" | "hi") => void;
  setOnline: (o: boolean) => void;
}

export const useStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      enterpriseId: null,
      displayName: "",
      lang: "en",
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      login: (t) =>
        set({
          token: t.token,
          role: t.role,
          enterpriseId: t.enterprise_id,
          displayName: t.display_name,
        }),
      logout: () => set({ token: null, role: null, enterpriseId: null, displayName: "" }),
      setLang: (lang) => set({ lang }),
      setOnline: (online) => set({ online }),
    }),
    {
      name: "mira-auth",
      partialize: (s) => ({
        token: s.token, role: s.role, enterpriseId: s.enterpriseId,
        displayName: s.displayName, lang: s.lang,
      }),
    },
  ),
);

if (typeof window !== "undefined") {
  window.addEventListener("online", () => useStore.getState().setOnline(true));
  window.addEventListener("offline", () => useStore.getState().setOnline(false));
}
