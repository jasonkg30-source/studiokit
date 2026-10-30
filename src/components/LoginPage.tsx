import { useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { signIn, type Session } from "../auth";

export default function LoginPage({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      onSignedIn(await signIn(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark">S</div>
        <h1>Sign in to Studiokit</h1>
        <p className="auth-sub">Dashboards for the team. Ask an admin if you need an account.</p>

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <Lock size={15} />}
          {busy ? "Checking…" : "Sign in"}
          {!busy && <ArrowRight size={15} />}
        </button>

        <div className="auth-foot">Passwords are hashed on this device before they are stored.</div>
      </form>
    </div>
  );
}
