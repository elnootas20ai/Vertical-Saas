import { Check } from 'lucide-react';

interface PricingCardProps {
  name: string;
  price: number;
  description: string;
  idealFor: string;
  features: string[];
  notIncluded: string[];
  highlighted?: boolean;
}

export function PricingCard({ 
  name, 
  price, 
  description, 
  idealFor, 
  features, 
  notIncluded,
  highlighted = false 
}: PricingCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-8 ${highlighted ? 'border-2 border-[#0f1419] shadow-lg' : 'border border-gray-200 dark:border-gray-700'}`}>
      <h3 className="text-xl font-semibold mb-1">{name}</h3>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">{description}</p>
      
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-bold">€{price}</span>
          <span className="text-gray-600 dark:text-gray-400">/mes</span>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{idealFor}</p>

      <button className={`w-full py-3 px-4 rounded-lg transition-colors mb-6 ${
        highlighted 
          ? 'bg-[#0f1419] text-white hover:bg-[#1a1f26]' 
          : 'border border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}>
        Empezar prueba gratis →
      </button>

      <div className="space-y-3 mb-6">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start gap-2">
            <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
          </div>
        ))}
      </div>

      {notIncluded.length > 0 && (
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">No incluye</p>
          <ul className="space-y-2">
            {notIncluded.map((item, index) => (
              <li key={index} className="text-sm text-gray-600 dark:text-gray-400">• {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
