import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import adminApi from '../utils/adminApi';
import AdminLayout from '../components/layout/AdminLayout';

interface ZoomMeeting {
  _id: string;
  zoomMeetingId: string;
  topic: string;
  startTime: string;
  duration: number;
  hostEmail: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  insightCount: number;
  createdAt: string;
}

interface MeetingsResponse {
  meetings: ZoomMeeting[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: ZoomMeeting['status'] }) {
  const styles: Record<ZoomMeeting['status'], string> = {
    pending: 'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
  };
  const labels: Record<ZoomMeeting['status'], string> = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function MeetingRowSkeleton() {
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-4 py-3"><div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-12 bg-gray-200 rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-200 rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-8 bg-gray-200 rounded animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-200 rounded animate-pulse" /></td>
    </tr>
  );
}

export default function AdminZoomMeetings() {
  const [meetings, setMeetings] = useState<ZoomMeeting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Stats
  const [stats, setStats] = useState({ total: 0, processing: 0, completed: 0, failed: 0 });

  const fetchMeetings = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    adminApi.get<MeetingsResponse>(`/zoom/meetings?${params}`)
      .then(res => {
        setMeetings(res.data.meetings);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .finally(() => setLoading(false));
  };

  const fetchStats = () => {
    Promise.all([
      adminApi.get<{ total: number }>('/zoom/meetings?limit=1'),
      adminApi.get<{ meetings: ZoomMeeting[] }>('/zoom/meetings?limit=1000&status=processing'),
      adminApi.get<{ meetings: ZoomMeeting[] }>('/zoom/meetings?limit=1000&status=completed'),
      adminApi.get<{ meetings: ZoomMeeting[] }>('/zoom/meetings?limit=1000&status=failed'),
    ]).then(([all, proc, comp, fail]) => {
      setStats({
        total: all.data.total,
        processing: proc.data.meetings.length,
        completed: comp.data.meetings.length,
        failed: fail.data.meetings.length,
      });
    }).catch(() => {});
  };

  useEffect(() => { fetchMeetings(); }, [page, statusFilter]);
  useEffect(() => { fetchStats(); }, []);

  const FILTER_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-5 max-w-5xl">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Zoom Meetings</h2>
          <p className="text-sm text-gray-500 mt-0.5">AI-extracted FAQs and announcements from Zoom recordings</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 font-medium">Total Meetings</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 font-medium">Processing</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.processing}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 font-medium">Completed</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.completed}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 font-medium">Failed</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.failed}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex border-b border-gray-100">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors ${
                  statusFilter === tab.key
                    ? 'text-gray-900 border-b-2 border-gray-900 bg-gray-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Topic</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Insights</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <MeetingRowSkeleton key={i} />)
              ) : meetings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    <svg className="mx-auto mb-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    No meetings found
                  </td>
                </tr>
              ) : (
                meetings.map(meeting => (
                  <tr key={meeting._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 max-w-xs truncate">{meeting.topic}</div>
                      <div className="text-[10px] text-gray-400">{meeting.hostEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{timeAgo(meeting.startTime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDuration(meeting.duration)}</td>
                    <td className="px-4 py-3"><StatusBadge status={meeting.status} /></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{meeting.insightCount}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/zoom-insights?meetingId=${meeting._id}`}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium text-white bg-gray-900 hover:bg-gray-700 transition-colors"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        View Insights
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Page {page} of {pages} · {total} meetings</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= pages}
                  className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
