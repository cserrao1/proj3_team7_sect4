import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../AuthContext";
import logo from "../assets/umbc-logo.png";
import "./Navigation.css";

const links = [
  { label: "Home", to: "/" },
  { label: "FAQ", to: "/faq" },
  { label: "Plans", to: "/plans" },
  { label: "Contact", to: "/contact" },
];

export default function Navigation() {
  const { user } = useAuth();

  return (
    <header className="nav">
      <Link to="/" className="nav__logo" aria-label="UMBC home">
        <img src={logo} alt="UMBC" />
      </Link>

      <div className="nav__right">
        <nav aria-label="Main">
          <ul className="nav__links">
            {links.map(({ label, to }) => (
              <li key={label}>
                <NavLink to={to} end={to === "/"}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <Link to={user ? "/dashboard" : "/login"} className="nav__login">
          {user ? "Dashboard" : "Login"}
        </Link>
      </div>
    </header>
  );
}
