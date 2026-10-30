import cfg from "./firebase-config.json";

const BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/default/documents`;
const USERS = `${BASE}/users`;
const ITERATIONS = 310000;
const SESSION_KEY = "studiokit.session";
const SESSION_DAYS = 7;

export type Role = "owner" | "member";

export interface Account {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: number;
}

export interface Session {
  id: string;
  email: string;
  name: string;
  role: Role;
  exp: number;
}

const toB64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    256,
  );
  return toB64Url(new Uint8Array(bits));
}

const str = (v: string) => ({ stringValue: v });
const bool = (v: boolean) => ({ booleanValue: v });
const num = (v: number) => ({ integerValue: String(v) });

function toAccount(name: string, f: Record<string, any>): Account {
  return {
    id: name.split("/").pop() ?? "",
    email: f.email?.stringValue ?? "",
    name: f.name?.stringValue ?? "",
    role: (f.role?.stringValue as Role) ?? "member",
    active: f.active?.booleanValue ?? true,
    createdAt: Number(f.createdAt?.integerValue ?? 0),
  };
}

export async function listAccounts(): Promise<Account[]> {
  const res = await fetch(`${USERS}?key=${encodeURIComponent(cfg.apiKey)}&pageSize=200`);
  if (!res.ok) throw new Error("Could not load accounts.");
  const data = await res.json();
  const docs: any[] = data.documents ?? [];
  return docs
    .map((d) => toAccount(d.name, d.fields ?? {}))
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function findByEmail(email: string): Promise<{ account: Account; salt: string; hash: string } | null> {
  const res = await fetch(`${BASE}:runQuery?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: { fieldFilter: { field: { fieldPath: "email" }, op: "EQUAL", value: str(email.toLowerCase()) } },
        limit: 1,
      },
    }),
  });
  if (!res.ok) throw new Error("Could not reach the account service.");
  const rows = await res.json();
  const doc = rows.find((r: any) => r.document)?.document;
  if (!doc) return null;
  return {
    account: toAccount(doc.name, doc.fields ?? {}),
    salt: doc.fields?.salt?.stringValue ?? "",
    hash: doc.fields?.hash?.stringValue ?? "",
  };
}

export async function createAccount(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
}): Promise<Account> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
  if (input.password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (await findByEmail(email)) throw new Error("That email already has an account.");

  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const hash = await hashPassword(input.password, salt);
  const res = await fetch(`${USERS}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        email: str(email),
        name: str(input.name.trim()),
        role: str(input.role),
        active: bool(true),
        salt: str(toB64Url(salt)),
        hash: str(hash),
        createdAt: num(Date.now()),
      },
    }),
  });
  if (!res.ok) throw new Error("Could not create the account.");
  const doc = await res.json();
  return toAccount(doc.name, doc.fields);
}

export async function setPassword(id: string, password: string): Promise<void> {
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const hash = await hashPassword(password, salt);
  const res = await fetch(
    `${USERS}/${id}?key=${encodeURIComponent(cfg.apiKey)}&updateMask.fieldPaths=salt&updateMask.fieldPaths=hash`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { salt: str(toB64Url(salt)), hash: str(hash) } }),
    },
  );
  if (!res.ok) throw new Error("Could not update the password.");
}

export async function patchAccount(id: string, patch: Record<string, string | boolean>): Promise<void> {
  const fields: Record<string, unknown> = {};
  const masks: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields[k] = typeof v === "boolean" ? bool(v) : str(v);
    masks.push(`updateMask.fieldPaths=${k}`);
  }
  const res = await fetch(`${USERS}/${id}?key=${encodeURIComponent(cfg.apiKey)}&${masks.join("&")}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error("Could not update the account.");
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`${USERS}/${id}?key=${encodeURIComponent(cfg.apiKey)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Could not delete the account.");
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s?.id || s.exp < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function signIn(email: string, password: string): Promise<Session> {
  const found = await findByEmail(email.trim().toLowerCase());
  if (!found) throw new Error("No account with that email.");
  if (!found.account.active) throw new Error("This account has been turned off.");
  const hash = await hashPassword(password, fromB64Url(found.salt));
  if (hash !== found.hash) throw new Error("Wrong password.");

  const session: Session = {
    id: found.account.id,
    email: found.account.email,
    name: found.account.name,
    role: found.account.role,
    exp: Date.now() + SESSION_DAYS * 86400000,
  };
  saveSession(session);
  return session;
}

/** Re-checks the account on load so a disabled user cannot keep using a cached session. */
export async function refreshSession(session: Session): Promise<Session | null> {
  const res = await fetch(`${USERS}/${session.id}?key=${encodeURIComponent(cfg.apiKey)}`);
  if (!res.ok) {
    clearSession();
    return null;
  }
  const doc = await res.json();
  const account = toAccount(doc.name, doc.fields ?? {});
  if (!account.active) {
    clearSession();
    return null;
  }
  const next: Session = { ...session, email: account.email, name: account.name, role: account.role };
  saveSession(next);
  return next;
}
