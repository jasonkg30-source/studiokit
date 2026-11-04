import { useState } from "react";
import { ArrowRight, Loader2, Lock, UserPlus } from "lucide-react";
import { signIn, signUp, type Session } from "../auth";

/**
 * Two modes share one card: signing in, or asking for an account. A new
 * account cannot open the app until an admin approves it.
 */
export default function LoginPage({
  onSignedIn,
}: {
  onSignedIn: (s: Session) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const session =
        mode === "signin"
          ? await signIn(email, password)
          : await signUp({ email, name, password });
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  };

  const switchMode = (next: "signin" | "signup") => {
    setMode(next);
    setError("");
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark">S</div>
        <h1>{mode === "signin" ? "Sign in to Studiokit" : "Create an account"}</h1>
        <p className="auth-sub">
          {mode === "signin"
            ? "Dashboards for the team."
            : "An admin has to approve new accounts before you can build."}
        </p>

        {mode === "signup" && (
          <label className="auth-field">
            <span>Name</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </label>
        )}

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
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={mode === "signup" ? 10 : 1}
            required
          />
          {mode === "signup" && <small className="hint">At least 10 characters.</small>}
        </label>

        {error && <div className="error-box">{error}</div>}

        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : mode === "signin" ? <Lock size={15} /> : <UserPlus size={15} />}
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          {!busy && <ArrowRight size={15} />}
        </button>

        <div className="auth-switch">
          {mode === "signin" ? (
            <>
              Need an account?{" "}
              <button type="button" onClick={() => switchMode("signup")}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already approved?{" "}
              <button type="button" onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
