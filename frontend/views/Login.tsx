import React, { useState } from 'react';
import { User } from '../types';
import { getCurrentUser, login, setAuthToken, setSessionUser } from '../services/api';
import LogoShield from '../components/LogoShield';
import AuthInput from '../components/AuthInput';
import Toast from '../components/Toast';
import './Login.css';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type?: 'success' | 'error' }[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const pushToast = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((state) => [...state, { id, msg, type }]);
    setTimeout(() => setToasts((state) => state.filter((toast) => toast.id !== id)), 3200);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username.trim()) return setError('Username is required');
    if (username.trim().length < 3) return setError('Username must be at least 3 characters');
    if (!password) return setError('Password is required');
    if (password.length < 8) return setError('Password must be at least 8 characters');

    try {
      setIsLoading(true);
      const auth = await login({ username: username.trim(), password });
      setAuthToken(auth.token);

      const me = await getCurrentUser();
      setSessionUser(me);
      onLogin(me as User);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setError(message);
      pushToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-orb orb-left" />
      <div className="auth-orb orb-right" />

      <div className="auth-layout">
        <aside className="auth-brand-panel">
          <div className="brand-logo-wrap">
            <LogoShield size={150} />
          </div>
          <h1>QUALITY MOBILES</h1>
          <p>Connecting Your ❤️ with your RABB</p>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-head">
            <h2 className="active">Sign In</h2>
            <p>Continue to your workspace</p>
          </div>

          <form onSubmit={handleLogin} className="auth-form auth-form-animate">
            <AuthInput
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5z" stroke="#134252" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username or email"
              autoComplete="username"
            />

            <AuthInput
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 17v-4" stroke="#134252" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 12v-2a5 5 0 10-10 0v2" stroke="#134252" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              right={<button type="button" className="icon-btn" onClick={() => setShowPassword((state) => !state)}>{showPassword ? 'Hide' : 'Show'}</button>}
            />

            {error && <p style={{ margin: 0, color: 'var(--error-red)', fontWeight: 700 }}>{error}</p>}

            <div>
              <button type="submit" disabled={isLoading} className="auth-submit">
                {isLoading ? <span className="spinner" /> : 'Continue'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <div className="toast-viewport">
        {toasts.map((toast) => (
          <Toast key={toast.id} message={toast.msg} type={toast.type === 'error' ? 'error' : 'success'} onClose={() => setToasts((state) => state.filter((item) => item.id !== toast.id))} />
        ))}
      </div>
    </div>
  );
};

export default Login;
