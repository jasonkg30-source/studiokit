import cfg from "./firebase-config.json";

/**
 * Accounts live in Firebase Authentication (email + password); Firestore only
 * keeps the profile that records whether an admin has approved the person.
 *
 * The browser talks to the Identity Toolkit REST API directly because the app
 * has no backend. Every privileged write is checked by Firestore rules against
 * the caller's ID token, so approval can't be bypassed from the browser console.
 */
const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const DOCS = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/default/documents`;

export type Role = "owner" | "member";

export interface Profile {
  uid: string;
  email: string;
  name: string;
  role: Role;
  /** False until an admin approves the sign-up. */
  active: boolean;
  createdAt: number;
}

export interface Session extends Profile {
  idToken: string;
  refreshToken: string;
  /** Epoch ms when the ID token stops working. */
  exp: number;
}

export type Account = Profile;

const SESSION_KEY = "studiokit.session.v2";

const str = (v: string) => ({ stringValue: v });
const bool = (v: boolean) => ({ booleanValue: v });
const num = (v: number) => ({ integerValue: String(v) });

function readError(payload: any): string {
  const code: string = payload?.error?.message ?? "";
  if (code === "EMAIL_EXISTS") return "That email already has an account.";
  if (["EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS", "INVALID_PASSWORD"].includes(code)) {
    return "Wrong email or password.";
  }
  if (code.startsWith("WEAK_PASSWORD")) return "Password must be at least 6 characters.";
  if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") return "Too many attempts. Try again in a few minutes.";
  if (code === "USER_DISABLED") return "This account has been turned off.";
  if (code === "CONFIGURATION_NOT_FOUND") return "Sign-in is not switched on for this project yet.";
  if (code === "PERMISSION_DENIED" || code === "MISSING_PERMISSION") return "Your account can't do that yet.";
  return code ? code.replace(/_/g, " ").toLowerCase() : "Something went wrong.";
}

async function post(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(readError(data));
  return data;
}

function toProfile(uid: string, fields: Record<string, any>): Profile {
  return {
    uid,
    email: fields.email?.stringValue ?? "",
    name: fields.name?.stringValue ?? "",
    role: (fields.role?.stringValue as Role) ?? "member",
    active: fields.active?.booleanValue ?? false,
    createdAt: Number(fields.createdAt?.integerValue ?? 0),
  };
}

/** Reads one profile with the caller's ID token; the rules decide who may. */
export async function loadProfile(uid: string, idToken: string): Promise<Profile | null> {
  const res = await fetch(`${DOCS}/users/${uid}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Could not read your account.");
  const doc = await res.json();
  return toProfile(uid, doc.fields ?? {});
}

function sessionFrom(
  idToken: string,
  refreshToken: string,
  expiresIn: string | number,
  profile: Profile,
): Session {
  return { ...profile, idToken, refreshToken, exp: Date.now() + Number(expiresIn) * 1000 };
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.uid && parsed?.refreshToken ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Creates the auth user and a profile that starts out blocked. The `bootstrap`
 * code is used exactly once, to let the first account become the owner.
 */
export async function signUp(input: {
  email: string;
  name: string;
  password: string;
  bootstrap?: string;
}): Promise<Session> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
  if (input.password.length < 6) throw new Error("Password must be at least 6 characters.");

  const auth = await post(`${IDENTITY}:signUp?key=${encodeURIComponent(cfg.apiKey)}`, {
    email,
    password: input.password,
    returnSecureToken: true,
  });

  const owner = Boolean(input.bootstrap);
  const profile: Profile = {
    uid: auth.localId,
    email,
    name: input.name.trim() || email,
    role: owner ? "owner" : "member",
    active: owner,
    createdAt: Date.now(),
  };

  const res = await fetch(`${DOCS}/users/${auth.localId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` },
    body: JSON.stringify({
      fields: {
        email: str(email),
        name: str(profile.name),
        role: str(profile.role),
        active: bool(profile.active),
        createdAt: num(profile.createdAt),
        ...(owner ? { bootstrap: str(input.bootstrap!) } : {}),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(owner ? "That owner setup link has expired." : "Could not create your account.");
  }

  const session = sessionFrom(auth.idToken, auth.refreshToken, auth.expiresIn, profile);
  saveSession(session);
  return session;
}

export async function signIn(email: string, password: string): Promise<Session> {
  const auth = await post(`${IDENTITY}:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`, {
    email: email.trim().toLowerCase(),
    password,
    returnSecureToken: true,
  });
  const profile = await loadProfile(auth.localId, auth.idToken);
  if (!profile) throw new Error("Your account has no profile yet. Ask an admin to approve you.");
  const session = sessionFrom(auth.idToken, auth.refreshToken, auth.expiresIn, profile);
  saveSession(session);
  return session;
}

/** Swaps the refresh token for a fresh ID token and re-reads the profile. */
export async function refreshSession(session: Session): Promise<Session | null> {
  try {
    const res = await fetch(`${TOKEN_URL}?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = await res.json();
    const profile = await loadProfile(session.uid, data.id_token);
    if (!profile) {
      clearSession();
      return null;
    }
    const next = sessionFrom(data.id_token, data.refresh_token, data.expires_in, profile);
    saveSession(next);
    return next;
  } catch {
    // Offline or transient: keep the cached session, the rules still reject
    // whatever the token is no longer allowed to do.
    return session;
  }
}

async function adminFetch(session: Session, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${DOCS}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.idToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

export async function listAccounts(session: Session): Promise<Account[]> {
  const res = await adminFetch(session, ":runQuery", {
    method: "POST",
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "users" }], limit: 300 } }),
  });
  if (!res.ok) throw new Error("Only admins can see the account list.");
  const rows = await res.json();
  return rows
    .filter((r: any) => r.document)
    .map((r: any) => toProfile(r.document.name.split("/").pop(), r.document.fields ?? {}))
    .sort((a: Account, b: Account) => b.createdAt - a.createdAt);
}

export async function patchAccount(
  session: Session,
  uid: string,
  patch: Partial<Pick<Account, "active" | "role" | "name">>,
): Promise<void> {
  const fields: Record<string, any> = {};
  const mask: string[] = [];
  if (patch.active !== undefined) {
    fields.active = bool(patch.active);
    mask.push("active");
  }
  if (patch.role !== undefined) {
    fields.role = str(patch.role);
    mask.push("role");
  }
  if (patch.name !== undefined) {
    fields.name = str(patch.name);
    mask.push("name");
  }
  const query = mask.map((m) => `updateMask.fieldPaths=${m}`).join("&");
  const res = await adminFetch(session, `/users/${uid}?${query}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error("Only admins can change accounts.");
}

export async function deleteAccount(session: Session, uid: string): Promise<void> {
  const res = await adminFetch(session, `/users/${uid}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Only admins can remove accounts.");
}
