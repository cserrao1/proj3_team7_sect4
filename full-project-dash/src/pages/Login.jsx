import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import "./Pages.css";

export default function Login() {
  const { user, login } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already logged in? Go straight to the dashboard.
  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    setBusy(true);
    setError("");
    const result = await login(form.get("username"), form.get("password"));
    setBusy(false);
    if (!result.ok) setError(result.error);
    // On success `user` is set and the redirect above takes over.
  }

  return (
    <main className="page page--login">
      <h1>Welcome Back</h1>
      <p className="lead">Log in with your username and password to open your dashboard.</p>

      <form className="form" onSubmit={handleSubmit}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label>
          Username
          <input name="username" type="text" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="form-alt">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </main>
  );
}
