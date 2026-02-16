import { useState, useEffect, useRef } from 'react';
import { getFileUrl } from '../lib/api';

// In-memory cache for presigned URLs (50 min TTL out of 60 min server TTL)
const urlCache = new Map<string, { url: string; expires: number }>();
const CACHE_TTL_MS = 50 * 60 * 1000;

function isLegacyOrProxyUrl(src: string): boolean {
  return src.startsWith('/uploads/') || src.startsWith('/api/zoho-files/') || src.startsWith('http://') || src.startsWith('https://');
}

async function resolveUrl(key: string): Promise<string> {
  const cached = urlCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  const url = await getFileUrl(key);
  urlCache.set(key, { url, expires: Date.now() + CACHE_TTL_MS });
  return url;
}

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

export default function ProductImage({ src, alt, className = '', onClick }: ProductImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!src) return;

    if (isLegacyOrProxyUrl(src)) {
      setResolvedUrl(src);
      setLoading(false);
      return;
    }

    // S3 key — resolve via presigned URL
    setLoading(true);
    resolveUrl(src)
      .then((url) => {
        if (mountedRef.current) {
          setResolvedUrl(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setResolvedUrl(null);
          setLoading(false);
        }
      });
  }, [src]);

  if (loading) {
    return (
      <div className={`animate-pulse bg-brand-gray/20 dark:bg-slate-700/40 ${className}`} />
    );
  }

  if (!resolvedUrl) return null;

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      className={className}
      onClick={onClick}
    />
  );
}
