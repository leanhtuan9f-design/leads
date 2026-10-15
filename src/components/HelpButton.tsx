import React from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpButtonProps {
  guideId: string;
  onOpenGuide: (guideId: string) => void;
  className?: string;
  tooltipText?: string;
}

export const HelpButton: React.FC<HelpButtonProps> = ({
  guideId,
  onOpenGuide,
  className = '',
  tooltipText = 'Xem hướng dẫn & logic hoạt động'
}) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenGuide(guideId);
      }}
      className={`inline-flex items-center justify-center p-1 rounded-full text-slate-400 hover:text-blue-400 hover:bg-blue-950/40 border border-slate-700/60 hover:border-blue-500/50 transition-colors group cursor-pointer ${className}`}
      title={tooltipText}
      aria-label={tooltipText}
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  );
};
