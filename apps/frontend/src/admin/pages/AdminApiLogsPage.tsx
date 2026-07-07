/**
 * AdminApiLogsPage — AI API call observability dashboard.
 *
 * Every external AI call (chat + embedding) is persisted to the
 * `AiApiCall` collection via utils/ai/apiUsageLog.ts. This page
 * surfaces that data:
 *   - Top stat row: total calls, success rate, total cost, latency
 *   - Filterable + paginated table of recent calls
 *   - Side-panel detail view on row click (every field, copy-to-clipboard)
 *   - Bulk cleanup modal with four modes:
 *       age   (delete older than N days)
 *       range (delete within a date range)
 *       day   (delete a single day)
 *       hour  (delete a single hour-bucket of a single day)
 *   - CSV export for any date range
 *
 * Backend endpoints: see apps/backend/src/modules/ai/ai-api-call.controller.ts
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import {
  adminBtnDanger,
  adminBtnGhost,
  adminBtnPrimary,
  adminBtnSecondary,
  adminCardHeader,
  adminCardSurface,
  adminInput,
  adminSearchInput,
  adminSelect,
  adminTableWrap,
  adminTheadRow,
  badgeDanger,
  badgeNeutral,
  badgeSuccess,
  flexCol,
  flexRow,
  flexRowBetween,
  surfaceCardPadded,
  tableTd,
  tableTh,
  tableTr,
  tableTrLast,
  textLabelXsBold,
  textXsFaint,
} from '../../styles/style_config';

// ── types (mirror backend response shapes) ─────────────────────────────────

interface AiApiLog {
  _id: string;
  kind: 'inference' | 'embedding';
  status: 'ok' | 'fail';
  provider: string;
  modelName: string;
  feature?: string;
  batchId?: string | null;
  userId?: string | null;
  userEmail?: string;
  userRole?: string;
  tokensUsed?: number;
  estimatedCostUsd?: number;
  durationMs: number;
  httpStatus?: number;
  error?: string;
  errorKind?: string;
  requestId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  logs: AiApiLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StatsResponse {
  windowHours: number;
  fromDate: string;
  toDate: string;
  bucketMs: number;
  totals: {
    totalCalls: number;
    successCalls: number;
    failCalls: number;
    successRate: number;
    totalCostUsd: number;
    totalTokens: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
  };
  byProvider: Array<{ provider: string; calls: number; successRate: number; costUsd: number; avgDurationMs: number }>;
  byFeature: Array<{ feature: string; calls: number; successRate: number; costUsd: number }>;
  byKind: Array<{ kind: string; calls: number; successRate: number }>;
  topErrors: Array<{ errorKind: string; count: number; lastSeen: string; sampleError: string | null }>;
  topUsers: Array<{ userId: string; userEmail: string | null; calls: number; costUsd: number }>;
  topModels: Array<{ provider: string; modelName: string; calls: number; costUsd: number; avgDurationMs: number }>;
}

// ── helpers ───────────────────────────────────────────────────────────────

const fmtNumber = (n: number) => n.toLocaleString();
const fmtCost = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const fmtDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`);

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function statusBadge(status: 'ok' | 'fail') {
  return (
    <span className={status === 'ok' ? badgeSuccess : badgeDanger}>
      {status === 'ok' ? '✓ ok' : '✕ fail'}
    </span>
  );
}

function kindBadge(kind: 'inference' | 'embedding') {
  return <span className={badgeNeutral}>{kind}</span>;
}

// ── component ─────────────────────────────────────────────────────────────

export default function AdminApiLogsPage() {
  // Filters / pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [statusFilter, setStatusFilter] = useState<'' | 'ok' | 'fail'>('');
  const [kindFilter, setKindFilter] = useState<'' | 'inference' | 'embedding'>('');
  const [providerFilter, setProviderFilter] = useState('');
  const [featureFilter, setFeatureFilter] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data
  const [data, setData] = useState<ListResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail panel
  const [selected, setSelected] = useState<AiApiLog | null>(null);

  // Cleanup modal
  const [cleanupOpen, setCleanupOpen] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // ── fetchers ────────────────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<ListResponse>('/admin/ai/api-logs', {
        params: {
          page,
          limit,
          ...(statusFilter && { status: statusFilter }),
          ...(kindFilter && { kind: kindFilter }),
          ...(providerFilter && { provider: providerFilter }),
          ...(featureFilter && { feature: featureFilter }),
          ...(search && { search }),
          ...(fromDate && { fromDate: new Date(fromDate).toISOString() }),
          ...(toDate && { toDate: new Date(`${toDate}T23:59:59Z`).toISOString() }),
        },
      });
      setData(res.data);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, kindFilter, providerFilter, featureFilter, search, fromDate, toDate]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await adminApi.get<StatsResponse>('/admin/ai/api-logs/stats', {
        params: {
          fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
          toDate: toDate ? new Date(`${toDate}T23:59:59Z`).toISOString() : undefined,
        },
      });
      setStats(res.data);
    } catch {
      // Non-fatal — table can render without stats
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-refresh stats every 15s for the dashboard feel
  useEffect(() => {
    const id = setInterval(() => { fetchStats(); }, 15000);
    return () => clearInterval(id);
  }, [fetchStats]);

  // ── handlers ────────────────────────────────────────────────────────────

  const handleClearFilters = () => {
    setStatusFilter('');
    setKindFilter('');
    setProviderFilter('');
    setFeatureFilter('');
    setSearch('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminApi.get('/admin/ai/api-logs/export', {
        params: {
          fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
          toDate: toDate ? new Date(`${toDate}T23:59:59Z`).toISOString() : undefined,
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-api-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // eslint-disable-next-line no-alert -- admin surface
      alert('Export failed. Try again or check the network log.');
    } finally {
      setExporting(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header row ── */}
      <div className={flexRowBetween}>
        <div>
          <h1 className="text-xl font-bold text-ink">AI API Logs</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            Per-call audit of every chat and embedding request. {stats && (
              <>Showing <span className="font-semibold text-ink">{fmtNumber(stats.totals.totalCalls)}</span> calls in the last <span className="font-semibold text-ink">{stats.windowHours}h</span>.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExportCsv} disabled={exporting}
            className={`${adminBtnSecondary} px-3 py-1.5 text-xs flex items-center gap-1.5`}>
            {exporting ? '⏳ Exporting…' : '⬇ Export CSV'}
          </button>
          <button type="button" onClick={() => setCleanupOpen(true)}
            className={`${adminBtnDanger} px-3 py-1.5 text-xs`}>
            🗑 Cleanup…
          </button>
        </div>
      </div>

      {/* ── Stat cards row ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Calls" value={fmtNumber(stats.totals.totalCalls)} sublabel={stats.windowHours < 1 ? `${Math.round(stats.windowHours * 60)}m` : `${stats.windowHours}h window`} />
          <StatCard label="Success Rate" value={`${(stats.totals.successRate * 100).toFixed(1)}%`} tone={stats.totals.successRate >= 0.95 ? 'success' : stats.totals.successRate >= 0.8 ? 'warning' : 'danger'} sublabel={`${fmtNumber(stats.totals.failCalls)} failures`} />
          <StatCard label="Total Cost" value={fmtCost(stats.totals.totalCostUsd)} sublabel={`${fmtNumber(stats.totals.totalTokens)} tokens`} />
          <StatCard label="Avg Latency" value={fmtDuration(stats.totals.avgDurationMs)} sublabel="per call" />
          <StatCard label="p95 Latency" value={fmtDuration(stats.totals.p95DurationMs)} sublabel="95th percentile" />
          <StatCard label="Failures" value={fmtNumber(stats.totals.failCalls)} tone={stats.totals.failCalls === 0 ? 'success' : 'danger'} sublabel={stats.totals.failCalls > 0 ? 'investigate' : 'all clear'} />
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className={surfaceCardPadded}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <FilterField label="Status">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as '' | 'ok' | 'fail'); setPage(1); }} className={adminSelect}>
              <option value="">All</option>
              <option value="ok">ok</option>
              <option value="fail">fail</option>
            </select>
          </FilterField>
          <FilterField label="Kind">
            <select value={kindFilter} onChange={(e) => { setKindFilter(e.target.value as '' | 'inference' | 'embedding'); setPage(1); }} className={adminSelect}>
              <option value="">All</option>
              <option value="inference">inference</option>
              <option value="embedding">embedding</option>
            </select>
          </FilterField>
          <FilterField label="Provider">
            <input type="text" value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }} placeholder="anthropic, openai, …" className={adminInput} />
          </FilterField>
          <FilterField label="Feature">
            <input type="text" value={featureFilter} onChange={(e) => { setFeatureFilter(e.target.value); setPage(1); }} placeholder="duplicateDetection, …" className={adminInput} />
          </FilterField>
          <FilterField label="From">
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className={adminInput} />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className={adminInput} />
          </FilterField>
          <div className="lg:col-span-2">
            <FilterField label="Search">
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search model, user email, error, request id…" className={adminSearchInput} />
            </FilterField>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={handleClearFilters}
              className={`${adminBtnGhost} w-full px-3 py-2 text-xs`}>
              Clear filters
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className={surfaceCardPadded + ' p-0 overflow-hidden'}>
        <div className={adminCardHeader + ' flex items-center justify-between'}>
          <p className={textLabelXsBold}>Recent calls</p>
          {data && (
            <p className="text-[10px] text-ink-faint">
              {fmtNumber(data.total)} {data.total === 1 ? 'result' : 'results'} · page {data.page} of {data.totalPages}
            </p>
          )}
        </div>
        {error ? (
          <p className="p-6 text-sm text-danger">{error}</p>
        ) : loading && !data ? (
          <p className="p-6 text-sm text-ink-soft">Loading…</p>
        ) : data && data.logs.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">No calls match the current filters.</p>
        ) : (
          <div className={adminTableWrap + ' rounded-none border-0'}>
            <table className="w-full">
              <thead>
                <tr className={adminTheadRow}>
                  <th className={tableTh}>When</th>
                  <th className={tableTh}>Kind</th>
                  <th className={tableTh}>Status</th>
                  <th className={tableTh}>Provider</th>
                  <th className={tableTh}>Model</th>
                  <th className={tableTh}>Feature</th>
                  <th className={tableTh}>User</th>
                  <th className={tableTh + ' text-right'}>Latency</th>
                  <th className={tableTh + ' text-right'}>Tokens</th>
                  <th className={tableTh + ' text-right'}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data?.logs.map((log, idx) => (
                  <tr
                    key={log._id}
                    onClick={() => setSelected(log)}
                    className={`${idx === (data.logs.length - 1) ? tableTrLast : tableTr} cursor-pointer`}
                  >
                    <td className={tableTd}>
                      <div className="flex flex-col">
                        <span className="text-xs">{relativeTime(log.createdAt)}</span>
                        <span className={textXsFaint}>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className={tableTd}>{kindBadge(log.kind)}</td>
                    <td className={tableTd}>{statusBadge(log.status)}</td>
                    <td className={tableTd + ' text-xs font-mono'}>{log.provider}</td>
                    <td className={tableTd + ' text-xs font-mono'}>{log.modelName}</td>
                    <td className={tableTd + ' text-xs'}>{log.feature ?? '—'}</td>
                    <td className={tableTd + ' text-xs'}>
                      {log.userEmail ? (
                        <span title={`role: ${log.userRole ?? 'unknown'}`}>{log.userEmail}</span>
                      ) : (
                        <span className="text-ink-faint">system</span>
                      )}
                    </td>
                    <td className={tableTd + ' text-xs text-right tabular-nums'}>{fmtDuration(log.durationMs)}</td>
                    <td className={tableTd + ' text-xs text-right tabular-nums'}>
                      {log.tokensUsed ? fmtNumber(log.tokensUsed) : '—'}
                    </td>
                    <td className={tableTd + ' text-xs text-right tabular-nums'}>
                      {log.estimatedCostUsd !== undefined ? fmtCost(log.estimatedCostUsd) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-faint">Per page</span>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={adminSelect}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={`${adminBtnGhost} px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed`}>
                ← Prev
              </button>
              <span className="text-xs text-ink-soft">Page {page} of {data.totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className={`${adminBtnGhost} px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed`}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail side panel ── */}
      <AnimatePresence>
        {selected && (
          <DetailPanel log={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      {/* ── Cleanup modal ── */}
      <AnimatePresence>
        {cleanupOpen && (
          <CleanupModal
            onClose={() => setCleanupOpen(false)}
            onDone={() => { setCleanupOpen(false); fetchList(); fetchStats(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, sublabel, tone }: { label: string; value: string; sublabel?: string; tone?: 'success' | 'warning' | 'danger' }) {
  const valueColor = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink';
  return (
    <div className={adminCardSurface + ' p-4'}>
      <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor} tabular-nums`}>{value}</p>
      {sublabel && <p className="text-[10px] text-ink-faint mt-0.5">{sublabel}</p>}
    </div>
  );
}

function DetailPanel({ log, onClose }: { log: AiApiLog; onClose: () => void }) {
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).catch(() => { /* ignore */ });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className={`fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-card border-l border-border shadow-2xl z-[61] overflow-y-auto`}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
      >
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider">AI API Call Detail</p>
            <p className="text-sm font-mono text-ink mt-0.5">{log._id}</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink transition-colors text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(log.status)}
            {kindBadge(log.kind)}
            <span className={badgeNeutral}>{log.provider}</span>
            <span className="text-xs font-mono text-ink-soft">{log.modelName}</span>
            {log.feature && <span className={badgeNeutral}>{log.feature}</span>}
          </div>

          {/* Fields */}
          <Field label="Created at" value={new Date(log.createdAt).toISOString()} copyable />
          <Field label="Duration" value={`${fmtDuration(log.durationMs)} (${log.durationMs}ms)`} />
          {log.tokensUsed !== undefined && <Field label="Tokens used" value={fmtNumber(log.tokensUsed)} />}
          {log.estimatedCostUsd !== undefined && <Field label="Estimated cost" value={fmtCost(log.estimatedCostUsd)} />}
          {log.httpStatus !== undefined && <Field label="HTTP status" value={String(log.httpStatus)} />}
          {log.errorKind && <Field label="Error kind" value={log.errorKind} />}
          {log.batchId && <Field label="Batch ID" value={log.batchId} copyable />}
          {log.userId && <Field label="User ID" value={log.userId} copyable />}
          {log.userEmail && <Field label="User email" value={log.userEmail} />}
          {log.userRole && <Field label="User role" value={log.userRole} />}
          {log.requestId && <Field label="Request ID" value={log.requestId} copyable />}

          {/* Error block */}
          {log.error && (
            <div>
              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Error</p>
              <pre className="bg-bg-secondary border border-border rounded-lg p-3 text-xs text-danger font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{log.error}</pre>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}

function Field({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider min-w-[110px] pt-0.5">{label}</p>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <p className="text-xs text-ink font-mono break-all">{value}</p>
        {copyable && (
          <button type="button" onClick={() => navigator.clipboard.writeText(value).catch(() => undefined)} className="text-[10px] text-accent hover:underline shrink-0">copy</button>
        )}
      </div>
    </div>
  );
}

// ── Cleanup modal ─────────────────────────────────────────────────────────

type CleanupMode = 'age' | 'range' | 'day' | 'hour';

function CleanupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<CleanupMode>('age');
  const [days, setDays] = useState(90);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [date, setDate] = useState('');
  const [hour, setHour] = useState(14);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deletedCount: number; mode: string; fromIso?: string; toIso?: string; cutoffIso?: string } | null>(null);

  const buildBody = (): Record<string, unknown> => {
    if (mode === 'age') return { days };
    if (mode === 'range') return { fromDate: new Date(fromDate).toISOString(), toDate: new Date(`${toDate}T23:59:59Z`).toISOString() };
    if (mode === 'day') return { date };
    return { date, hour };
  };

  const validForMode = (): boolean => {
    if (mode === 'age') return days > 0;
    if (mode === 'range') return Boolean(fromDate && toDate && fromDate <= toDate);
    if (mode === 'day') return Boolean(date);
    return Boolean(date) && hour >= 0 && hour <= 23;
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    setPreviewCount(null);
    try {
      const res = await adminApi.post<{ count: number }>('/admin/ai/api-logs/cleanup/preview', buildBody());
      setPreviewCount(res.data.count);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirm = async () => {
    if (!validForMode()) {
      setError('Fill out the fields for the selected mode first.');
      return;
    }
    if (previewCount !== null && previewCount > 100 && !window.confirm(
      `This will permanently delete ${previewCount} records. Are you sure?`,
    )) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await adminApi.post('/admin/ai/api-logs/cleanup', buildBody());
      setResult(res.data);
      // After a successful delete, refresh the parent.
      setTimeout(onDone, 1500);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Delete failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-preview when fields change
  useEffect(() => {
    if (validForMode()) {
      void handlePreview();
    } else {
      setPreviewCount(null);
    }
  }, [mode, days, fromDate, toDate, date, hour]);

  return (
    <>
      <motion.div className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6"
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'tween', duration: 0.2 }}
      >
        <p className="text-sm font-bold text-ink">Cleanup AI API Logs</p>
        <p className="text-xs text-ink-soft mt-1">Granular delete. The deleted records are unrecoverable.</p>

        {result ? (
          <div className="mt-5 p-4 rounded-lg bg-success-light border border-success/30 text-success text-xs">
            <p className="font-semibold">✓ Deleted {result.deletedCount} records</p>
            {result.fromIso && <p className="mt-1 text-ink-faint">Range: {result.fromIso} → {result.toIso}</p>}
            {result.cutoffIso && <p className="mt-1 text-ink-faint">Older than: {result.cutoffIso}</p>}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Mode radio */}
            <div className="space-y-1.5">
              {([
                { key: 'age', label: 'Older than N days', desc: 'Bulk-delete by age.' },
                { key: 'range', label: 'Date range', desc: 'Delete everything in this range.' },
                { key: 'day', label: 'Specific day', desc: 'Delete one full 24-hour day.' },
                { key: 'hour', label: 'Specific hour of a day', desc: 'Delete a single hour-bucket.' },
              ] as const).map((opt) => (
                <label key={opt.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="cleanup-mode" value={opt.key} checked={mode === opt.key}
                    onChange={() => setMode(opt.key)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <p className="text-xs font-semibold text-ink">{opt.label}</p>
                    <p className="text-[10px] text-ink-faint">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Mode-specific fields */}
            {mode === 'age' && (
              <div>
                <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Days old</label>
                <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} className={adminInput} />
              </div>
            )}
            {mode === 'range' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">From</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={adminInput} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">To</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={adminInput} />
                </div>
              </div>
            )}
            {mode === 'day' && (
              <div>
                <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Day</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={adminInput} />
              </div>
            )}
            {mode === 'hour' && (
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Day</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={adminInput} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-1">Hour (0–23)</label>
                  <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} className={adminInput} />
                </div>
              </div>
            )}

            {/* Live preview */}
            <div className="p-3 rounded-lg bg-bg-secondary border border-border">
              {previewing ? (
                <p className="text-xs text-ink-soft">Counting…</p>
              ) : previewCount !== null ? (
                <p className="text-xs">
                  <span className="text-ink-faint">Will delete: </span>
                  <span className="font-bold text-ink">{previewCount.toLocaleString()}</span>
                  <span className="text-ink-faint"> records</span>
                </p>
              ) : (
                <p className="text-xs text-ink-soft">Fill the fields to see a live count.</p>
              )}
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className={`${adminBtnGhost} px-3 py-1.5 text-xs`}>Cancel</button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || previewCount === null || previewCount === 0 || !validForMode()}
                className={`${adminBtnDanger} px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {submitting ? 'Deleting…' : `Delete ${previewCount ?? 0} records`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="flex items-center justify-end gap-2 mt-5">
            <button type="button" onClick={onClose} className={`${adminBtnGhost} px-3 py-1.5 text-xs`}>Close</button>
          </div>
        )}
      </motion.div>
    </>
  );
}