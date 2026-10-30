import { useEffect, useState } from "react";
import App from "./App";
import AdminPage from "./components/AdminPage";
import LoginPage from "./components/LoginPage";
import { clearSession, getSession, refreshSession, type Session } from "./auth";

/** Share links must keep working for people without an account. */
const isShareLink = () => /^#s=/.test(window.location.hash);

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
        onSignedIn={(next) => {
          setSession(next);
        }}
      />
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
