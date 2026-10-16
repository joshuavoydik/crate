type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconPlus = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconPlay = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const IconPause = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

export const IconCheck = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconClose = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconKeep = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 4h12v16l-6-4-6 4z" />
  </svg>
);

export const IconNext = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const IconOut = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

export const IconChevron = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconDeck = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const IconLink = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" />
  </svg>
);

export const IconCopy = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </svg>
);

export const IconBell = ({ size = 18, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const IconUser = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);
