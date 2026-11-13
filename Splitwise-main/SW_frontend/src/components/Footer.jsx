import "./Footer.css";

const footerColumns = [
  {
    title: "Splitwise",
    className: "teal",
    links: ["About", "Press", "Blog", "Jobs", "Calculators", "API"],
  },
  {
    title: "Account",
    className: "orange",
    links: ["Log in", "Sign up", "Reset password", "Settings", "Splitwise Pro", "Splitwise Pay", "Splitwise Card"],
  },
  {
    title: "More",
    links: ["Contact us", "FAQ", "Site status", "Terms of Service", "Privacy Policy", "Coastal Community Bank Privacy Policy"],
  },
];

function StoreBadge({ type }) {
  return (
    <a className="store-badge" href="#">
      <span className={type === "google" ? "play-icon" : "apple-icon"}>
        {type === "google" ? "▶" : "●"}
      </span>
      <span>
        <small>{type === "google" ? "GET IT ON" : "Download on the"}</small>
        <strong>{type === "google" ? "Google Play" : "App Store"}</strong>
      </span>
    </a>
  );
}

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-links">
          {footerColumns.map((column) => (
            <div className="footer-column" key={column.title}>
              <h3 className={column.className}>{column.title}</h3>
              {column.links.map((link) => (
                <a href="#" key={link}>{link}</a>
              ))}
            </div>
          ))}
        </div>

        <div className="footer-downloads">
          <div className="badge-row">
            <StoreBadge type="google" />
            <StoreBadge type="apple" />
          </div>
          <p>Made with :) in Providence, RI, USA</p>
        </div>
      </div>

      <div className="mountains" aria-hidden="true">
        <span className="mountain m1" />
        <span className="mountain m2" />
        <span className="mountain m3" />
        <span className="mountain m4" />
        <span className="mountain m5" />
        <span className="mountain m6" />
      </div>
    </footer>
  );
}