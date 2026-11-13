import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import './../App.css';
import Navbar from './Navbar.jsx';
import Footer from './Footer.jsx';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem('sw_token', data.token);
      setMessage('Logged in successfully!');
      navigate('/app');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
       <>
       <Navbar />
    <div className="login-page">
      <section className="login-card">
        <div className="login-card-header">
          <h2>Log in</h2>
          <p>Enter your email and password to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="button-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Log in'}
          </button>
         

          <a href="#" className="forgot-link">
            Forgot your password?
          </a>
        </form>

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
      </section>
    </div>
    <Footer/>
    </>
  );
}
