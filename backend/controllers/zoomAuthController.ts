/**
 * Zoom OAuth controller — handles per-user connect + callback.
 *
 * Flow:
 *   1. User clicks "Connect Zoom" → GET /api/zoom/auth/connect
 *      → redirect to Zoom authorization page
 *   2. Zoom redirects back → GET /api/zoom/auth/callback?code=...&state=...
 *      → exchange code → store tokens in user document
 *   3. User can disconnect → DELETE /api/zoom/auth/disconnect
 */

import { Request, Response } from 'express';
import User from '../models/User.js';
import { buildZoomAuthUrl, exchangeCodeForTokens, getZoomUserId } from '../utils/zoomOAuth.js';
import { logger } from '../utils/logger.js';

// ─── Connect ────────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/connect
 * Returns the Zoom OAuth authorization URL for the frontend to redirect to.
 */
export function connectZoom(req: Request, res: Response): void {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const authUrl = buildZoomAuthUrl(userId);
  logger.info(`[Zoom OAuth] User ${userId} initiated Zoom connect`);
  res.json({ authUrl });
}

// ─── Callback ────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/callback
 * Zoom redirects here after the user approves the OAuth request.
 * We exchange the code for tokens and store them in the user's document.
 */
export async function callbackZoom(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  // Handle user denial or error
  if (error) {
    logger.warn(`[Zoom OAuth] User denied or error: ${error}`);
    // Redirect back to frontend with error
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ message: 'Missing code or state' });
    return;
  }

  // Decode the user's internal ID from the state param
  let userId: string;
  try {
    userId = Buffer.from(state, 'base64').toString('utf8');
  } catch {
    res.status(400).json({ message: 'Invalid state parameter' });
    return;
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get the user's Zoom ID (used to route webhook events)
    const zoomUserId = await getZoomUserId(tokens.access_token);

    // Store tokens in user document
    await User.findByIdAndUpdate(userId, {
      zoomConnected:     true,
      zoomUserId,
      zoomAccessToken:   tokens.access_token,
      zoomRefreshToken:  tokens.refresh_token,
      zoomTokenExpiry:   new Date(Date.now() + tokens.expires_in * 1000),
      zoomConnectedAt:   new Date(),
    });

    logger.info(`[Zoom OAuth] User ${userId} connected Zoom account ${zoomUserId}`);

    // Redirect back to frontend success page
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed';
    logger.error(`[Zoom OAuth] Callback error for user ${userId}: ${msg}`);
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent(msg)}`);
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

/**
 * DELETE /api/zoom/auth/disconnect
 * Revokes Zoom tokens and unlinks the user's Zoom account.
 */
export async function disconnectZoom(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  await User.findByIdAndUpdate(userId, {
    zoomConnected:    false,
    zoomUserId:       undefined,
    zoomAccessToken:  undefined,
    zoomRefreshToken: undefined,
    zoomTokenExpiry:  undefined,
    zoomConnectedAt:  undefined,
  });

  logger.info(`[Zoom OAuth] User ${userId} disconnected Zoom`);
  res.json({ message: 'Zoom account disconnected' });
}

// ─── Status ────────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/status
 * Returns whether the authenticated user has connected their Zoom account.
 */
export async function zoomStatus(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const user = await User.findById(userId).select('zoomConnected zoomConnectedAt zoomUserId');
  res.json({
    connected:   user?.zoomConnected ?? false,
    connectedAt: user?.zoomConnectedAt,
    zoomUserId:  user?.zoomUserId,
  });
}
