/**
 * Zoom Server-to-Server OAuth client.
 * Handles token acquisition + caching so we don't re-auth on every transcript fetch.
 *
 * Zoom Docs: https://developers.zoom.us/docs/internal-apps/s2s-oauth/
 */

interface ZoomTokenCache {
  token: string;
  expiresAt: number; // Unix ms
}

let tokenCache: ZoomTokenCache | null = null;

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

/**
 * Returns a valid Zoom access token, refreshing if expired.
 */
export async function getZoomAccessToken(): Promise<string> {
  // Return cached token if we have one that's still valid for at least 60s
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Missing ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, or ZOOM_CLIENT_SECRET env vars');
  }

  // Server-to-Server OAuth: POST /oauth/token?grant_type=account_credentials
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(
    `${ZOOM_TOKEN_URL}?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom OAuth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number; // seconds
    token_type: string;
  };

  // Cache with a 60-second safety buffer before actual expiry
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.token;
}

/**
 * Fetches the raw transcript VTT content from Zoom's pre-signed download URL.
 */
export async function downloadTranscript(downloadUrl: string): Promise<string> {
  const token = await getZoomAccessToken();

  const res = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download transcript (${res.status})`);
  }

  return res.text();
}

/**
 * Makes an authenticated GET request to the Zoom REST API.
 */
export async function zoomApiGet<T = unknown>(path: string): Promise<T> {
  const token = await getZoomAccessToken();
  const res = await fetch(`${ZOOM_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom API error ${res.status} for ${path}: ${text}`);
  }

  return res.json() as Promise<T>;
}
