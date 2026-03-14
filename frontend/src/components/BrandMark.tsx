type BrandMarkProps = {
  className?: string;
  size?: number;
  label?: boolean;
};

export default function BrandMark({ className = "", size = 28, label = false }: BrandMarkProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="SkillsClaw logo">
        <defs>
          <linearGradient id="skillsclaw-shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f83f1d" />
            <stop offset="100%" stopColor="#a91f0a" />
          </linearGradient>
        </defs>
        <rect x="10" y="10" width="100" height="100" rx="24" fill="#0a0a0a" stroke="#2b2b2b" strokeWidth="4" />
        <ellipse cx="60" cy="58" rx="31" ry="26" fill="url(#skillsclaw-shell)" />
        <circle cx="48" cy="55" r="6" fill="#ffd94e" />
        <circle cx="72" cy="55" r="6" fill="#ffd94e" />
        <path d="M45 72 C52 78, 68 78, 75 72" stroke="#ffd94e" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M30 38 L22 28" stroke="#f83f1d" strokeWidth="5" strokeLinecap="round" />
        <path d="M90 38 L98 28" stroke="#f83f1d" strokeWidth="5" strokeLinecap="round" />
      </svg>
      {label && <span className="font-display font-bold text-white tracking-tight">SkillsClaw</span>}
    </div>
  );
}
