type LogoMarkProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
} as const;

export default function LogoMark({ size = 'md', className = '' }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label="Level-N-Learn logo"
      className={`${sizeMap[size]} ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="512" height="512" fill="#ffffff" rx="40" />
      <g transform="translate(0 18)">
        <text
          x="256"
          y="250"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="240"
          fontWeight="700"
          letterSpacing="-18"
          fill="#000000"
        >
          LN
        </text>
        <text
          x="256"
          y="348"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="52"
          fontWeight="700"
          fill="#000000"
        >
          Level-N-Learn
        </text>
      </g>
    </svg>
  );
}
