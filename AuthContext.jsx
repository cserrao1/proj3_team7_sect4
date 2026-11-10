import { createContext, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./lib/api";

const AuthContext = createContext(null);

// What each role may do. The server enforces the same table on every request;
// this copy only decides what the interface shows.
export const ROLES = {
  admin: {
    label: "Admin",
    desc: "Full access, plus raw scan data and managing other users.",
    can: ["view", "edit", "view_raw", "manage_users"],
  },
  editor: {
    label: "Editor",
    desc: "Can view everything, upload and fix documents, and make changes.",
    can: ["view", "edit"],
  },
  viewer: {
    label: "Viewer",
    desc: "Read-only: can view and download documents but can't change anything.",
    can: ["view"],
  },
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { name, role } or null
  const [ready, setReady] = useState(false); // false until the server has said who we are
  const [selfSelectRole, setSelfSelectRole] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null)); // the server ended our session
    let live = true;
    api
      .get("/api/auth/me")
      .then((d) => {
        if (!live) return;
        setSession(d.user);
        setSelfSelectRole(d.selfSelectRole !== false);
      })
      .catch(() => {}) // server down: show the login page, which explains it on the first try
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  // `user` stays a plain string (the display name) so existing pages keep working.
  const user = session?.name ?? null;
  const role = session?.role ?? null;
  const can = (permission) => !!role && !!ROLES[role]?.can.includes(permission);

  // These return { ok: true } or { ok: false, error: "message for the person" }
  async function signup(username, password, chosenRole) {
    try {
      const d = await api.post("/api/auth/signup", { username, password, role: chosenRole });
      setSession(d.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function login(username, password) {
    try {
      const d = await api.post("/api/auth/login", { username, password });
      setSession(d.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function logout() {
    setSession(null);
    try {
      await api.post("/api/auth/logout");
    } catch {}
  }

  // Admin only (the server checks too)
  const listUsers = async () => (await api.get("/api/users")).users;
  const run = async (promise) => {
    try {
      await promise;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };
  const setUserRole = (name, newRole) => run(api.patch(`/api/users/${encodeURIComponent(name)}`, { role: newRole }));
  const deleteUser = (name) => run(api.del(`/api/users/${encodeURIComponent(name)}`));

  if (!ready) return null;
  return (
    <AuthContext.Provider
      value={{ user, role, can, selfSelectRole, login, signup, logout, listUsers, setUserRole, deleteUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
