const PUBLIC_API_OPERATIONS = new Set(['POST /api/auth/dm', 'GET /api/health']);

export function isProtectedSameOriginApiUrl(
  rawUrl: string,
  pageUrl = window.location.href,
  method = 'GET',
): boolean {
  const url = new URL(rawUrl, pageUrl);
  const page = new URL(pageUrl);
  return url.origin === page.origin
    && url.pathname.startsWith('/api/')
    && !PUBLIC_API_OPERATIONS.has(`${method.toUpperCase()} ${url.pathname}`);
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function mergedHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  }
  return headers;
}

export function installApiCredentialBoundary(): void {
  const originalFetch = window.fetch.bind(window);
  if ((window.fetch as typeof window.fetch & { apiCredentialBoundary?: boolean }).apiCredentialBoundary) return;

  const authenticatedFetch: typeof window.fetch = (input, init) => {
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (!isProtectedSameOriginApiUrl(requestUrl(input), window.location.href, method)) {
      return originalFetch(input, init);
    }

    const token = window.localStorage.getItem('dm_token');
    if (!token) return originalFetch(input, init);

    const headers = mergedHeaders(input, init);
    if (!headers.has('authorization') && !headers.has('x-dm-token')) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return originalFetch(input, { ...init, headers });
  };

  (authenticatedFetch as typeof window.fetch & { apiCredentialBoundary?: boolean }).apiCredentialBoundary = true;
  window.fetch = authenticatedFetch;
}

export async function downloadAuthenticatedApiFile(url: string, filename: string): Promise<void> {
  if (!isProtectedSameOriginApiUrl(url)) throw new Error('Download URL is outside the protected API boundary.');
  const response = await window.fetch(url);
  if (!response.ok) throw new Error(`Download failed with status ${response.status}.`);

  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
