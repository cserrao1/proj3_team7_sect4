import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, ROLES } from "../AuthContext";
import UsersPanel from "../components/UsersPanel";
import DocumentsPanel from "../components/DocumentsPanel";
import umbcLogo from "../assets/umbc-wordmark.png";
import "./Dashboard.css";

const MENU = [
  { title: "Menu", items: ["Dashboard", "Documents", "Reports"] },
];

const CHARTS = {
  Month: {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    data: [18, 24, 20, 32, 28, 38],
  },
  Week: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    data: [8, 12, 10, 16, 13, 19],
  },
  Year: {
    labels: ["2021", "2022", "2023", "2024", "2025", "2026"],
    data: [15, 21, 25, 29, 34, 41],
  },
};

const NOTES = [
  "Dashboard is ready to use.",
"Charts currently display sample data.",
];

// Create a smooth line through the chart points.
function smooth(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;

    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }

  return d;
}

function SalesChart({ range }) {
  const { labels, data } = CHARTS[range];

  const W = 600;
  const H = 230;
  const L = 34;
  const R = 12;
  const T = 28;
  const B = 26;

  const yMax = Math.ceil(Math.max(...data) / 10) * 10;

  const x = (i) =>
  L + (i * (W - L - R)) / (data.length - 1);

  const y = (v) =>
  T + (1 - v / yMax) * (H - T - B);

  const pts = data.map((v, i) => [x(i), y(v)]);
  const line = smooth(pts);

  const area = `${line} L${x(data.length - 1)},${H - B} L${x(0)},${H - B} Z`;

  const [hover, setHover] = useState(null);

  const active = Math.min(
    hover ?? data.length - 1,
    data.length - 1
  );

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;

    const i = Math.round(
      ((px - L) / (W - L - R)) * (data.length - 1)
    );

    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  return (
    <svg
    viewBox={`0 0 ${W} ${H}`}
    className="chart"
    onMouseMove={onMove}
    onMouseLeave={() => setHover(null)}
    role="img"
    aria-label={`Chart by ${range}`}
    >
    <defs>
    <linearGradient
    id="fill"
    x1="0"
    y1="0"
    x2="0"
    y2="1"
    >
    <stop
    offset="0%"
    stopColor="#f0d772"
    stopOpacity="0.45"
    />
    <stop
    offset="100%"
    stopColor="#f0d772"
    stopOpacity="0"
    />
    </linearGradient>
    </defs>

    {[0, 1, 2, 3].map((n) => {
      const v = Math.round((yMax * n) / 3);

      return (
        <g key={n}>
        <line
        x1={L}
        x2={W - R}
        y1={y(v)}
        y2={y(v)}
        className="chart__grid"
        />
        <text
        x={L - 8}
        y={y(v) + 4}
        textAnchor="end"
        className="chart__tick"
        >
        {v}
        </text>
        </g>
      );
    })}

    {labels.map((lb, i) => (
      <text
      key={lb}
      x={x(i)}
      y={H - 6}
      textAnchor="middle"
      className="chart__tick"
      >
      {lb}
      </text>
    ))}

    <path d={area} fill="url(#fill)" />

    <path
    d={line}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    />

    <line
    x1={x(active)}
    x2={x(active)}
    y1={y(data[active])}
    y2={H - B}
    className="chart__guide"
    />

    <circle
    cx={x(active)}
    cy={y(data[active])}
    r="6"
    fill="#f0d772"
    stroke="currentColor"
    strokeWidth="2.5"
    />

    <g
    transform={`translate(${x(active)}, ${y(data[active]) - 14})`}
    >
    <rect
    x="-24"
    y="-24"
    width="48"
    height="24"
    rx="6"
    fill="#1e1e1e"
    />
    <text
    y="-7"
    textAnchor="middle"
    className="chart__bubble"
    >
    {data[active]}k
    </text>
    </g>
    </svg>
  );
}

export default function Dashboard() {
  const { user, role, can, logout } = useAuth();
  const navigate = useNavigate();

  const [page, setPage] = useState("Dashboard");
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState("Month");
  const [bellOpen, setBellOpen] = useState(false);
  const [unread, setUnread] = useState(NOTES.length);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;

    const t = setTimeout(() => setToast(""), 2200);

    return () => clearTimeout(t);
  }, [toast]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const menu = can("manage_users")
  ? [...MENU, { title: "Admin", items: ["Users"] }]
  : MENU;

  const roleLabel = ROLES[role]?.label ?? role;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className={`dash ${dark ? "dark" : ""}`}>
    <div className="dash__shell">
    <aside className={`side ${menuOpen ? "side--open" : ""}`}>
    <div className="side__brand">
    <img src={umbcLogo} alt="UMBC" />
    </div>

    {menu.map((group) => (
      <nav key={group.title} aria-label={group.title}>
      <h3>{group.title}</h3>

      {group.items.map((item) => (
        <button
        key={item}
        className={`side__item ${
          page === item ? "is-active" : ""
        }`}
        onClick={() => {
          setPage(item);
          setMenuOpen(false);
        }}
        >
        {item}
        </button>
      ))}
      </nav>
    ))}

    <div className="side__profile">
    <span className="avatar">
    {user[0].toUpperCase()}
    </span>

    <div>
    <strong>{user}</strong>
    <small>{roleLabel}</small>
    </div>
    </div>
    </aside>

    <section className="main">
    <header className="top">
    <button
    className="icon-btn menu-btn"
    onClick={() => setMenuOpen(!menuOpen)}
    aria-label="Toggle menu"
    >
    ☰
    </button>

    <div className="top__spacer" />

    <button
    className="icon-btn"
    onClick={() => setDark(!dark)}
    aria-label="Toggle dark mode"
    >
    {dark ? "☀" : "☾"}
    </button>

    <div className="bell">
    <button
    className="icon-btn"
    onClick={() => setBellOpen(!bellOpen)}
    aria-label="Notifications"
    >
    🔔
    {unread > 0 && (
      <i className="badge">{unread}</i>
    )}
    </button>

    {bellOpen && (
      <div className="drop">
      {NOTES.map((note) => (
        <p key={note}>{note}</p>
      ))}

      <button
      className="link"
      onClick={() => {
        setUnread(0);
        setBellOpen(false);
      }}
      >
      Mark all as read
      </button>
      </div>
    )}
    </div>

    <button className="logout" onClick={handleLogout}>
    ↪ Log Out
    </button>
    </header>

    {page === "Users" && can("manage_users") ? (
      <UsersPanel onToast={setToast} />
    ) : page === "Documents" ? (
      <DocumentsPanel onToast={setToast} />
    ) : page !== "Dashboard" ? (
      <div className="panel card empty">
      <h2>{page}</h2>
      <p>
      This {page.toLowerCase()} view is a placeholder.
      </p>

      <button
      className="btn-accent"
      onClick={() => setPage("Dashboard")}
      >
      Back to Dashboard
      </button>
      </div>
    ) : (
      <div className="dashboard-content">
      <div className="card">
      <div className="card__head">
      <h2>Charts</h2>

      <select
      value={range}
      onChange={(e) => setRange(e.target.value)}
      aria-label="Chart range"
      >
      <option>Month</option>
      <option>Week</option>
      <option>Year</option>
      </select>
      </div>

      <SalesChart key={range} range={range} />
      </div>

      <div className="card">
      <div className="card__head">
      <h2>Notes</h2>
      </div>

      {NOTES.length > 0 ? (
        <ul className="notes-list">
        {NOTES.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
        </ul>
      ) : (
        <p>No notes yet.</p>
      )}
      </div>
      </div>
    )}
    </section>
    </div>

    {toast && (
      <div className="toast" role="status">
      {toast}
      </div>
    )}
    </div>
  );
}
