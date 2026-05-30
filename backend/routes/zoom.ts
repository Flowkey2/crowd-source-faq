import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';
import {
  connectZoom,
  callbackZoom,
  disconnectZoom,
  zoomStatus,
} from '../controllers/zoomAuthController.js';
import {
  handleZoomChallenge,
  handleZoomWebhook,
  listMeetings,
  getMeeting,
  listInsights,
  updateInsight,
} from '../controllers/zoomController.js';

const router = Router();

// ── OAuth (per-user) ──────────────────────────────────────────────────────────
// GET /api/zoom/auth/connect   — redirect to Zoom OAuth
// GET /api/zoom/auth/callback — Zoom OAuth redirect URI
// DELETE /api/zoom/auth/disconnect — unlink Zoom account
// GET    /api/zoom/auth/status   — check connection status
router.get('/auth/connect',    protect, connectZoom);
router.get('/auth/callback',   callbackZoom);
router.delete('/auth/disconnect', protect, disconnectZoom);
router.get('/auth/status',     protect, zoomStatus);

// ── Webhook (no auth — Zoom calls this) ───────────────────────────────────────
router.get('/webhook',  handleZoomChallenge);
router.post('/webhook', handleZoomWebhook);

// ── Admin-only CRUD ────────────────────────────────────────────────────────────
router.use(protect, authorize('admin'));

router.get('/meetings', listMeetings);
router.get('/meetings/:id', getMeeting);
router.get('/insights', listInsights);
router.put('/insights/:id', updateInsight);

export default router;
