import React from 'react';

interface LogoShieldProps {
  size?: number;
  className?: string;
}

const LogoShield: React.FC<LogoShieldProps> = ({ size = 28, className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 80"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="qmShieldFill" x1="8" y1="6" x2="62" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14294f" />
          <stop offset="0.52" stopColor="#0e1f3f" />
          <stop offset="1" stopColor="#0a1732" />
        </linearGradient>
        <linearGradient id="qmGold" x1="14" y1="12" x2="60" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f9dda2" />
          <stop offset="0.45" stopColor="#d9b773" />
          <stop offset="1" stopColor="#b88f4f" />
        </linearGradient>
      </defs>

      <path
        d="M36 3.5L63.5 12.2V34.4C63.5 52.4 52.8 65.9 36 75.2C19.2 65.9 8.5 52.4 8.5 34.4V12.2L36 3.5Z"
        fill="url(#qmShieldFill)"
        stroke="url(#qmGold)"
        strokeWidth="3"
      />
      <path
        d="M36 9.5L58.2 16.6V34.2C58.2 48.8 49.9 59.7 36 67.9C22.1 59.7 13.8 48.8 13.8 34.2V16.6L36 9.5Z"
        fill="none"
        stroke="url(#qmGold)"
        strokeWidth="2"
        opacity="0.95"
      />

      <path d="M22 55.8C25.3 58.9 29.9 61.3 36 63.7C42.1 61.3 46.7 58.9 50 55.8" stroke="url(#qmGold)" strokeWidth="2" strokeLinecap="round" />

      <text
        x="36"
        y="45"
        textAnchor="middle"
        fontFamily="'Times New Roman', serif"
        fontSize="24"
        fontWeight="700"
        fill="url(#qmGold)"
        letterSpacing="0.5"
      >
        QM
      </text>
    </svg>
  );
};

export default LogoShield;