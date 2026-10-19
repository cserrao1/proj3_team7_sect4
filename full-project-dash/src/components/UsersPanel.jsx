import { useState } from "react";
import { useAuth, ROLES } from "../AuthContext";

// Admin-only page: see every account, change roles, remove users.
export default function UsersPanel({ onToast }) {
  const { user, listUsers, setUserRole, deleteUser } = useAuth();
  const [users, setUsers] = useState(() => listUsers());

  function run(result, message) {
    if (result.ok) {
      setUsers(listUsers());
      onToast(message);
    } else {
      onToast(result.error);
    }
  }

  function handleRole(name, newRole) {
    run(setUserRole(name, newRole), `${name} is now ${ROLES[newRole].label}`);
  }

  function handleDelete(name) {
    if (!window.confirm(`Remove ${name}? They won't be able to log in anymore.`)) return;
    run(deleteUser(name), `${name} was removed`);
  }

  return (
    <div className="card">
      <div className="card__head">
        <h2>Users</h2>
        <span className="pill pill--shipped">{users.length} total</span>
      </div>
      <p className="users__note">
        Role changes apply the next time that person loads the site or logs in.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Username</th><th>Role</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
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
