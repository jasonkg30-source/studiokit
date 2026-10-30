import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, RefreshCw, Shield, Trash2, UserPlus, X } from "lucide-react";
import type { Session } from "../auth";
import { createAccount, deleteAccount, listAccounts, patchAccount, setPassword, type Account, type Role } from "../auth";

interface Props {
  session: Session;
  onClose: () => void;
}

const fmt = (ts: number) => (ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

export default function AdminPage({ session, onClose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [role, setRole] = useState<Role>("member");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setAccounts(await listAccounts());
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

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const account = await createAccount({ email, name, password: newPw, role });
      setAccounts((prev) => [...prev, account]);
      setName("");
      setEmail("");
      setNewPw("");
      setRole("member");
      flash(`${account.name || account.email} can now sign in`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (a: Account) => {
    setBusyId(a.id);
    try {
      await patchAccount(a.id, { active: !a.active });
      setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, active: !a.active } : x)));
      flash(a.active ? `${a.email} is turned off` : `${a.email} is active again`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  };

  const toggleRole = async (a: Account) => {
    const next: Role = a.role === "owner" ? "member" : "owner";
    setBusyId(a.id);
    try {
      await patchAccount(a.id, { role: next });
      setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, role: next } : x)));
      flash(`${a.email} is now ${next === "owner" ? "an admin" : "a member"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  };

  const resetPassword = async (a: Account) => {
    const next = window.prompt(`New password for ${a.email} (6+ characters)`);
    if (!next) return;
    setBusyId(a.id);
    try {
      await setPassword(a.id, next);
      flash("Password updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (a: Account) => {
    if (a.id === session.id) return;
    if (!window.confirm(`Delete the account for ${a.email}? This cannot be undone.`)) return;
    setBusyId(a.id);
    try {
      await deleteAccount(a.id);
      setAccounts((prev) => prev.filter((x) => x.id !== a.id));
      flash("Account deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-head">
        <button className="btn ghost" onClick={onClose}>
          <ArrowLeft size={15} /> Back to dashboards
        </button>
        <div className="admin-title">
          <h1>Team access</h1>
          <p>{accounts.length} account{accounts.length === 1 ? "" : "s"} · signed in as {session.email}</p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
        </button>
      </header>

      <div className="admin-grid">
        <section className="panel">
          <h2>
            <UserPlus size={15} /> Add someone
          </h2>
          <form className="admin-form" onSubmit={add}>
            <label className="auth-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" required />
            </label>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@company.com"
                required
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input
                type="text"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 6 characters"
                required
              />
            </label>
            <label className="auth-field">
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="member">Member — dashboards only</option>
                <option value="owner">Admin — can manage accounts</option>
              </select>
            </label>
            <button className="btn primary" type="submit" disabled={creating}>
              {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              Create account
            </button>
            <p className="hint">Share the password with them directly. They can change it later from your request.</p>
          </form>
        </section>

        <section className="panel">
          <h2>People</h2>
          {error && <div className="error-box">{error}</div>}
          {loading ? (
            <p className="hint">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="hint">No accounts yet.</p>
          ) : (
            <ul className="people">
              {accounts.map((a) => (
                <li key={a.id} className={a.active ? "person" : "person off"}>
                  <div className="person-main">
                    <div className="person-name">
                      {a.name || "—"}
                      {a.role === "owner" && (
                        <span className="tag">
                          <Shield size={11} /> admin
                        </span>
                      )}
                      {!a.active && <span className="tag muted">off</span>}
                      {a.id === session.id && <span className="tag muted">you</span>}
                    </div>
                    <div className="person-mail">{a.email}</div>
                    <div className="person-meta">Added {fmt(a.createdAt)}</div>
                  </div>
                  <div className="person-actions">
                    <button className="icon-btn" title="Reset password" onClick={() => resetPassword(a)} disabled={busyId === a.id}>
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title={a.role === "owner" ? "Make member" : "Make admin"}
                      onClick={() => toggleRole(a)}
                      disabled={busyId === a.id || a.id === session.id}
                    >
                      <Shield size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title={a.active ? "Turn off" : "Turn on"}
                      onClick={() => toggleActive(a)}
                      disabled={busyId === a.id || a.id === session.id}
                    >
                      {a.active ? <X size={14} /> : <Check size={14} />}
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Delete"
                      onClick={() => remove(a)}
                      disabled={busyId === a.id || a.id === session.id}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {notice && <div className="admin-toast">{notice}</div>}
    </div>
  );
}
