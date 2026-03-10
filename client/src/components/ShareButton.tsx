import { useState } from 'react';
import { createSellerShare } from '../lib/api';
import { useUserStatus } from '../lib/useUserStatus';

interface ShareButtonProps {
  productId: string;
  productName?: string;
  sellerId?: string;
  size?: 'sm' | 'md';
}

export default function ShareButton({ productId, productName, sellerId, size = 'sm' }: ShareButtonProps) {
  const { data: userStatus } = useUserStatus();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const userId = userStatus?.user?.id;
  const isSeller = userStatus?.user?.contactType?.includes('Seller') ?? false;

  // Only show for sellers viewing their own products
  if (!isSeller || !userId || (sellerId && sellerId !== userId)) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    setBusy(true);
    try {
      const result = await createSellerShare({
        label: productName ? `${productName}` : undefined,
        productIds: [productId],
      });
      await navigator.clipboard.writeText(result.shareUrl);
      setToast('Link copied!');
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast('Failed');
      setTimeout(() => setToast(null), 2000);
    } finally {
      setBusy(false);
    }
  };

  const iconSize = size === 'md' ? 'h-7 w-7' : 'h-6 w-6';

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={busy}
        className={`rounded-full p-1.5 transition-colors ${
          busy
            ? 'text-brand-blue animate-pulse'
            : 'text-gray-400 hover:text-brand-blue dark:text-gray-500 dark:hover:text-brand-sage'
        }`}
        aria-label="Quick share"
        title="Quick share — copies link to clipboard"
      >
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
        </svg>
      </button>
      {toast && (
        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-brand-teal px-2 py-0.5 text-[10px] font-medium text-white shadow-lg z-10">
          {toast}
        </span>
      )}
    </div>
  );
}
