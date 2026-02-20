import { useState } from 'react';
import { useShortlist } from '../lib/useShortlist';

interface ShortlistButtonProps {
  productId: string;
  size?: 'sm' | 'md';
}

export default function ShortlistButton({ productId, size = 'sm' }: ShortlistButtonProps) {
  const { isShortlisted, toggle } = useShortlist();
  const [animating, setAnimating] = useState(false);
  const active = isShortlisted(productId);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAnimating(true);
    await toggle(productId);
    setTimeout(() => setAnimating(false), 300);
  };

  const iconSize = size === 'md' ? 'h-7 w-7' : 'h-6 w-6';

  return (
    <button
      onClick={handleClick}
      className={`rounded-full p-1.5 transition-colors ${
        animating ? 'scale-125' : ''
      } ${
        active
          ? 'text-brand-coral dark:text-brand-yellow'
          : 'text-gray-400 hover:text-brand-teal dark:text-gray-500 dark:hover:text-brand-sage'
      }`}
      aria-label={active ? 'Remove from shortlist' : 'Add to shortlist'}
      title={active ? 'Remove from shortlist' : 'Add to shortlist'}
    >
      <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
        {active ? (
          <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v17.5l-7-3.5-7 3.5V4Z" />
        ) : (
          <path fillRule="evenodd" d="M7 2a2 2 0 0 0-2 2v17.5l7-3.5 7 3.5V4a2 2 0 0 0-2-2H7Zm0 1.5h10a.5.5 0 0 1 .5.5v14.88l-5.5-2.75-5.5 2.75V4a.5.5 0 0 1 .5-.5Z" clipRule="evenodd" />
        )}
      </svg>
    </button>
  );
}
