import React, { useState } from 'react';
import { User } from '../types';
import { getCurrentUser, login, setAuthToken, setSessionUser, signup } from '../services/api';
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
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [role, setRole] = useState('Employee');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [toasts, setToasts] = useState<{ id: number; msg: string; type?: 'success'|'error' }[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const pushToast = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts((s) => [...s, { id, msg, type }]);
    setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), 3200);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Frontend validation
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      setIsLoading(true);
      const auth = await login({ username: username.trim(), password });
      setAuthToken(auth.token);

      const me = await getCurrentUser();
      setSessionUser(me);
      onLogin(me as User);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const validateEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // frontend validation
    if (!name.trim() || name.trim().length < 3) return setError('Name is required (min 3 chars)');
    if (!signupEmail.trim() || !validateEmail(signupEmail)) return setError('Valid email is required');
    if (!signupPassword || signupPassword.length < 8) return setError('Password must be at least 8 characters');
    if (!role) return setError('Role is required');

    try {
      setIsLoading(true);
      await signup({ name: name.trim(), email: signupEmail.trim(), password: signupPassword, role: role as 'Admin' | 'Manager' | 'Employee' });
      pushToast('Signup completed successfully', 'success');
      setMode('login');
      setUsername(signupEmail.trim());
      setPassword('');
      setSignupPassword('');
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
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
            <h2 className={mode === 'login' ? 'active' : ''}>{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
            <p>{mode === 'login' ? 'Continue to your workspace' : 'Create your Quality Mobiles account'}</p>
          </div>

          <div className="auth-toggle">
            <button className={mode === 'login' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setMode('login')}>Login</button>
            <button className={mode === 'signup' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setMode('signup')}>Signup</button>
          </div>

          {mode === 'login' ? (
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
                right={<button type="button" className="icon-btn" onClick={() => setShowPassword((s) => !s)}>{showPassword ? 'Hide' : 'Show'}</button>}
              />

              {error && <p style={{ margin: 0, color: 'var(--error-red)', fontWeight: 700 }}>{error}</p>}

              <div>
                <button type="submit" disabled={isLoading} className="auth-submit">
                  {isLoading ? <span className="spinner" /> : 'Continue'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="auth-form auth-form-animate">
              <AuthInput
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5z" stroke="#134252" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
              />

              <AuthInput
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 8l9 6 9-6" stroke="#134252" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="Email address"
                autoComplete="email"
              />

              <AuthInput
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 17v-4" stroke="#134252" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 12v-2a5 5 0 10-10 0v2" stroke="#134252" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                type={showPassword ? 'text' : 'password'}
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="Create a password"
                autoComplete="new-password"
                right={<button type="button" className="icon-btn" onClick={() => setShowPassword((s) => !s)}>{showPassword ? 'Hide' : 'Show'}</button>}
              />

              <div>
                <label className="auth-label">Role</label>
                <select className="auth-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option>Admin</option>
                  <option>Manager</option>
                  <option>Employee</option>
                </select>
              </div>

              {error && <p style={{ margin: 0, color: 'var(--error-red)', fontWeight: 700 }}>{error}</p>}

              <div>
                <button type="submit" disabled={isLoading} className="auth-submit auth-submit-accent">
                  {isLoading ? <span className="spinner" /> : 'Create account'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>

      {/* Toasts */}
      <div className="toast-viewport">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.msg} type={t.type === 'error' ? 'error' : 'success'} onClose={() => setToasts((s) => s.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </div>
  );
};

export default Login;
