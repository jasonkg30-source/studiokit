import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteShare,
  listShares,
  rememberedLink,
  rememberLink,
  uidFromToken,
  updateShare,
} from "../shortlink";

type Call = { url: string; method: string; body: unknown };

const calls: Call[] = [];
let handler: (url: string, method: string, body: unknown) => { status: number; json?: unknown } = () => ({
  status: 200,
  json: {},
});

const store = new Map<string, string>();

beforeEach(() => {
  calls.length = 0;
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const result = handler(url, method, body);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.json ?? {},
    } as Response;
  });
});

const token = (payload: Record<string, unknown>) => {
  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "none" })}.${enc(payload)}.sig`;
};

const idToken = token({ user_id: "uid-owner" });

describe("uidFromToken", () => {
  it("reads the uid out of the JWT payload without verifying it", () => {
    expect(uidFromToken(idToken)).toBe("uid-owner");
  });

  it("returns an empty string for junk instead of throwing", () => {
    expect(uidFromToken("not-a-token")).toBe("");
  });
});

describe("listShares", () => {
  it("queries only the caller's links and sorts newest first", async () => {
    handler = () => ({
      status: 200,
      json: [
        {
          document: {
            name: "projects/p/databases/default/documents/shares/old",
            fields: { t: { integerValue: "1000" }, l: { stringValue: "Older" }, o: { stringValue: "uid-owner" } },
          },
        },
        { readTime: "2026-01-01T00:00:00Z" },
        {
          document: {
            name: "projects/p/databases/default/documents/shares/new",
            fields: {
              t: { integerValue: "2000" },
              l: { stringValue: "Q4 revenue" },
              e: { integerValue: "9999999999999" },
              m: { stringValue: "pw" },
              n: { integerValue: "3" },
            },
          },
        },
      ],
    });

    const shares = await listShares(idToken);

    expect(shares.map((share) => share.id)).toEqual(["new", "old"]);
    expect(shares[0]).toMatchObject({ title: "Q4 revenue", password: true, parts: 3, expiresAt: 9999999999999 });
    expect(shares[1]).toMatchObject({ title: "Older", password: false, parts: 0, expiresAt: null });

    const query = calls[0].body as { structuredQuery: { where: { fieldFilter: { value: { stringValue: string } } } } };
    expect(calls[0].url).toContain(":runQuery");
    expect(query.structuredQuery.where.fieldFilter.value.stringValue).toBe("uid-owner");
  });

  it("surfaces an expired session instead of an empty list", async () => {
    handler = () => ({ status: 403, json: {} });
    await expect(listShares(idToken)).rejects.toThrow(/session expired/i);
  });
});

describe("updateShare", () => {
  it("patches only the label and leaves the ciphertext alone", async () => {
    handler = () => ({ status: 200 });
    await updateShare("abc", idToken, { title: "  Investor view  " });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("updateMask.fieldPaths=l");
    expect(calls[0].url).not.toContain("updateMask.fieldPaths=e");
    expect(calls[0].body).toEqual({ fields: { l: { stringValue: "Investor view" } } });
  });

  it("clears the label by leaving the field out of the patch", async () => {
    handler = () => ({ status: 200 });
    await updateShare("abc", idToken, { title: "" });
    expect(calls[0].body).toEqual({ fields: {} });
    expect(calls[0].url).toContain("updateMask.fieldPaths=l");
  });

  it("reports a rejected update", async () => {
    handler = () => ({ status: 403 });
    await expect(updateShare("abc", idToken, { title: "x" })).rejects.toThrow(/owner/i);
  });
});

describe("deleteShare", () => {
  it("removes every part before the manifest", async () => {
    handler = (_url, method) => {
      if (method === "DELETE") return { status: 200 };
      return { status: 200, json: { fields: { n: { integerValue: "2" } } } };
    };

    await deleteShare("shr", idToken);

    const deletes = calls.filter((call) => call.method === "DELETE").map((call) => call.url);
    expect(deletes).toHaveLength(3);
    expect(deletes[0]).toContain("/parts/0");
    expect(deletes[1]).toContain("/parts/1");
    expect(deletes[2]).toContain("/shares/shr?");
    expect(calls[0].method).toBe("GET");
  });

  it("stops before deleting the manifest when a part cannot be removed", async () => {
    handler = (url, method) => {
      if (method === "DELETE" && url.includes("/parts/1")) return { status: 500 };
      if (method === "DELETE") return { status: 200 };
      return { status: 200, json: { fields: { n: { integerValue: "2" } } } };
    };

    await expect(deleteShare("shr", idToken)).rejects.toThrow(/every part/i);
    expect(calls.some((call) => call.method === "DELETE" && call.url.includes("/shares/shr?"))).toBe(false);
  });

  it("still deletes a link whose manifest is already gone", async () => {
    handler = (_url, method) => (method === "GET" ? { status: 404 } : { status: 404 });
    await expect(deleteShare("gone", idToken)).resolves.toBeUndefined();
  });
});

describe("remembered links", () => {
  it("keeps the URL fragment so the link can be copied again on this device", () => {
    rememberLink("abc", "https://app/#s=abc&k=secret");
    expect(rememberedLink("abc")).toBe("https://app/#s=abc&k=secret");
    expect(rememberedLink("other")).toBeNull();
  });
});
