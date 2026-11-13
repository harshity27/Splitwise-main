import "./../App.css";
import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";

function MosaicHeart() {
  const colors = ["#18b99b", "#353f3e", "#0e6f64", "#d7f6f0"];
  const cells = [
    [5,2],[6,2],[7,2],[11,2],[12,2],[13,2],
    [4,3],[5,3],[6,3],[7,3],[8,3],[10,3],[11,3],[12,3],[13,3],[14,3],
    [3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],[13,4],[14,4],[15,4],
    [3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[12,5],[13,5],[14,5],[15,5],
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],
    [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[13,7],
    [6,8],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],
    [7,9],[8,9],[9,9],[10,9],[11,9],
    [8,10],[9,10],[10,10],
    [9,11]
  ];

  return (
    <svg className="heart" viewBox="0 0 360 270" role="img" aria-label="Heart illustration">
      {cells.map(([x, y], i) => {
        const sx = x * 18;
        const sy = y * 18;
        return (
          <g key={i}>
            <polygon points={`${sx},${sy} ${sx + 18},${sy} ${sx},${sy + 18}`} fill={colors[i % 4]} />
            <polygon points={`${sx + 18},${sy} ${sx + 18},${sy + 18} ${sx},${sy + 18}`} fill={colors[(i + 2) % 4]} />
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  return (
    <>

      <Navbar />
      <section className="hero">
        <h1>
          Less stress when sharing expenses <span>on trips.</span>
        </h1>

        <div className="category-icons">
          <span>✈</span>
          <span>⌂</span>
          <span>♥</span>
          <span>✱</span>
        </div>

        <MosaicHeart />

        <button className="download">Download the app</button>

        <p className="tagline">
          Keep track of your shared expenses and balances with housemates, trips,
          groups, friends, and family.
        </p>

        <p className="platforms">Free for  iPhone, Android, and web.</p>
      </section>

      <section className="feature">
        <h2>Track balances</h2>
        <p>Keep track of shared expenses, balances, and who owes who.</p>
      </section>
      <Footer />
    </>
  );
}
