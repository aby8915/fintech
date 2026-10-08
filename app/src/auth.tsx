import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { call, clearTokens, post, restoreSession, saveTokens, setSignedOutHandler } from "./api";

type Status = "loading" | "in" | "out";
type Me = { id: string; email: string; name: string };
type Ctx = {
  status: Status;
  me: Me | null;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  verifyEmail(email: string, otp: string): Promise<void>;
  googleLogin(idToken: string): Promise<void>;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);

  const loadMe = useCallback(async () => {
    setMe(await call<Me>("/auth/me"));
    setStatus("in");
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => {
      setMe(null);
      setStatus("out");
    });
    (async () => {
      if (await restoreSession()) await loadMe().catch(() => setStatus("out"));
      else setStatus("out");
    })();
  }, [loadMe]);

  const value = useMemo<Ctx>(
    () => ({
      status,
      me,
      async login(email, password) {
        await saveTokens(await post("/auth/login", { email, password }, false));
        await loadMe();
      },
      async register(name, email, password) {
        await post("/auth/register", { name, email, password }, false);
      },
      async verifyEmail(email, otp) {
        await saveTokens(await post("/auth/verify-email", { email, otp }, false));
        await loadMe();
      },
      async googleLogin(idToken) {
        await saveTokens(await post("/auth/google", { id_token: idToken }, false));
        await loadMe();
      },
      async logout() {
        const { storage } = await import("./storage");
        const rt = await storage.get("rt");
        if (rt) await post("/auth/logout", { refresh_token: rt }, false).catch(() => {});
        await clearTokens();
        setMe(null);
        setStatus("out");
      },
      async deleteAccount() {
        await call("/auth/me", { method: "DELETE" });
        await clearTokens();
        setMe(null);
        setStatus("out");
      },
    }),
    [status, me, loadMe]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
