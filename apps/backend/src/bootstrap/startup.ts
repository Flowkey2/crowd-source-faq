import { logger, startupLog } from '../utils/http/logger.js';
import connectDB from '../config/db.js';
import { migrateZoomSettingsToSessions } from '../utils/zoomMigration.js';
import { startBot, stopBot } from '../integrations/discord/discordBot.js';
import { botManager } from '../integrations/discord/botManager.js';
import { startEscalationScheduler, stopEscalationScheduler } from '../modules/community/escalation.controller.js';
import { runScheduledAutoAnswer, stopAutoAnswerScheduler } from '../modules/ai/auto-answer.controller.js';
import { runScheduledFAQAudit, stopFAQAuditScheduler } from '../modules/faq/faq-audit.controller.js';
import { startDocumentWorker, stopDocumentWorker } from '../utils/jobs/documentQueue.js';
import { notificationsService } from '../services/notifications.service.js';
import { banService } from '../services/ban.service.js';
import { cronManager } from '../core/scheduler/cronManager.js';
import mongoose from 'mongoose';
import { jobQueue } from '../utils/http/jobQueue.js';

// Cron job handlers
import { runPromotionCycle } from '../modules/program/promotion.service.js';
import { runFreshnessCheck } from '../modules/faq/freshness.controller.js';
import { clusterAllActiveBatches } from '../utils/ai/categoryClusterer.js';
import { recomputePopularity } from '../modules/faq/public-faq.controller.js';
import { retryFailedMeetings } from '../modules/zoom/retry.service.js';
import { runPromotePopularDocumentInsights } from '../modules/knowledge/document-promotion.controller.js';
import { flushSearchLogs } from '../modules/search/search.controller.js';

const runRetention = async () => {
  try {
    const { cleanSearchLogs, cleanNotifications, cleanFreshReviewLogs, cleanModerationLogs, cleanAdminLogs } = await import('../scripts/retentionPolicy.js');
    await cleanSearchLogs();
    await cleanNotifications();
    await cleanFreshReviewLogs();
    await cleanModerationLogs();
    await cleanAdminLogs();
  } catch (e: unknown) {
    logger.error(`[retention] Policy execution failed: ${(e as Error).message}`);
  }
};

export async function startup(config: any): Promise<void> {
  // Ensure DB connection and migration
  try {
    await connectDB();
    await migrateZoomSettingsToSessions();
  } catch (e) {
    startupLog.error('startup DB connect / migrate failed', { error: (e as Error).message });
  }

  // Lazy-init the RegistrationConfig singleton
  try {
    const { ensureRegistrationConfig } = await import('../modules/program/registration-config.model.js');
    await ensureRegistrationConfig();
  } catch (e) {
    startupLog.warn(`[registrationConfig] ensure failed at startup: ${(e as Error).message}`);
  }

  // Synchronize existing bookmarks (idempotent backfill)
  try {
    const { default: User } = await import('../modules/auth/user.model.js');
    const { default: CommunityPost } = await import('../modules/community/community-post.model.js');
    const users = await User.find({ bookmarks: { $exists: true, $not: { $size: 0 } } }).select('_id bookmarks');
    if (users.length > 0) {
      logger.info(`[startup] Syncing bookmarks for ${users.length} users to community posts...`);
      for (const user of users) {
        for (const postId of user.bookmarks) {
          await CommunityPost.updateOne(
            { _id: postId },
            { $addToSet: { bookmarks: user._id } }
          );
        }
      }
      logger.info(`[startup] Completed bookmarks synchronization.`);
    }
  } catch (err) {
    logger.error(`[startup] Bookmarks sync failed: ${(err as Error).message}`);
  }

  // Start schedulers & bots
  startEscalationScheduler();
  runScheduledAutoAnswer().catch((err) => logger.error(`[autoAnswer] Startup: ${(err as Error).message}`));
  runScheduledFAQAudit().catch((err) => logger.error(`[faqAudit] Startup: ${(err as Error).message}`));

  // Phase 1 R3 — drain any pending notification outbox rows on startup
  // so a restart doesn't sit on unsent notifications. Best-effort.
  notificationsService.drain().catch((err) =>
    logger.error(`[notifications] Startup drain failed: ${(err as Error).message}`),
  );

  void startBot().catch((err) => logger.error(`[bot] startup: ${(err as Error).message}`));
  void botManager.startAll().catch((err) => logger.error(`[botManager] startAll: ${(err as Error).message}`));

  // Register cron tasks
  cronManager.register({
    name: 'promotion-cycle',
    handler: runPromotionCycle,
    intervalMs: config.cron.promotionCycleIntervalMs,
    runOnStartup: true,
  });

  cronManager.register({
    name: 'freshness-check',
    handler: runFreshnessCheck,
    intervalMs: config.cron.freshnessCheckIntervalMs,
    runOnStartup: true,
  });

  // Phase 1 R3 — drain the notification outbox every 60s. Retries
  // any notifications that failed to persist on the original call.
  cronManager.register({
    name: 'notification-outbox-drain',
    handler: () => notificationsService.drain(),
    intervalMs: 60_000,
    runOnStartup: false,
  });

  cronManager.register({
    name: 'category-cluster',
    handler: clusterAllActiveBatches,
    intervalMs: config.cron.categoryClusterIntervalMs,
    runOnStartup: true,
    startupDelayMs: 15_000,
  });

  cronManager.register({
    name: 'popularity-recompute',
    handler: recomputePopularity,
    intervalMs: config.cron.popularityRecomputeIntervalMs,
    runOnStartup: true,
    startupDelayMs: 15_000,
  });

  cronManager.register({
    name: 'retention-policy',
    handler: runRetention,
    intervalMs: config.cron.retentionPolicyIntervalMs,
    runOnStartup: true,
  });

  // Phase 1 R4 — clear expired Golden-bans on a schedule. The
  // existing ad-hoc call inside escalationController still fires
  // (every escalation-check tick) — that's fine, the function is
  // idempotent — but registering it with cronManager here means a
  // future refactor of the escalation scheduler can't silently
  // drop the ban-cleanup schedule. Audit context:
  // docs/redesign-plan.md §2.4 R4.
  cronManager.register({
    name: 'ban-cleanup',
    handler: () => banService.clearExpiredGoldenBans(),
    intervalMs: 60 * 60 * 1000, // 1h, matches escalation cadence
    runOnStartup: true,
  });

  cronManager.register({
    name: 'zoom-retry',
    handler: retryFailedMeetings,
    intervalMs: config.cron.zoomRetryIntervalMs,
    runOnStartup: false,
  });

  const { featureFlags, syncFeatureFlagRegistry } = await import('../services/featureFlags.js');
  // Phase 1 R1: fail-closed boot check. Seed any registry flags that
  // are missing from MongoDB and warn about orphans. Crashing here
  // would prevent the server from booting after a partial deploy;
  // logging is the right level — we don't want to brick prod over
  // an off-by-one in the seed step.
  try {
    await syncFeatureFlagRegistry();
  } catch (e) {
    startupLog.error(`[featureFlags] registry sync failed at startup: ${(e as Error).message}`);
  }

  const pipelineEnabled = await featureFlags.isEnabled('documentPipeline');

  let documentWorkerStarted = false;
  if (pipelineEnabled) {
    documentWorkerStarted = startDocumentWorker();
  } else {
    const { setQueueDisabledByAdmin } = await import('../utils/jobs/documentQueue.js');
    setQueueDisabledByAdmin(true);
  }

  if (documentWorkerStarted) {
    cronManager.register({
      name: 'document-promotion',
      handler: runPromotePopularDocumentInsights,
      intervalMs: config.documents.autoPromote.intervalMs,
      runOnStartup: false,
    });
    logger.info(`[server] document pipeline online (worker + auto-promote every ${config.documents.autoPromote.intervalMs / 1000}s)`);
  } else {
    logger.info('[server] document pipeline offline (disabled by feature flag or not configured)');
  }

  // Phase 3 R12 — auto-answer cron registration. Gated by the
  // community.autoAnswer.enabled feature flag (kill switch). Uses
  // the new services/autoAnswer.ts orchestrator; the legacy
  // setInterval-based scheduler in auto-answer.controller.ts is now
  // a no-op deprecation shim.
  if (await featureFlags.isEnabled('communityAutoAnswer')) {
    const { runAutoAnswerBatch } = await import('../services/autoAnswer.js');
    const autoAnswerIntervalMs = config.cron?.autoAnswerIntervalMs ?? 24 * 60 * 60 * 1000;
    cronManager.register({
      name: 'auto-answer-batch',
      handler: () => runAutoAnswerBatch({}),
      intervalMs: autoAnswerIntervalMs,
      runOnStartup: false,
    });
    logger.info(
      `[server] auto-answer cron registered (every ${autoAnswerIntervalMs / 1000}s, concurrency-locked)`,
    );
  } else {
    logger.info('[server] auto-answer cron disabled (communityAutoAnswer feature flag off)');
  }

  // Start cron manager
  cronManager.startAll();
}

export async function stopAllSchedulers(): Promise<void> {
  // Stop cron intervals
  cronManager.stopAll();

  // Stop escalation scheduler
  stopEscalationScheduler();

  // Stop AI schedulers
  stopAutoAnswerScheduler();
  stopFAQAuditScheduler();

  // Stop Discord bots
  await stopBot();
  await botManager.stopAll();

  // Stop the document queue worker
  await stopDocumentWorker();

  // Flush pending queues & buffered logs
  await jobQueue.flush(15_000);
  await flushSearchLogs();

  // Close MongoDB connection
  await mongoose.connection.close();
}
