import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth, ROLES } from "../AuthContext";
import "./Pages.css";

export default function Signup() {
  const { user, signup } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("viewer");

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    if (form.get("password") !== form.get("confirm")) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await signup(form.get("username"), form.get("password"), role);
    setBusy(false);
    if (!result.ok) setError(result.error);
    // On success you're logged in and sent to the dashboard automatically.
  }

  return (
    <main className="page page--login">
      <h1>Create Account</h1>
      <p className="lead">Pick a username and password to get started.</p>

      <form className="form" onSubmit={handleSubmit}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label>
          Username
          <input name="username" type="text" autoComplete="username" minLength={3} required />
          <span className="hint">At least 3 characters.</span>
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          <span className="hint">At least 8 characters.</span>
        </label>
        <label>
          Confirm password
          <input name="confirm" type="password" autoComplete="new-password" required />
        </label>
        <label>
          Role
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLES).map(([key, r]) => (
              <option key={key} value={key}>{r.label}</option>
            ))}
          </select>
          <span className="hint">{ROLES[role].desc}</span>
        </label>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="form-alt">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
