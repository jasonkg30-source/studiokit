import { useEffect, useState } from "react";
import BUILD_ID from "virtual:build-id";

const RELOADED_KEY = "studiokit.reloaded";

/**
 * A tab that stays open keeps running the bundle it loaded, so a deploy is
 * invisible to it. This compares the running build with the one on the server,
 * reloads once (cache-busted) when a stale page was served, and offers a button
 * if that still leaves the tab behind.
 */
export default function UpdateNotice() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (cancelled || !id || id === BUILD_ID) return;
        if (sessionStorage.getItem(RELOADED_KEY) !== id) {
          sessionStorage.setItem(RELOADED_KEY, id);
          window.location.replace(`${window.location.pathname}?b=${id}${window.location.hash}`);
          return;
        }
        setStale(true);
      } catch {
        // Offline: the next focus retries.
      }
    };
    void check();
    const timer = window.setInterval(check, 120_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!stale) return null;
  return (
    <button className="update-pill" onClick={() => window.location.reload()}>
      New version — reload
    </button>
  );
}
