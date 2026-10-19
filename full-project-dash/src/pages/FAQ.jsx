import "./Pages.css";

const questions = [
  {
    q: "How do I enroll in a class?",
    a: "Simply wave at the registration portal and say the magic word, which is \"enroll\". Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    q: "Is there a student discount on moonbeams?",
    a: "Yes! Students receive 15% off all moonbeams, glitter, and mildly enchanted pencils. Sed do eiusmod tempor incididunt ut labore.",
  },
  {
    q: "Can I switch my major to Cloud Whispering?",
    a: "Absolutely. Our advisors are available Tuesdays, Thursdays, and every third blue moon. Ut enim ad minim veniam, quis nostrud.",
  },
  {
    q: "Where is the campus located?",
    a: "Just past the second hill, left of the giant teapot. Duis aute irure dolor in reprehenderit in voluptate velit esse.",
  },
];

export default function FAQ() {
  return (
    <main className="page page--faq">
      <h1>Frequently Asked Questions</h1>
      <p className="lead">
        Answers to questions nobody has actually asked yet. Click one to open it.
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
