import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface TermTooltipProps {
  term: string;
  definition: string;
}

export const TermTooltip: React.FC<TermTooltipProps> = ({ term, definition }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center gap-1 align-middle ml-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        aria-label={`${term} 용어 설명`}
        className="text-teal-600 hover:text-teal-700 focus:outline-hidden cursor-pointer p-0.5"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-lg z-50 leading-relaxed font-sans normal-case pointer-events-none">
          <p className="font-bold text-teal-300 mb-1">{term}</p>
          <p>{definition}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </span>
  );
};
