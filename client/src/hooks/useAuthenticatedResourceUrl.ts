import { useEffect, useState } from 'react';
import { isProtectedSameOriginApiUrl } from '../lib/apiCredentialBoundary';

export function useAuthenticatedResourceUrl(resourceUrl: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!resourceUrl) {
      setResolvedUrl(null);
      return;
    }
    if (!isProtectedSameOriginApiUrl(resourceUrl)) {
      setResolvedUrl(resourceUrl);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setResolvedUrl(null);
    window.fetch(resourceUrl, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Resource fetch failed with status ${response.status}.`);
        return response.blob();
      })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResolvedUrl(null);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resourceUrl]);

  return resolvedUrl;
}
