import { Link } from "react-router-dom";
import "./Pages.css";

export default function Homepage() {
  return (
    <main className="page page--home">
    <h1>Welcome to UMBC REPORT</h1>

    <p className="lead">
    DEMO
    </p>

    <div className="cards">
    <div className="card">
    <h2>Uploading Files</h2>
    <p>
    For this demo, we will demonstrate how to upload
    files and view their contents on UMBC REPORT.
    We will also explain how supported file types,
    such as PDFs, CSVs, and spreadsheets, can be used
    in the system.
    </p>
    </div>

    <div className="card">
    <h2>Creating an Account and Roles</h2>
    <p>
    We will demonstrate how to create a new account,
    sign up, and understand the different user roles
    in UMBC REPORT. We will also explain how permissions
    determine which features each user can access.
    </p>
    </div>

    <div className="card">
    <h2>Navigating the Website and Removing Users</h2>
    <p>
    We will demonstrate how to navigate the website,
    access its main features, and manage user accounts.
    We will show how administrators can locate users
    and remove accounts when necessary.
    </p>
    </div>
    </div>

    <p style={{ marginTop: 40 }}>
    <Link to="/signup" className="btn">
    Get started
    </Link>
    </p>
    </main>
  );
}
