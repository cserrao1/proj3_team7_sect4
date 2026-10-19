import "./Pages.css";

const plans = [
  {
    name: "Sprout",
    price: "$0",
    perks: ["1 imaginary course", "Community doodle board", "Weekly fun fact"],
  },
  {
    name: "Bloom",
    price: "$19",
    perks: ["5 imaginary courses", "Priority cloud whispering", "Monthly sticker pack"],
    featured: true,
  },
  {
    name: "Jungle",
    price: "$49",
    perks: ["Unlimited courses", "Private noodle lab access", "A very nice hat"],
  },
];

export default function Plans() {
  return (
    <main className="page page--plans">
      <h1>Pick Your Plan</h1>
      <p className="lead">
        Simple, sparkly pricing. Cancel anytime, or just forget about it. We
        won't tell.
      </p>

      <div className="cards">
        {plans.map(({ name, price, perks, featured }) => (
          <div key={name} className={`card ${featured ? "card--featured" : ""}`}>
            <h2>{name}</h2>
            <div className="price">
              {price}
              <small> / month</small>
            </div>
            <ul>
              {perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
            <button className="btn">Choose {name}</button>
          </div>
        ))}
      </div>
    </main>
  );
}
