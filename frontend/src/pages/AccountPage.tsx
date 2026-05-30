import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

interface ZoomStatus {
  connected: boolean;
  connectedAt?: string;
  zoomUserId?: string;
}

export default function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [zoomStatus, setZoomStatus] = useState<ZoomStatus | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomError, setZoomError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Read zoom status from URL params (set by OAuth callback redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_connected') === '1') {
      setZoomStatus({ connected: true });
      // Clean URL
      window.history.replaceState({}, '', '/account');
    } else if (params.get('zoom_error')) {
      setZoomError(decodeURIComponent(params.get('zoom_error')!));
      window.history.replaceState({}, '', '/account');
    }
  }, []);

  // Fetch Zoom connection status
  const fetchZoomStatus = async () => {
    try {
      const res = await api.get<ZoomStatus>('/zoom/auth/status');
      setZoomStatus(res.data);
    } catch {
      // Not connected
      setZoomStatus({ connected: false });
    }
  };

  useEffect(() => {
    fetchZoomStatus();
  }, []);

  const handleConnectZoom = async () => {
    setZoomLoading(true);
    setZoomError(null);
    try {
      const res = await api.get<{ authUrl: string }>('/zoom/auth/connect');
      if (res.data.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch {
      setZoomError('Could not connect to Zoom. Please try again.');
    } finally {
      setZoomLoading(false);
    }
  };

  const handleDisconnectZoom = async () => {
    if (!confirm('Disconnect your Zoom account? Your processed meetings will remain but won\'t update.')) return;
    setDisconnecting(true);
    try {
      await api.delete('/zoom/auth/disconnect');
      setZoomStatus({ connected: false });
    } catch {
      setZoomError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const zoomConnectedAt = zoomStatus?.connectedAt
    ? new Date(zoomStatus.connectedAt).toLocaleDateString()
    : null;

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-ink">Account</h1>
          <p className="text-sm text-ink-faint mt-0.5">Manage your profile and integrations</p>
        </div>

        {/* Profile card */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-lg">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="font-medium text-ink">{user?.name ?? 'Unknown'}</p>
              <p className="text-sm text-ink-faint">{user?.email ?? ''}</p>
              <p className="text-xs text-ink-faint mt-0.5 capitalize">{user?.role ?? 'user'}</p>
            </div>
          </div>
        </div>

        {/* Zoom integration card */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Zoom icon */}
              <div className="w-10 h-10 rounded-xl bg-[#2D8CFF]/10 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="#2D8CFF"/>
                  <rect x="2" y="6" width="11" height="12" rx="2" stroke="#2D8CFF" strokeWidth="1.5" fill="none"/>
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink">Zoom Integration</h2>
                <p className="text-xs text-ink-faint mt-0.5">
                  {zoomStatus?.connected
                    ? `Connected · since ${zoomConnectedAt}`
                    : 'Connect to auto-import meeting transcripts'}
                </p>
              </div>
            </div>

            {/* Connection badge */}
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              zoomStatus?.connected
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-gray-100 text-gray-500 border border-gray-200'
            }`}>
              {zoomStatus?.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {/* Error message */}
          {zoomError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {zoomError}
            </div>
          )}

          {/* Action button */}
          {zoomStatus?.connected ? (
            <button
              onClick={handleDisconnectZoom}
              disabled={disconnecting}
              className="w-full px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect Zoom'}
            </button>
          ) : (
            <button
              onClick={handleConnectZoom}
              disabled={zoomLoading}
              className="w-full px-4 py-2.5 rounded-xl bg-[#2D8CFF] text-white text-sm font-semibold hover:bg-[#1a78ef] active:bg-[#1560d4] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {zoomLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Redirecting to Zoom...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M15.5 8.5l5-3v9l-5-3v-3z" fill="white"/>
                    <rect x="2" y="6" width="11" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
                  </svg>
                  Connect Zoom Account
                </>
              )}
            </button>
          )}

          <p className="text-xs text-ink-faint text-center">
            {zoomStatus?.connected
              ? 'Your Zoom account is linked. New recordings will auto-process.'
              : 'You\'ll be redirected to Zoom to authorize access to your recordings.'}
          </p>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2.5 rounded-xl border border-border text-ink text-sm font-medium hover:bg-cream transition-all"
        >
          Sign Out
        </button>

      </div>
    </div>
  );
}
