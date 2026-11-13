import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import './Signup.css';

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const data = await api('/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });

      localStorage.setItem('sw_token', data.token);
      setMessage('Account created successfully!');
      setTimeout(() => {
        navigate('/app');
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="logo-section">
        <img src="/logo.png" alt="Logo" className="logo-image" />
      </div>
      
      <div className="form-section">
        <span className="pre-heading">INTRODUCE YOURSELF</span>
        
        <form className="signup-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name" className="heading-label">
              Hi there! My name is
            </label>
            <input 
              type="text" 
              id="name" 
              className="input-field input-large" 
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus 
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="standard-label">
              Here’s my <strong>email address</strong>:
            </label>
            <input 
              type="email" 
              id="email" 
              className="input-field" 
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="standard-label">
              And here’s my <strong>password</strong>:
            </label>
            <input 
              type="password" 
              id="password" 
              className="input-field" 
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="action-section">
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign me up!'}
            </button>
          </div>
        </form>

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        <div className="footer-links">
          <p className="terms-text">
            By signing up, you accept the Splitwise Terms of Service.
          </p>
          <p className="currency-text">
            Don't use USD for currency? <a href="#currency">Click here</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
