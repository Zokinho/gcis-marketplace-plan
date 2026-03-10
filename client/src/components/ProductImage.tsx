import { useState, useEffect, useRef } from 'react';
import { getFileUrl, fetchZohoFileBlob } from '../lib/api';

// In-memory cache for resolved URLs (50 min TTL)
const urlCache = new Map<string, { url: string; expires: number }>();
const failedKeys = new Set<string>();
const CACHE_TTL_MS = 50 * 60 * 1000;

function isDirectUrl(src: string): boolean {
  return src.startsWith('/uploads/') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/api/shares/public/');
}

function isZohoProxy(src: string): boolean {
  return src.startsWith('/api/zoho-files/');
}

async function resolveUrl(key: string): Promise<string> {
  if (failedKeys.has(key)) throw new Error('Previously failed');

  const cached = urlCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  let url: string;
  if (isZohoProxy(key)) {
    // Fetch via authenticated API client → blob URL
    url = await fetchZohoFileBlob(key);
  } else {
    // S3 presigned URL
    url = await getFileUrl(key);
  }
  urlCache.set(key, { url, expires: Date.now() + CACHE_TTL_MS });
  return url;
}

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  onLoadError?: () => void;
}

export default function ProductImage({ src, alt, className = '', onClick, onLoadError }: ProductImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!src) return;

    // Reset error state when src changes
    setErrored(false);

    if (failedKeys.has(src)) {
      setResolvedUrl(null);
      setLoading(false);
      setErrored(true);
      onLoadError?.();
      return;
    }

    if (isDirectUrl(src)) {
      setResolvedUrl(src);
      setLoading(false);
      return;
    }

    // Zoho proxy or S3 key — resolve via authenticated fetch
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
          failedKeys.add(src);
          setResolvedUrl(null);
          setLoading(false);
          setErrored(true);
          onLoadError?.();
        }
      });
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className={`animate-pulse bg-brand-gray/20 dark:bg-slate-700/40 ${className}`} />
    );
  }

  if (!resolvedUrl || errored) return null;

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => {
        // Image data was fetched but browser can't render it (invalid/corrupt content)
        failedKeys.add(src);
        urlCache.delete(src);
        setErrored(true);
        onLoadError?.();
      }}
    />
  );
}
