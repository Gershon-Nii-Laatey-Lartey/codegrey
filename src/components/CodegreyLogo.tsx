// Codegrey wordmark/logo icon — from public/logos/icon.svg
export function CodegreyLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <filter id="cg-liquid">
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 80 -35" result="goo" />
        </filter>
      </defs>
      <rect width="512" height="512" rx="180" fill="white" />
      <g filter="url(#cg-liquid)">
        <circle cx="256" cy="256" r="110" fill="black" />
        <circle cx="120" cy="256" r="50" fill="black" />
        <circle cx="392" cy="256" r="60" fill="black" />
        <circle cx="256" cy="110" r="45" fill="black" />
        <circle cx="256" cy="402" r="65" fill="black" />
        <circle cx="160" cy="160" r="40" fill="black" />
        <circle cx="350" cy="350" r="55" fill="black" />
        <circle cx="160" cy="350" r="30" fill="black" />
      </g>
    </svg>
  );
}
