import React from 'react';

// ─── SVG Illustrations ────────────────────────────────────────────────────────

function VehiclesIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Road */}
      <rect x="10" y="88" width="140" height="20" rx="4" fill="#f1f5f9" />
      <rect x="74" y="95" width="12" height="4" rx="2" fill="#cbd5e1" />
      <rect x="50" y="95" width="12" height="4" rx="2" fill="#e2e8f0" />
      <rect x="98" y="95" width="12" height="4" rx="2" fill="#e2e8f0" />
      {/* Car body */}
      <rect x="30" y="62" width="100" height="30" rx="6" fill="#e2e8f0" />
      {/* Car roof */}
      <path d="M55 62 L65 42 L95 42 L105 62" fill="#cbd5e1" rx="3" />
      <rect x="55" y="42" width="50" height="20" rx="4" fill="#cbd5e1" />
      {/* Windows */}
      <rect x="59" y="46" width="18" height="13" rx="3" fill="#bfdbfe" opacity="0.7" />
      <rect x="83" y="46" width="18" height="13" rx="3" fill="#bfdbfe" opacity="0.7" />
      {/* Wheels */}
      <circle cx="55" cy="92" r="10" fill="#94a3b8" />
      <circle cx="55" cy="92" r="6" fill="#e2e8f0" />
      <circle cx="55" cy="92" r="2.5" fill="#94a3b8" />
      <circle cx="105" cy="92" r="10" fill="#94a3b8" />
      <circle cx="105" cy="92" r="6" fill="#e2e8f0" />
      <circle cx="105" cy="92" r="2.5" fill="#94a3b8" />
      {/* Headlights */}
      <rect x="128" y="68" width="8" height="6" rx="2" fill="#fde68a" opacity="0.8" />
      <rect x="24" y="68" width="8" height="6" rx="2" fill="#fde68a" opacity="0.5" />
      {/* Decorative dots */}
      <circle cx="20" cy="30" r="4" fill="#e2e8f0" />
      <circle cx="140" cy="20" r="6" fill="#f1f5f9" />
      <circle cx="145" cy="45" r="3" fill="#e2e8f0" />
      <circle cx="15" cy="55" r="3" fill="#f1f5f9" />
    </svg>
  );
}

function ClientsIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Background circles */}
      <circle cx="80" cy="60" r="45" fill="#f8fafc" />
      {/* Person 1 (center, larger) */}
      <circle cx="80" cy="42" r="16" fill="#e2e8f0" />
      <circle cx="80" cy="38" r="10" fill="#cbd5e1" />
      <path d="M55 80 Q55 62 80 62 Q105 62 105 80" fill="#e2e8f0" />
      {/* Person 2 (left) */}
      <circle cx="44" cy="52" r="12" fill="#f1f5f9" />
      <circle cx="44" cy="49" r="7.5" fill="#e2e8f0" />
      <path d="M25 82 Q25 68 44 68 Q63 68 63 82" fill="#f1f5f9" opacity="0.7" />
      {/* Person 3 (right) */}
      <circle cx="116" cy="52" r="12" fill="#f1f5f9" />
      <circle cx="116" cy="49" r="7.5" fill="#e2e8f0" />
      <path d="M97 82 Q97 68 116 68 Q135 68 135 82" fill="#f1f5f9" opacity="0.7" />
      {/* Connection lines */}
      <line x1="60" y1="62" x2="44" y2="68" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="3 2" />
      <line x1="100" y1="62" x2="116" y2="68" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="3 2" />
      {/* Plus badge */}
      <circle cx="95" cy="28" r="10" fill="#dbeafe" />
      <path d="M95 23 L95 33 M90 28 L100 28" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function TeamIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Card background */}
      <rect x="20" y="25" width="120" height="75" rx="10" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
      {/* Avatar placeholder */}
      <circle cx="50" cy="55" r="16" fill="#e2e8f0" />
      <circle cx="50" cy="51" r="9" fill="#cbd5e1" />
      <path d="M30 77 Q30 65 50 65 Q70 65 70 77" fill="#e2e8f0" clipPath="inset(0 0 0 0 round 10px)" />
      {/* Lines (name, role) */}
      <rect x="80" y="45" width="48" height="7" rx="3.5" fill="#e2e8f0" />
      <rect x="80" y="58" width="32" height="5" rx="2.5" fill="#f1f5f9" />
      {/* Permission dots */}
      <circle cx="80" cy="72" r="4" fill="#bbf7d0" />
      <circle cx="92" cy="72" r="4" fill="#bbf7d0" />
      <circle cx="104" cy="72" r="4" fill="#fde68a" />
      <circle cx="116" cy="72" r="4" fill="#f1f5f9" />
      {/* Invite badge */}
      <circle cx="125" cy="30" r="12" fill="#dbeafe" />
      <path d="M125 25 L125 35 M120 30 L130 30" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
      {/* Decorative */}
      <circle cx="25" cy="25" r="4" fill="#f1f5f9" />
      <circle cx="140" cy="95" r="5" fill="#f1f5f9" />
    </svg>
  );
}

function SearchIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Magnifying glass */}
      <circle cx="70" cy="55" r="28" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="3" />
      <circle cx="70" cy="55" r="20" fill="#f8fafc" />
      {/* Question mark */}
      <text x="63" y="62" fontSize="18" fill="#cbd5e1" fontFamily="system-ui" fontWeight="700">?</text>
      {/* Handle */}
      <line x1="92" y1="77" x2="112" y2="97" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
      {/* Dots */}
      <circle cx="30" cy="30" r="4" fill="#f1f5f9" />
      <circle cx="140" cy="30" r="6" fill="#f1f5f9" />
      <circle cx="135" cy="65" r="3.5" fill="#f1f5f9" />
      <circle cx="25" cy="85" r="3" fill="#f1f5f9" />
    </svg>
  );
}

function GenericIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Box */}
      <rect x="35" y="45" width="90" height="60" rx="8" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
      {/* Box top flaps */}
      <path d="M35 55 L80 45 L125 55" stroke="#e2e8f0" strokeWidth="2" fill="none" />
      <path d="M80 45 L80 55" stroke="#e2e8f0" strokeWidth="2" />
      {/* Lines inside */}
      <rect x="50" y="70" width="60" height="5" rx="2.5" fill="#e2e8f0" />
      <rect x="55" y="82" width="50" height="5" rx="2.5" fill="#e2e8f0" />
      {/* Decorative */}
      <circle cx="25" cy="35" r="5" fill="#f1f5f9" />
      <circle cx="140" cy="30" r="7" fill="#f8fafc" />
      <circle cx="145" cy="60" r="4" fill="#f1f5f9" />
    </svg>
  );
}

// ─── Additional Illustrations ────────────────────────────────────────────────

function SalesIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="25" y="30" width="110" height="75" rx="8" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
      <rect x="35" y="48" width="90" height="6" rx="3" fill="#e2e8f0" />
      <rect x="35" y="62" width="65" height="5" rx="2.5" fill="#f1f5f9" />
      <rect x="35" y="74" width="75" height="5" rx="2.5" fill="#f1f5f9" />
      <circle cx="118" cy="38" r="14" fill="#dcfce7" />
      <path d="M112 38 L116 42 L124 34" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="25" r="5" fill="#f1f5f9" />
      <circle cx="145" cy="95" r="6" fill="#f8fafc" />
    </svg>
  );
}

function DocumentsIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="50" y="20" width="70" height="88" rx="6" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
      <rect x="40" y="28" width="70" height="88" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
      <rect x="30" y="36" width="70" height="88" rx="6" fill="white" stroke="#e2e8f0" strokeWidth="2" />
      <rect x="42" y="56" width="46" height="5" rx="2.5" fill="#e2e8f0" />
      <rect x="42" y="67" width="36" height="4" rx="2" fill="#f1f5f9" />
      <rect x="42" y="77" width="40" height="4" rx="2" fill="#f1f5f9" />
      <circle cx="42" cy="47" r="7" fill="#fef3c7" />
      <path d="M39 47 L41.5 49.5 L46 44" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LeadsIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="80" cy="50" r="24" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
      <circle cx="80" cy="44" r="11" fill="#e2e8f0" />
      <path d="M56 78 Q56 64 80 64 Q104 64 104 78" fill="#e2e8f0" />
      <path d="M110 35 L135 20" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="3 2" />
      <circle cx="138" cy="18" r="8" fill="#dbeafe" />
      <path d="M134 18 L137 21 L143 14" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="88" r="5" fill="#f1f5f9" />
      <circle cx="145" cy="75" r="4" fill="#f1f5f9" />
      <circle cx="20" cy="35" r="3" fill="#f1f5f9" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type EmptyStateType = 'vehicles' | 'clients' | 'team' | 'search' | 'generic' | 'sales' | 'documents' | 'leads';

interface EmptyStateProps {
  type?: EmptyStateType;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCta?: () => void;
  className?: string;
}

export function EmptyState({
  type = 'generic',
  title,
  description,
  ctaLabel,
  onCta,
  secondaryCtaLabel,
  onSecondaryCta,
  className = '',
}: EmptyStateProps) {
  const illustrations: Record<EmptyStateType, React.ReactNode> = {
    vehicles: <VehiclesIllustration />,
    clients: <ClientsIllustration />,
    team: <TeamIllustration />,
    search: <SearchIllustration />,
    generic: <GenericIllustration />,
    sales: <SalesIllustration />,
    documents: <DocumentsIllustration />,
    leads: <LeadsIllustration />,
  };

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="w-36 h-28 mb-5 opacity-80 dark:opacity-60">
        {illustrations[type]}
      </div>

      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>

      {description && (
        <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed mb-6 max-w-xs">{description}</p>
      )}

      {!description && (ctaLabel || secondaryCtaLabel) && <div className="mb-6" />}

      {(ctaLabel || secondaryCtaLabel) && (
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {secondaryCtaLabel && onSecondaryCta && (
            <button
              type="button"
              onClick={onSecondaryCta}
              className="px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              {secondaryCtaLabel}
            </button>
          )}
          {ctaLabel && onCta && (
            <button
              type="button"
              onClick={onCta}
              className="px-6 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
