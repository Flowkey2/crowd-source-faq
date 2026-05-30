/**
 * Zoom Controller — per-user OAuth + webhook handler + admin CRUD.
 *
 * OAuth flow (per-user):
 *   User clicks "Connect Zoom" → /api/zoom/auth/connect → Zoom → /api/zoom/auth/callback
 *   → tokens stored in User document, linked via zoomUserId
 *
 * Webhook flow (per-user):
 *   Zoom fires POST /api/zoom/webhook with event + user_id
 *   → look up user by zoomUserId → use their stored token to download transcript
 *   → parse → store segments + insights
 *
 * Privacy: meetings matching ZOOM_TOPIC_BLACKLIST are skipped.
 */

import { Request, Response } from 'express';
import { ZoomMeeting, ZoomInsight } from '../models/ZoomMeeting.js';
import User from '../models/User.js';
import { downloadTranscriptAsUser } from '../utils/zoomOAuth.js';
import { parseVTT, parseVTTWithSpeakers, isEmptyTranscript } from '../utils/vttParser.js';
import { extractInsightsFromTranscript } from '../utils/zoomExtractor.js';
import { logger } from '../utils/logger.js';

// ─── Webhook Validation ──────────────────────────────────────────────────────

export async function handleZoomChallenge(req: Request, res: Response): Promise<void> {
  const { challenge } = req.query;
  if (!challenge || typeof challenge !== 'string') {
    res.status(400).send('Missing challenge');
    return;
  }
  res.setHeader('Content-Type', 'text/plain');
  res.send(challenge);
}

// ─── Webhook Event Handler ────────────────────────────────────────────────────

export async function handleZoomWebhook(req: Request, res: Response): Promise<void> {
  res.status(200).json({ received: true });

  const body = req.body as ZoomWebhookPayload;
  const event = body.event;

  logger.info(`[Zoom Webhook] event=${event}`, { zoomEvent: body });

  if (event === 'recording.transcript_completed' || event === 'recording.completed') {
    processRecordingEvent(body).catch((err) => {
      logger.error('[Zoom Webhook] Background processing failed', { error: err.message });
    });
  }
}

// ─── Background Processing (per-user token) ─────────────────────────────────

async function processRecordingEvent(payload: ZoomWebhookPayload): Promise<void> {
  const obj = payload.payload?.object ?? {};

  const zoomUserId = String(obj.host_id ?? '');
  const zoomMeetingId = String(obj.id ?? '');
  const topic = String(obj.topic ?? 'Untitled Meeting').trim();

  // ── Privacy: skip blacklisted meetings ──────────────────────────────────
  if (isBlacklisted(topic)) {
    logger.info(`[Zoom] Skipping blacklisted meeting: "${topic}"`);
    return;
  }

  // ── Find our user by their Zoom user ID ───────────────────────────────
  const user = await User.findOne({ zoomUserId, zoomConnected: true });
  if (!user) {
    logger.warn(`[Zoom] No connected user found for Zoom user ID: ${zoomUserId}`);
    return;
  }

  // ── Deduplication: skip if already processed ─────────────────────────────
  const existing = await ZoomMeeting.findOne({ zoomMeetingId, userId: user._id });
  if (existing) {
    logger.info(`[Zoom] Meeting ${zoomMeetingId} already processed for user ${user._id}`);
    return;
  }

  // ── Find transcript file URL ───────────────────────────────────────────
  const transcriptFile = (obj.recording_files ?? []).find(
    (f: RecordingFile) => f.file_type === 'TRANSCRIPT' || f.file_type === 'CC'
  ) as RecordingFile | undefined;
  const downloadUrl = transcriptFile?.download_url;
  if (!downloadUrl) {
    logger.warn(`[Zoom] No transcript URL in meeting ${zoomMeetingId}`);
    return;
  }

  const startTime = obj.start_time ? new Date(obj.start_time) : new Date();
  const duration = obj.duration;

  // ── Create meeting record ───────────────────────────────────────────────
  const meeting = await ZoomMeeting.create({
    userId: user._id,
    zoomMeetingId,
    topic,
    startTime,
    duration,
    rawTranscriptUrl: downloadUrl,
    status: 'pending',
  });

  logger.info(`[Zoom] Created meeting record ${meeting._id} for Zoom ID ${zoomMeetingId} (user: ${user._id})`);

  // ── Async: download + parse + extract using user's token ────────────────
  processTranscriptForUser(meeting, user._id.toString()).catch((err) => {
    logger.error(`[Zoom] processTranscript failed for meeting ${meeting._id}`, { error: err.message });
  });
}

/**
 * Full pipeline using the authenticated user's token.
 */
export async function processTranscriptForUser(
  meeting: InstanceType<typeof ZoomMeeting>,
  userId: string
): Promise<void> {
  await ZoomMeeting.findByIdAndUpdate(meeting._id, {
    status: 'processing',
    processingStartedAt: new Date(),
  });

  try {
    // Download using the user's token
    const rawVtt = await downloadTranscriptAsUser(userId, meeting.rawTranscriptUrl!);

    if (isEmptyTranscript(rawVtt)) {
      await ZoomMeeting.findByIdAndUpdate(meeting._id, {
        status: 'failed',
        errorMessage: 'Transcript is empty or too short to process.',
        processingCompletedAt: new Date(),
      });
      return;
    }

    const segments = parseVTTWithSpeakers(rawVtt);
    const plainText = parseVTT(rawVtt);

    await ZoomMeeting.findByIdAndUpdate(meeting._id, {
      rawTranscriptText: plainText.slice(0, 50_000),
    });

    // Extract structured insights
    const items = await extractInsightsFromTranscript(plainText, meeting.topic);

    const insightDocs = items.map((item) => ({
      meetingId: meeting._id,
      type: item.type,
      question: item.question,
      answer_or_content: item.answer_or_content,
      confidence_score: item.confidence_score,
      transcript_snippet: item.transcript_snippet,
      status: 'pending_review' as const,
    }));

    if (insightDocs.length > 0) {
      await ZoomInsight.insertMany(insightDocs);
    }

    await ZoomMeeting.findByIdAndUpdate(meeting._id, {
      status: 'completed',
      insightCount: insightDocs.length,
      processingCompletedAt: new Date(),
    });

    logger.info(`[Zoom] Processed meeting ${meeting._id}: ${insightDocs.length} insights extracted.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ZoomMeeting.findByIdAndUpdate(meeting._id, {
      status: 'failed',
      errorMessage: msg,
      processingCompletedAt: new Date(),
    });
    throw err;
  }
}

// ─── Admin Endpoints ────────────────────────────────────────────────────────────

export async function listMeetings(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
  const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  const filter: Record<string, unknown> = {};
  if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
    filter.status = status;
  }

  const [meetings, total] = await Promise.all([
    ZoomMeeting.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit),
    ZoomMeeting.countDocuments(filter),
  ]);

  res.json({ meetings, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function getMeeting(req: Request, res: Response): Promise<void> {
  const meeting = await ZoomMeeting.findById(req.params.id);
  if (!meeting) {
    res.status(404).json({ message: 'Meeting not found' });
    return;
  }
  const insights = await ZoomInsight.find({ meetingId: meeting._id }).sort({ confidence_score: -1 });
  res.json({ meeting, insights });
}

export async function listInsights(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
  const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const [insights, total] = await Promise.all([
    ZoomInsight.find(filter)
      .populate('meetingId', 'topic startTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ZoomInsight.countDocuments(filter),
  ]);

  res.json({ insights, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function updateInsight(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status?: 'approved' | 'rejected' };
  const insight = await ZoomInsight.findById(req.params.id);
  if (!insight) {
    res.status(404).json({ message: 'Insight not found' });
    return;
  }

  if (status) {
    insight.status = status;
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    if (userId) {
      insight.reviewedBy = new (await import('mongoose')).Types.ObjectId(userId);
    }
    insight.reviewedAt = new Date();
  }

  await insight.save();
  logger.info(`[Zoom Insight] ${status} by user ${(req as Request & { user?: { id: string } }).user?.id}: ${insight._id}`);
  res.json({ insight });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBlacklisted(topic: string): boolean {
  const raw = process.env.ZOOM_TOPIC_BLACKLIST ?? '';
  if (!raw.trim()) return false;
  return raw.split(',').some((pattern) => {
    try {
      return new RegExp(pattern.trim(), 'i').test(topic);
    } catch {
      return false;
    }
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ZoomWebhookPayload {
  event: string;
  payload?: {
    account_id?: string;
    object?: {
      id?: string | number;
      uuid?: string;
      topic?: string;
      start_time?: string;
      duration?: number;
      host_id?: string;       // Zoom user ID — key for per-user lookup
      recording_files?: RecordingFile[];
    };
  };
}

interface RecordingFile {
  id?: string;
  file_type?: string;
  download_url?: string;
}
