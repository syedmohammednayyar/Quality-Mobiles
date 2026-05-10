import React, { useEffect } from 'react';

interface ToastProps {
  id?: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const id = setTimeout(() => onClose && onClose(), 3000);
    return () => clearTimeout(id);
  }, [onClose]);

  return (
    <div className={`qm-toast qm-toast-${type}`} role="status">
      {message}
    </div>
  );
};

export default Toast;
