/**
 * Zoom OAuth 2.0 utilities for per-user token management.
 *
 * Handles:
 *   - Authorization URL generation
 *   - Token exchange (auth code → access/refresh tokens)
 *   - Token refresh
 *   - Per-user token lookup + refresh-before-use pattern
 */

import User from '../models/User.js';

// ─── Config ─────────────────────────────────────────────────────────────────

const ZOOM_AUTH_URL    = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL   = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE    = 'https://api.zoom.us/v2';

const CLIENT_ID     = process.env.ZOOM_CLIENT_ID     ?? '';
const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET ?? '';
const REDIRECT_URI  = process.env.ZOOM_REDIRECT_URI   ?? 'http://localhost:5173/api/zoom/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Missing ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET env vars');
}

// ─── Authorization URL ────────────────────────────────────────────────────────

/**
 * Build the Zoom OAuth authorization URL for a given user.
 * The state param encodes the user's internal ID so we know who to link on callback.
 */
export function buildZoomAuthUrl(internalUserId: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: Buffer.from(internalUserId).toString('base64'), // encode user ID in state
  });
  return `${ZOOM_AUTH_URL}?${params}`;
}

// ─── Token Exchange ────────────────────────────────────────────────────────────

interface ZoomTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  scope: string;
}

/**
 * Exchange an authorization code for Zoom tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<ZoomTokens> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${ZOOM_TOKEN_URL}?grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<ZoomTokens>;
}

/**
 * Refresh a user's Zoom tokens using their stored refresh token.
 */
export async function refreshZoomTokens(refreshToken: string): Promise<ZoomTokens> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${ZOOM_TOKEN_URL}?grant_type=refresh_token&refresh_token=${refreshToken}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<ZoomTokens>;
}

// ─── Per-user token management ────────────────────────────────────────────────

/**
 * Get a valid Zoom access token for a user.
 * If the stored token is expired or about to expire, automatically refreshes it.
 * Updates the user's document with new tokens if a refresh happened.
 */
export async function getUserZoomToken(userId: string): Promise<string> {
  const user = await User.findById(userId).select('+zoomAccessToken +zoomRefreshToken +zoomTokenExpiry');
  if (!user || !user.zoomConnected || !user.zoomAccessToken) {
    throw new Error('User has not connected their Zoom account');
  }

  // Refresh if expired or expiring within 60 seconds
  const isExpired = !user.zoomTokenExpiry || Date.now() >= user.zoomTokenExpiry.getTime() - 60_000;

  if (isExpired) {
    if (!user.zoomRefreshToken) throw new Error('No refresh token — user needs to reconnect Zoom');

    const tokens = await refreshZoomTokens(user.zoomRefreshToken);

    user.zoomAccessToken  = tokens.access_token;
    user.zoomRefreshToken = tokens.refresh_token;
    user.zoomTokenExpiry  = new Date(Date.now() + tokens.expires_in * 1000);
    await user.save();

    return user.zoomAccessToken;
  }

  return user.zoomAccessToken;
}

/**
 * Fetch the Zoom user's own ID (used to link webhook events to our user).
 */
export async function getZoomUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${ZOOM_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to get Zoom user info (${res.status})`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

// ─── API helpers (using user's token) ─────────────────────────────────────────

/**
 * Make an authenticated Zoom API call using a user's stored token.
 */
export async function zoomApiAsUser<T = unknown>(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getUserZoomToken(userId);
  const res = await fetch(`${ZOOM_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom API error ${res.status} for ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Download a transcript file using a user's stored token.
 */
export async function downloadTranscriptAsUser(userId: string, downloadUrl: string): Promise<string> {
  const token = await getUserZoomToken(userId);
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Transcript download failed (${res.status})`);
  return res.text();
}
