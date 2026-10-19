import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, ROLES } from "../AuthContext";
import UsersPanel from "../components/UsersPanel";
import "./Dashboard.css";

const MENU = [
  { title: "Menu", items: ["Dashboard", "Analytics", "Sales"] },
  { title: "Management", items: ["Products", "Customer", "Warehouse", "Reports"] },
  { title: "Notifications", items: ["Transaction", "Message"] },
];

const STATS = [
  { label: "Total Sales", note: "+50% Incomes", value: "$278m", icon: "↗", color: "" },
  { label: "Daily Sales", note: "-5% Sales", value: "$421k", icon: "%", color: "" },
  { label: "Daily User", note: "+48% New User", value: "4215", icon: "☺", color: "" },
  { label: "Product", note: "+35% New Product", value: "548", icon: "▣", color: "" },
  { label: "Expenses", note: "Target Expenses", value: "$219.0", icon: "≡", color: "" },
];

const CHARTS = {
  Month: { labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], data: [10,9,11,14,17,23,20,27,25,29,31,35] },
  Week: { labels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], data: [12,18,15,22,28,20,25] },
  Year: { labels: ["2022","2023","2024","2025","2026"], data: [8,14,21,26,34] },
};

const ORDERS = [
  { id: 1, name: "Peter Parker", product: "Microsoft Surface 7", price: 1299, status: "Paid" },
  { id: 2, name: "Alicia Keys", product: "Phone Pro 15", price: 999, status: "Pending" },
  { id: 3, name: "Marcus Lee", product: "Noise-cancel Headphones", price: 349, status: "Shipped" },
  { id: 4, name: "Dana Cruz", product: "Ultrabook Air", price: 1099, status: "Paid" },
  { id: 5, name: "Tom Hardy", product: "Mechanical Keyboard", price: 119, status: "Pending" },
];

const PAYMENTS = [
  { id: 1, name: "Easy Pay Way.", amount: 82256.23, color: "#f5b800" },
  { id: 2, name: "Payonner.", amount: 61486.69, color: "#8a8a8a" },
  { id: 3, name: "FastSpring.", amount: 4210.38, color: "#1a1a1a" },
  { id: 4, name: "Stripe Lite.", amount: 1999.0, color: "#d9a400" },
];

const NOTES = [
  "New order from Peter Parker",
  "Payment received: $82,256.23",
  "Warehouse stock is running low",
];

// Smooth line through the points
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
  const W = 600, H = 230, L = 34, R = 12, T = 28, B = 26;
  const yMax = Math.ceil(Math.max(...data) / 10) * 10;
  const x = (i) => L + (i * (W - L - R)) / (data.length - 1);
  const y = (v) => T + (1 - v / yMax) * (H - T - B);
  const pts = data.map((v, i) => [x(i), y(v)]);
  const line = smooth(pts);
  const area = `${line} L${x(data.length - 1)},${H - B} L${x(0)},${H - B} Z`;
  const [hover, setHover] = useState(null);
  const active = Math.min(hover ?? 5, data.length - 1);

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Sales by ${range}`}>
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5b800" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f5b800" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((n) => {
        const v = Math.round((yMax * n) / 3);
        return (
          <g key={n}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="chart__grid" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="chart__tick">{v}</text>
          </g>
        );
      })}
      {labels.map((lb, i) => (
        <text key={lb} x={x(i)} y={H - 6} textAnchor="middle" className="chart__tick">{lb}</text>
      ))}
      <path d={area} fill="url(#fill)" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1={x(active)} x2={x(active)} y1={y(data[active])} y2={H - B} className="chart__guide" />
      <circle cx={x(active)} cy={y(data[active])} r="6" fill="#f5b800" stroke="currentColor" strokeWidth="2.5" />
      <g transform={`translate(${x(active)}, ${y(data[active]) - 14})`}>
        <rect x="-24" y="-24" width="48" height="24" rx="6" fill="#1a1a1a" />
        <text y="-7" textAnchor="middle" className="chart__bubble">{data[active]}k</text>
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [sortDesc, setSortDesc] = useState(null);
  const [paid, setPaid] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [cards, setCards] = useState(1);
  const [bellOpen, setBellOpen] = useState(false);
  const [unread, setUnread] = useState(NOTES.length);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!user) return <Navigate to="/login" replace />;

  // Roles: only admins get the Users page; viewers can look but not change things.
  const menu = can("manage_users") ? [...MENU, { title: "Admin", items: ["Users"] }] : MENU;
  const roleLabel = ROLES[role]?.label ?? role;

  // Run an action only if this role may edit; otherwise explain why nothing happened.
  function ifCanEdit(action) {
    if (can("edit")) action();
    else setToast(`${roleLabel}s have read-only access`);
  }

  const orders = ORDERS
    .filter((o) => status === "All" || o.status === status)
    .filter((o) => (o.name + o.product).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sortDesc === null ? 0 : sortDesc ? b.price - a.price : a.price - b.price));

  const payments = showMore ? PAYMENTS : PAYMENTS.slice(0, 3);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className={`dash ${dark ? "dark" : ""}`}>
      <div className="dash__shell">
        <aside className={`side ${menuOpen ? "side--open" : ""}`}>
          <div className="side__brand"><span>F</span> Flumberry</div>
          {menu.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h3>{group.title}</h3>
              {group.items.map((item) => (
                <button key={item} className={`side__item ${page === item ? "is-active" : ""}`} onClick={() => { setPage(item); setMenuOpen(false); }}>
                  {item}
                </button>
              ))}
            </nav>
          ))}
          <div className="side__profile">
            <span className="avatar">{user[0].toUpperCase()}</span>
            <div><strong>{user}</strong><small>{roleLabel}</small></div>
          </div>
        </aside>

        <section className="main">
          <header className="top">
            <button className="icon-btn menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">☰</button>
            <label className="search">
              <input placeholder="Search orders" value={query} onChange={(e) => { setQuery(e.target.value); setPage("Dashboard"); }} />
              <span aria-hidden="true">⌕</span>
            </label>
            <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="Toggle dark mode">{dark ? "☀" : "☾"}</button>
            <div className="bell">
              <button className="icon-btn" onClick={() => setBellOpen(!bellOpen)} aria-label="Notifications">
                🔔{unread > 0 && <i className="badge">{unread}</i>}
              </button>
              {bellOpen && (
                <div className="drop">
                  {NOTES.map((n) => <p key={n}>{n}</p>)}
                  <button className="link" onClick={() => { setUnread(0); setBellOpen(false); }}>Mark all as read</button>
                </div>
              )}
            </div>
            <button className="logout" onClick={handleLogout}>↪ Log Out</button>
          </header>

          {page === "Users" && can("manage_users") ? (
            <UsersPanel onToast={setToast} />
          ) : page !== "Dashboard" ? (
            <div className="panel card empty">
              <h2>{page}</h2>
              <p>This {page.toLowerCase()} view is a demo placeholder. Go back to the Dashboard to see the live widgets.</p>
              <button className="btn-accent" onClick={() => setPage("Dashboard")}>Back to Dashboard</button>
            </div>
          ) : (
            <>
            <div className="balance">
              <div className="balance__main">
                <p>Active Balance</p>
                <h2>$ 9,470</h2>
              </div>
              <ul>
                <li><span>Incomes</span><b>$ 1,699.0</b></li>
                <li><span>Expenses</span><b>$ -799.0</b></li>
                <li><span>Taxes</span><b>$ -199.0</b></li>
              </ul>
              <button className={can("edit") ? "" : "is-locked"} onClick={() => ifCanEdit(() => { setCards(cards + 1); setToast("Virtual card added"); })}>
                Add Virtual Card {cards > 1 && `(${cards})`}
              </button>
            </div>
            <div className="grid">
              <div className="col">
                <div className="stats">
                  {STATS.map((s) => (
                    <button key={s.label} className="card stat" onClick={() => setToast(`${s.label}: ${s.note}`)}>
                      <span className="stat__icon">{s.icon}</span>
                      <strong>{s.value}</strong>
                      <span className="stat__label">{s.label}</span>
                      <small>{s.note}</small>
                    </button>
                  ))}
                </div>

                <div className="card">
                  <div className="card__head">
                    <h2>Summary Sales</h2>
                    <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Chart range">
                      <option>Month</option><option>Week</option><option>Year</option>
                    </select>
                  </div>
                  <SalesChart key={range} range={range} />
                </div>

                <div className="card">
                  <div className="card__head">
                    <h2>Last Order</h2>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                      <option>All</option><option>Paid</option><option>Pending</option><option>Shipped</option>
                    </select>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th><th>Product</th>
                          <th><button className="link" onClick={() => setSortDesc(sortDesc === null ? true : !sortDesc)}>Price {sortDesc === null ? "↕" : sortDesc ? "↓" : "↑"}</button></th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td><span className="avatar sm">{o.name[0]}</span>{o.name}</td>
                            <td>{o.product}</td>
                            <td>${o.price.toLocaleString()}</td>
                            <td><span className={`pill pill--${o.status.toLowerCase()}`}>{o.status}</span></td>
                          </tr>
                        ))}
                        {orders.length === 0 && <tr><td colSpan="4" className="none">No orders match. Clear the search or filter.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="col">
                <div className="card">
                  <h2>Upcoming Payments</h2>
                  <ul className="pay">
                    {payments.map((p) => {
                      const done = paid.includes(p.id);
                      return (
                        <li key={p.id}>
                          <button onClick={() => ifCanEdit(() => setPaid(done ? paid.filter((x) => x !== p.id) : [...paid, p.id]))} className={`${done ? "is-paid" : ""} ${can("edit") ? "" : "is-locked"}`}>
                            <i style={{ background: p.color }} />
                            <span>{p.name}</span>
                            <em>{done ? "Paid" : `$${p.amount.toLocaleString()}`}</em>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <button className="link" onClick={() => setShowMore(!showMore)}>{showMore ? "Less" : "More"}</button>
                </div>

                <div className="card">
                  <div className="card__head"><h2>Expenses Status</h2><span className="pill pill--paid">On Track</span></div>
                  <svg viewBox="0 0 200 60" className="spark"><path d="M0,40 C20,10 40,10 60,35 S100,60 120,30 S170,5 200,25" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                </div>
              </div>
            </div>
            </>
          )}
        </section>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
