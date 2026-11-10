import "./Pages.css";

const questions = [
  {
    q: "blank?",
    a: "blank",
  },
  {
    q: "blank?",
    a: "blank.",
  },
  {
    q: "blank?",
    a: "blank.",
  },
  {
    q: "blank?",
    a: "blank.",
  },
];

export default function FAQ() {
  return (
    <main className="page page--faq">
      <h1>Frequently Asked Questions</h1>
      <p className="lead">
        What FRQ are going to make.
      </p>

      <div className="faq">
        {questions.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
