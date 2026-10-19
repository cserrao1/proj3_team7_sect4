import { useState } from "react";
import "./Pages.css";

export default function Contact() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <main className="page page--contact">
      <h1>Contact Us</h1>
      <p className="lead">
        Questions, compliments, or sightings of the giant teapot? Send us a
        message. Our owls will deliver it.
      </p>

      {sent ? (
        <div className="thanks">
          Thanks! Your message is on its way. (Not really, this is a demo.)
        </div>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Name
            <input type="text" placeholder="Jane Doe" required />
          </label>
          <label>
            Email
            <input type="email" placeholder="jane@example.com" required />
          </label>
          <label>
            Message
            <textarea placeholder="Tell us something wonderful..." required />
          </label>
          <button type="submit" className="btn">Send message</button>
        </form>
      )}
    </main>
  );
}
