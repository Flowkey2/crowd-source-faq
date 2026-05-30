import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  connectZoom,
  callbackZoom,
  disconnectZoom,
  zoomStatus,
} from '../controllers/zoomAuthController.js';

const router = Router();

// GET /api/zoom/auth/connect  — redirect to Zoom OAuth
router.get('/auth/connect', protect, connectZoom);

// GET /api/zoom/auth/callback  — Zoom OAuth redirect URI
router.get('/auth/callback', callbackZoom);

// DELETE /api/zoom/auth/disconnect  — unlink Zoom account
router.delete('/auth/disconnect', protect, disconnectZoom);

// GET /api/zoom/auth/status  — check connection status
router.get('/auth/status', protect, zoomStatus);

export default router;
