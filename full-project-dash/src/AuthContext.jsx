import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

const USERS_KEY = "users"; // localStorage: every registered account
const SESSION_KEY = "user"; // sessionStorage: who is logged in (this tab only)

const MIN_USERNAME = 3;
const MIN_PASSWORD = 8;

// ---------- roles ----------

export const ROLES = {
  admin: {
    label: "Admin",
    desc: "Full access, plus manage other users and their roles.",
    can: ["view", "edit", "manage_users"],
  },
  editor: {
    label: "Editor",
    desc: "Can view everything and make changes (add cards, mark payments).",
    can: ["view", "edit"],
  },
  viewer: {
    label: "Viewer",
    desc: "Read-only: can look around but can't change anything.",
    can: ["view"],
  },
};

const DEFAULT_ROLE = "viewer"; // least privilege, also used for accounts made before roles existed

// Any missing or unrecognised stored role becomes the default one.
const cleanRole = (r) => (ROLES[r] ? r : DEFAULT_ROLE);

// ---------- storage helpers ----------

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return true;
  } catch {
    return false;
  }
}

// ---------- password hashing (PBKDF2 + random salt, never stored in plain text) ----------

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256
  );
  return toB64(bits);
}

const NO_CRYPTO =
  "Secure sign-in isn't available here. Open the site on localhost or over https.";

// ---------- provider ----------

export function AuthProvider({ children }) {
  // The session is { name, role } or null. On page load it is rebuilt from the
  // account list, so a changed role applies right away and a removed account is logged out.
  const [session, setSession] = useState(() => {
    try {
      const name = sessionStorage.getItem(SESSION_KEY);
      const account = name && readUsers()[name.toLowerCase()];
      return account ? { name: account.name, role: cleanRole(account.role) } : null;
    } catch {
      return null;
    }
  });

  // `user` stays a plain string (the display name) so existing pages keep working.
  const user = session?.name ?? null;
  const role = session?.role ?? null;

  function can(permission) {
    return !!role && ROLES[role].can.includes(permission);
  }

  function startSession(name, userRole) {
    setSession({ name, role: userRole });
    try {
      sessionStorage.setItem(SESSION_KEY, name);
    } catch {}
  }

  // Returns { ok: true } or { ok: false, error: "message for the user" }
  async function signup(username, password, chosenRole) {
    const name = (username || "").trim();
    if (name.length < MIN_USERNAME) {
      return { ok: false, error: `Username must be at least ${MIN_USERNAME} characters.` };
    }
    if (!password || password.length < MIN_PASSWORD) {
      return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
    }
    const userRole = cleanRole(chosenRole);

    const users = readUsers();
    const id = name.toLowerCase();
    if (users[id]) {
      return { ok: false, error: "That username is already taken. Try logging in instead." };
    }

    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await hashPassword(password, salt);
      users[id] = { name, role: userRole, salt: toB64(salt), hash };
    } catch {
      return { ok: false, error: NO_CRYPTO };
    }

    if (!writeUsers(users)) {
      return { ok: false, error: "Couldn't save your account. Is browser storage blocked?" };
    }
    startSession(name, userRole);
    return { ok: true };
  }

  async function login(username, password) {
    const wrong = { ok: false, error: "Incorrect username or password." };
    const name = (username || "").trim();
    if (!name || !password) {
      return { ok: false, error: "Enter your username and password." };
    }

    const account = readUsers()[name.toLowerCase()];
    if (!account) return wrong; // same message as a wrong password on purpose

    try {
      const hash = await hashPassword(password, fromB64(account.salt));
      if (hash !== account.hash) return wrong;
    } catch {
      return { ok: false, error: NO_CRYPTO };
    }

    startSession(account.name, cleanRole(account.role));
    return { ok: true };
  }

  function logout() {
    setSession(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  // ---------- admin only: manage other accounts ----------

  function listUsers() {
    if (!can("manage_users")) return [];
    return Object.values(readUsers())
      .map((a) => ({ name: a.name, role: cleanRole(a.role) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function setUserRole(name, newRole) {
    if (!can("manage_users")) return { ok: false, error: "Only admins can change roles." };
    if (!ROLES[newRole]) return { ok: false, error: "Unknown role." };
    if (name.toLowerCase() === user.toLowerCase()) {
      return { ok: false, error: "You can't change your own role." };
    }
    const users = readUsers();
    const account = users[name.toLowerCase()];
    if (!account) return { ok: false, error: "User not found." };
    account.role = newRole;
    return writeUsers(users) ? { ok: true } : { ok: false, error: "Couldn't save the change." };
  }

  function deleteUser(name) {
    if (!can("manage_users")) return { ok: false, error: "Only admins can remove users." };
    if (name.toLowerCase() === user.toLowerCase()) {
      return { ok: false, error: "You can't remove your own account." };
    }
    const users = readUsers();
    if (!users[name.toLowerCase()]) return { ok: false, error: "User not found." };
    delete users[name.toLowerCase()];
    return writeUsers(users) ? { ok: true } : { ok: false, error: "Couldn't save the change." };
  }

  return (
    <AuthContext.Provider
      value={{ user, role, can, login, signup, logout, listUsers, setUserRole, deleteUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
