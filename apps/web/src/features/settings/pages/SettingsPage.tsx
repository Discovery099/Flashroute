import { useSearchParams } from 'react-router-dom';

import NotificationsTab from '@/features/alerts/pages/NotificationsTab';

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'security', label: 'Security' },
  { value: 'notifications', label: 'Notifications' },
] as const;

type Tab = typeof TABS[number]['value'];

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab');
  const validTabs = TABS.map((t) => t.value);
  const tab = validTabs.includes(rawTab as Tab) ? (rawTab as Tab) : 'profile';

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Workspace</p>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">
            Manage your account settings and preferences.
          </p>
        </div>
      </header>

      <div className="flex gap-1 border-b border-fx-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-b-2 border-cyan-400 text-cyan-400'
                : 'text-fx-text-muted hover:text-fx-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {tab === 'profile' && (
          <div className="flex h-[400px] items-center justify-center">
            <p className="text-fx-text-muted">Coming soon</p>
          </div>
        )}
        {tab === 'security' && (
          <div className="flex h-[400px] items-center justify-center">
            <p className="text-fx-text-muted">Coming soon</p>
          </div>
        )}
        {tab === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  );
}
