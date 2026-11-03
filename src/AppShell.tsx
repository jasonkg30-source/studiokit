import { useEffect, useState } from "react";
import { Hourglass, LogOut } from "lucide-react";
import App from "./App";
import AdminPage from "./components/AdminPage";
import LoginPage from "./components/LoginPage";
import { clearSession, getSession, refreshSession, type Session } from "./auth";

/**
 * Share links must keep working for people without an account. Long links carry
 * the payload in `#r=`; short links point at a stored copy with `#s=`.
 */
const isShareLink = () => /^#(s|r)=/.test(window.location.hash);

/** `?owner=<code>` is read once, right after the very first sign-up. */
const readBootstrap = () => new URLSearchParams(window.location.search).get("owner") ?? undefined;

export default function AppShell() {
  const [session, setSession] = useState<Session | null>(() => (isShareLink() ? null : getSession()));
  const [checking, setChecking] = useState(() => !isShareLink() && !!getSession());
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      setChecking(false);
      return;
    }
    refreshSession(current)
      .then((next) => setSession(next))
      .catch(() => setSession(current))
      .finally(() => setChecking(false));
  }, []);

  if (isShareLink()) return <App />;

  if (checking) {
    return (
      <div className="auth-page">
        <div className="auth-card quiet">Checking your session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginPage
        bootstrap={readBootstrap()}
        onSignedIn={(next) => {
          setSession(next);
        }}
      />
    );
  }

  // Signed in, but an admin has not approved this account yet.
  if (!session.active) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-mark">
            <Hourglass size={18} />
          </div>
          <h1>Waiting for approval</h1>
          <p className="auth-sub">
            {session.name || session.email}, your account was created. An admin has to approve it
            before you can build dashboards.
          </p>
          <button
            className="btn auth-submit"
            onClick={() => {
              clearSession();
              setSession(null);
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <App
        session={session}
        onSignOut={() => {
          clearSession();
          setSession(null);
          setAdminOpen(false);
        }}
        onOpenAdmin={() => setAdminOpen(true)}
      />
      {adminOpen && (
        <AdminPage
          session={session}
          onClose={() => {
            setAdminOpen(false);
            const current = getSession();
            if (current) setSession({ ...current });
          }}
        />
      )}
    </>
  );
}
