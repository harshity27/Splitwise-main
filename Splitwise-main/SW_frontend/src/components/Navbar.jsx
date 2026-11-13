import "./../App.css";
import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="header">
      <Link className="brand" to="/">
        <img src="/logo.png" alt="Splitwise" />
        <span>Splitwise</span>
      </Link>

      <nav>
        <Link className="login" to="/login">
          Log in
        </Link>
        <Link className="signup" to="/signup">
          Sign up
        </Link>
      </nav>
    </header>
  );
}