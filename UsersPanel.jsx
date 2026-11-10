import { useEffect, useState } from "react";
import { useAuth, ROLES } from "../AuthContext";

// Admin-only page: see every account, change roles, remove users.
export default function UsersPanel({ onToast }) {
  const { user, listUsers, setUserRole, deleteUser } = useAuth();
  const [users, setUsers] = useState(null); // null = still loading

  async function refresh() {
    try {
      setUsers(await listUsers());
    } catch (e) {
      onToast(e.message);
      setUsers((u) => u ?? []);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function run(promise, message) {
    const result = await promise;
    if (result.ok) {
      await refresh();
      onToast(message);
    } else {
      onToast(result.error);
    }
  }

  const handleRole = (name, newRole) => run(setUserRole(name, newRole), `${name} is now ${ROLES[newRole].label}`);

  function handleDelete(name) {
    if (!window.confirm(`Remove ${name}? They won't be able to log in anymore.`)) return;
    run(deleteUser(name), `${name} was removed`);
  }

  return (
    <div className="card">
      <div className="card__head">
        <h2>Users</h2>
        <span className="pill pill--shipped">{users ? users.length : "…"} total</span>
      </div>
      <p className="users__note">Role changes apply on that person's very next action.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Username</th><th>Role</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users === null && <tr><td colSpan="3" className="none">Loading…</td></tr>}
            {(users || []).map((u) => {
              const isMe = u.name.toLowerCase() === user.toLowerCase();
              return (
                <tr key={u.name}>
                  <td>
                    <span className="avatar sm">{u.name[0].toUpperCase()}</span>
                    {u.name} {isMe && <span className="pill pill--paid">You</span>}
                  </td>
                  <td>
                    <select
                      value={u.role}
                      disabled={isMe}
                      onChange={(e) => handleRole(u.name, e.target.value)}
                      aria-label={`Role for ${u.name}`}
                    >
                      {Object.entries(ROLES).map(([key, r]) => (
                        <option key={key} value={key}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {isMe ? (
                      <span className="users__muted">—</span>
                    ) : (
                      <button className="link" onClick={() => handleDelete(u.name)}>Remove</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
