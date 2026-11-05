import { useEffect, useState } from "react";
import BUILD_ID from "virtual:build-id";

/**
 * A tab that stays open keeps running the bundle it loaded, so a deploy is
 * invisible to it. This compares the running build with the one on the server
 * and offers a reload instead of silently showing old layout.
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
        if (!cancelled && id && id !== BUILD_ID) setStale(true);
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
