import { Platform } from "react-native";
import { storage } from "./storage";

export const API = process.env.EXPO_PUBLIC_API_URL ?? "https://paisa.auraa-ai.org/api/v1";

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

type Tokens = { access_token: string; refresh_token: string };
let access: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (fn: () => void) => (onSignedOut = fn);

export async function saveTokens(t: Tokens) {
  access = t.access_token;
  await storage.set("rt", t.refresh_token);
}

export async function clearTokens() {
  access = null;
  await storage.del("rt");
}

async function raw(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (!(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth && access) headers.Authorization = `Bearer ${access}`;
  return fetch(`${API}${path}`, { ...init, headers });
}

async function refreshTokens(): Promise<boolean> {
  const rt = await storage.get("rt");
  if (!rt) return false;
  try {
    const r = await raw("/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: rt }) }, false);
    if (!r.ok) return false;
    await saveTokens(await r.json());
    return true;
  } catch {
    return false;
  }
}

export async function call<T = any>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  let r = await raw(path, init, auth);
  if (r.status === 401 && auth) {
    refreshing = refreshing ?? refreshTokens().finally(() => (refreshing = null));
    if (await refreshing) r = await raw(path, init, auth);
    else {
      await clearTokens();
      onSignedOut();
    }
  }
  if (r.status === 204) return undefined as T;
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error ?? "network_error");
  return body as T;
}

export const post = <T = any>(p: string, data: unknown, auth = true) =>
  call<T>(p, { method: "POST", body: JSON.stringify(data) }, auth);

export async function restoreSession(): Promise<boolean> {
  return refreshTokens();
}

export async function uploadReceipt(uri: string) {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("image", blob, "receipt.jpg");
  } else {
    form.append("image", { uri, name: "receipt.jpg", type: "image/jpeg" } as any);
  }
  return call("/expenses/parse-receipt", { method: "POST", body: form });
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email or password is incorrect.",
  email_not_verified: "Please verify your email first.",
  account_temporarily_locked: "Too many attempts. Try again in 15 minutes.",
  invalid_or_expired_code: "That code is wrong or expired.",
  weak_password: "Choose a stronger password (10+ characters, not common).",
  validation_error: "Please check the highlighted details.",
  rate_limited: "Too many requests. Please wait a bit.",
  ai_daily_limit: "Daily AI limit reached. You can still add expenses manually.",
  no_expense_found: "Couldn't find an expense there. Try again or enter it manually.",
  invalid_image: "That image couldn't be read. Try a clearer photo.",
  invalid_google_token: "Google sign-in failed. Please try again.",
};
export const friendly = (e: unknown) => (e instanceof ApiError ? MESSAGES[e.code] ?? "Something went wrong. Please try again." : "Can't reach the server. Check your connection.");
