import { ReactNode } from 'react';

interface LicenseInfoCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function LicenseInfoCard({ icon, title, description }: LicenseInfoCardProps) {
  return (
    <div className="flex gap-4">
      <div className="w-12 h-12 bg-[#0f1419] rounded-lg flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}
