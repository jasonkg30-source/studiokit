import { useState } from "react";
import { Lock } from "lucide-react";

interface Props {
  busy: boolean;
  error: string;
  onSubmit: (password: string) => void;
}

export default function PasswordGate({ busy, error, onSubmit }: Props) {
  const [value, setValue] = useState("");

  return (
    <div className="gate-backdrop">
      <form
        className="gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && !busy) onSubmit(value);
        }}
      >
        <div className="gate-icon">
          <Lock size={18} />
        </div>
        <h2>This dashboard is protected</h2>
        <p className="hint">Enter the password your teammate shared to open it.</p>
        <input
          className="text-input"
          type="password"
          placeholder="Password"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          autoComplete="current-password"
        />
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !value.trim()}>
          {busy ? "Checking…" : "Open dashboard"}
        </button>
      </form>
    </div>
  );
}
