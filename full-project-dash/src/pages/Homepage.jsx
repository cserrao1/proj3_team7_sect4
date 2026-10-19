import { Link } from "react-router-dom";
import "./Pages.css";

export default function Homepage() {
  return (
    <main className="page page--home">
      <h1>Welcome to Flumberry Academy</h1>
      <p className="lead">
        Where curious minds zigzag toward brilliant futures. Explore our
        wonderfully made-up programs, imaginary campus, and totally fictional
        success stories.
      </p>

      <div className="cards">
        <div className="card">
          <h2>Quantum Basket Weaving</h2>
          <p>
            Learn to weave baskets across seven dimensions. Snacks not included
            in any of them.
          </p>
        </div>
        <div className="card">
          <h2>Applied Cloud Whispering</h2>
          <p>
            Our most popular course. Graduates report a 300% increase in
            confident mumbling.
          </p>
        </div>
        <div className="card">
          <h2>Intro to Noodle Physics</h2>
          <p>
            Why does spaghetti never break into two pieces? We have theories,
            mostly delicious.
          </p>
        </div>
      </div>

      <p style={{ marginTop: 40 }}>
        <Link to="/plans" className="btn">See our plans</Link>
      </p>
    </main>
  );
}
