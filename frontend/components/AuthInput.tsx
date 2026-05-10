import React from 'react';

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string | null;
  right?: React.ReactNode;
}

const AuthInput: React.FC<AuthInputProps> = ({ icon, error, right, className, ...rest }) => {
  return (
    <div style={{ position: 'relative' }}>
      {icon && (
        <div className="auth-input-icon" aria-hidden>
          {icon}
        </div>
      )}

      <input {...rest} className={(className ? className + ' ' : '') + 'auth-input auth-input-with-icon'} />

      {right && (
        <div className="auth-input-right" aria-hidden>
          {right}
        </div>
      )}

      {error && <div className="auth-field-error">{error}</div>}
    </div>
  );
};

export default AuthInput;
