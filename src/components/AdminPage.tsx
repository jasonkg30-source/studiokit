import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, RefreshCw, Shield, Trash2, X } from "lucide-react";
import type { Session } from "../auth";
import { deleteAccount, listAccounts, patchAccount, type Account, type Role } from "../auth";

interface Props {
  session: Session;
  onClose: () => void;
}

const fmt = (ts: number) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

/**
 * Accounts are created by the person who wants one; this screen is where an
 * admin approves them. Nobody can approve from the browser console because the
 * rules check the admin's ID token, not anything the client claims.
 */
export default function AdminPage({ session, onClose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setAccounts(await listAccounts(session));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const approve = async (a: Account) => {
    setBusyId(a.uid);
    try {
      await patchAccount(session, a.uid, { active: true });
      setAccounts((prev) => prev.map((x) => (x.uid === a.uid ? { ...x, active: true } : x)));
      flash(`${a.name || a.email} can now build dashboards`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  };

  const toggleActive = async (a: Account) => {
    setBusyId(a.uid);
    try {
      await patchAccount(session, a.uid, { active: !a.active });
      setAccounts((prev) => prev.map((x) => (x.uid === a.uid ? { ...x, active: !a.active } : x)));
      flash(a.active ? `${a.email} is turned off` : `${a.email} is active again`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  };

  const toggleRole = async (a: Account) => {
    const next: Role = a.role === "owner" ? "member" : "owner";
    setBusyId(a.uid);
    try {
      await patchAccount(session, a.uid, { role: next });
      setAccounts((prev) => prev.map((x) => (x.uid === a.uid ? { ...x, role: next } : x)));
      flash(`${a.email} is now ${next === "owner" ? "an admin" : "a member"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (a: Account) => {
    if (a.uid === session.uid) return;
    if (!window.confirm(`Remove ${a.email}? They lose access right away.`)) return;
    setBusyId(a.uid);
    try {
      await deleteAccount(session, a.uid);
      setAccounts((prev) => prev.filter((x) => x.uid !== a.uid));
      flash("Account removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the account.");
    } finally {
      setBusyId("");
    }
  };

  const pending = accounts.filter((a) => !a.active);
  const approved = accounts.filter((a) => a.active);

  const row = (a: Account, isPending: boolean) => (
    <li key={a.uid} className={a.active ? "person" : "person off"}>
      <div className="person-main">
        <div className="person-name">
          {a.name || "—"}
          {a.role === "owner" && (
            <span className="tag">
              <Shield size={11} /> admin
            </span>
          )}
          {!a.active && <span className="tag muted">pending</span>}
          {a.uid === session.uid && <span className="tag muted">you</span>}
        </div>
        <div className="person-mail">{a.email}</div>
        <div className="person-meta">{isPending ? "Requested" : "Joined"} {fmt(a.createdAt)}</div>
      </div>
      <div className="person-actions">
        {isPending ? (
          <>
            <button className="btn primary slim" onClick={() => approve(a)} disabled={busyId === a.uid}>
              {busyId === a.uid ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
              Approve
            </button>
            <button className="icon-btn danger" title="Reject" onClick={() => remove(a)} disabled={busyId === a.uid}>
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              className="icon-btn"
              title={a.role === "owner" ? "Make member" : "Make admin"}
              onClick={() => toggleRole(a)}
              disabled={busyId === a.uid || a.uid === session.uid}
            >
              <Shield size={14} />
            </button>
            <button
              className="icon-btn"
              title="Turn off"
              onClick={() => toggleActive(a)}
              disabled={busyId === a.uid || a.uid === session.uid}
            >
              <X size={14} />
            </button>
            <button
              className="icon-btn danger"
              title="Remove"
              onClick={() => remove(a)}
              disabled={busyId === a.uid || a.uid === session.uid}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <div className="admin-page">
      <header className="admin-head">
        <button className="btn ghost" onClick={onClose}>
          <ArrowLeft size={15} /> Back to dashboards
        </button>
        <div className="admin-title">
          <h1>Team access</h1>
          <p>
            {approved.length} approved · {pending.length} waiting · signed in as {session.email}
          </p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
        </button>
      </header>

      <div className="admin-grid">
        <section className="panel">
          <h2>Waiting for approval</h2>
          <p className="hint">
            Anyone can create an account, but it stays blocked until you approve it here. Send them
            the link to this site — they sign up, you approve, they get in.
          </p>
          {loading ? (
            <p className="hint">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="hint">Nobody is waiting.</p>
          ) : (
            <ul className="people">{pending.map((a) => row(a, true))}</ul>
          )}
        </section>

        <section className="panel">
          <h2>Approved people</h2>
          {error && <div className="error-box">{error}</div>}
          {loading ? (
            <p className="hint">Loading…</p>
          ) : approved.length === 0 ? (
            <p className="hint">No approved accounts yet.</p>
          ) : (
            <ul className="people">{approved.map((a) => row(a, false))}</ul>
          )}
        </section>
      </div>

      {notice && <div className="admin-toast">{notice}</div>}
    </div>
  );
}
