import { Button, Card } from '@flashroute/ui';
import { Activity, AlertTriangle, Database, Pause, Play, RefreshCw, Server, Wifi } from 'lucide-react';
import { useState } from 'react';

import {
  usePauseExecution,
  useResumeExecution,
  useSystemConfig,
  useSystemHealth,
  useUpdateSystemConfig,
  type SystemHealth,
} from '../api';

function Badge({ variant, children }: { variant: 'positive' | 'warning' | 'error' | 'secondary'; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    positive: 'rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300',
    warning: 'rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300',
    error: 'rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300',
    secondary: 'rounded-full bg-fx-surface-strong px-2 py-0.5 text-xs font-medium text-fx-text-secondary',
  };
  return <span className={classes[variant]}>{children}</span>;
}

const HEALTH_STATUS_TONE: Record<string, 'positive' | 'warning' | 'error' | 'secondary'> = {
  healthy: 'positive',
  degraded: 'warning',
  unhealthy: 'error',
  unknown: 'secondary',
};

function HealthCard({
  title,
  icon: Icon,
  health,
}: {
  title: string;
  icon: React.ElementType;
  health: { status: string; latencyMs?: number };
}) {
  const statusTone = HEALTH_STATUS_TONE[health.status] ?? 'secondary';
  return (
    <Card className="flex items-start gap-4">
      <div className="rounded-lg bg-fx-surface-strong p-3">
        <Icon className="h-5 w-5 text-fx-text-secondary" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          <Badge variant={statusTone}>{health.status}</Badge>
        </div>
        {health.latencyMs !== undefined && (
          <p className="mt-1 text-sm text-fx-text-secondary">{health.latencyMs}ms latency</p>
        )}
      </div>
    </Card>
  );
}

function SystemHealthGrid({ health }: { health: SystemHealth }) {
  const chainNames: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    42161: 'Arbitrum',
    137: 'Polygon',
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <HealthCard title="Database" icon={Database} health={health.database} />
      <HealthCard title="Redis Cache" icon={Wifi} health={health.redis} />
      {Object.entries(health.chains).map(([chainId, chainHealth]) => (
        <HealthCard
          key={chainId}
          title={`${chainNames[Number(chainId)] ?? `Chain ${chainId}`} RPC`}
          icon={Server}
          health={chainHealth}
        />
      ))}
      {Object.entries(health.workers).map(([workerName, workerHealth]) => (
        <HealthCard
          key={workerName}
          title={`${workerName.charAt(0).toUpperCase() + workerName.slice(1)} Worker`}
          icon={Activity}
          health={workerHealth}
        />
      ))}
    </div>
  );
}

function ConfigEditorRow({
  config,
  onSave,
  isSaving,
}: {
  config: { key: string; value: unknown; description: string; updatedAt: string; updatedBy: string | null };
  onSave: (value: unknown) => void;
  isSaving: boolean;
}) {
  const [editValue, setEditValue] = useState(String(config.value ?? ''));
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBoolean = typeof config.value === 'boolean';
  const isNumeric = typeof config.value === 'number';

  const handleSave = () => {
    if (!reason.trim()) {
      setShowReason(true);
      return;
    }
    let parsedValue: unknown = editValue;
    if (isBoolean) {
      parsedValue = editValue === 'true';
    } else if (isNumeric) {
      parsedValue = Number(editValue);
      if (isNaN(parsedValue as number)) {
        setError('Invalid number');
        return;
      }
    }
    setError(null);
    onSave(parsedValue);
  };

  return (
    <div className="flex items-center gap-4 border-b border-fx-border py-3">
      <div className="flex-1">
        <p className="font-medium">{config.key}</p>
        <p className="text-sm text-fx-text-secondary">{config.description}</p>
      </div>
      <div className="w-32">
        {isBoolean ? (
          <select
            className="w-full rounded-lg border border-fx-border bg-fx-surface px-3 py-2 text-sm"
            value={editValue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditValue(e.target.value)}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            value={editValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
            className="w-full rounded-lg border border-fx-border bg-fx-surface px-3 py-2 text-sm"
          />
        )}
      </div>
      {showReason && (
        <input
          placeholder="Reason for change"
          value={reason}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
          className="w-48 rounded-lg border border-fx-border bg-fx-surface px-3 py-2 text-sm"
        />
      )}
      <Button size="sm" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="w-32 text-right text-xs text-fx-text-muted">
        {new Date(config.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function ConfigEditor({ configs }: { configs: Array<{ key: string; value: unknown; description: string; updatedAt: string; updatedBy: string | null }> }) {
  const updateConfig = useUpdateSystemConfig();

  const handleSave = (key: string, value: unknown) => {
    updateConfig.mutate(
      { key, value, reason: 'Manual update via admin' },
      {
        onSuccess: (data) => {
          if (!data.success) {
            console.error('Config update failed:', data.error);
          }
        },
      },
    );
  };

  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Runtime Configuration</h3>
        <p className="text-sm text-fx-text-secondary">
          Changes take effect immediately. All modifications are logged.
        </p>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-4 border-b border-fx-border py-2 text-xs font-semibold uppercase tracking-wider text-fx-text-muted">
          <div className="flex-1">Key</div>
          <div className="w-32">Value</div>
          <div className="w-48">Reason</div>
          <div className="w-20">Action</div>
          <div className="w-32 text-right">Last Updated</div>
        </div>
        {configs.map((config) => (
          <ConfigEditorRow
            key={config.key}
            config={config}
            onSave={(value) => handleSave(config.key, value)}
            isSaving={updateConfig.isPending}
          />
        ))}
      </div>
    </Card>
  );
}

function MaintenanceBanner() {
  const resume = useResumeExecution();

  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <div>
          <p className="font-medium text-amber-200">Execution Paused</p>
          <p className="text-sm text-amber-300/80">
            New arbitrage executions are blocked until execution is resumed.
          </p>
        </div>
      </div>
      <Button
        variant="primary"
        onClick={() => resume.mutate()}
        disabled={resume.isPending}
      >
        <Play className="mr-2 h-4 w-4" />
        {resume.isPending ? 'Resuming...' : 'Resume Execution'}
      </Button>
    </div>
  );
}

function QuickActions() {
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const pause = usePauseExecution();
  const resume = useResumeExecution();

  const handlePause = () => {
    pause.mutate(pauseReason || 'Manual pause via admin', {
      onSuccess: () => {
        setShowPauseConfirm(false);
        setPauseReason('');
      },
    });
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold">Quick Actions</h3>
      <p className="mb-4 text-sm text-fx-text-secondary">
        Operational controls for platform management.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" onClick={() => setShowPauseConfirm(true)}>
          <Pause className="mr-2 h-4 w-4" />
          Pause All Execution
        </Button>
        <Button variant="secondary" onClick={() => resume.mutate()} disabled={resume.isPending}>
          <Play className="mr-2 h-4 w-4" />
          Resume Execution
        </Button>
        <Button variant="secondary" disabled>
          <RefreshCw className="mr-2 h-4 w-4" />
          Force Pool Resync
        </Button>
        <Button variant="secondary" disabled>
          <Activity className="mr-2 h-4 w-4" />
          Force Profit Sweep
        </Button>
      </div>

      {showPauseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-6">
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-sm text-red-200">
                <strong>Danger:</strong> This will prevent any new arbitrage executions from being
                submitted until resumed.
              </p>
            </div>
            <h3 className="text-lg font-semibold">Pause All Execution?</h3>
            <div className="mt-4">
              <label className="text-sm font-medium">Reason (required for audit)</label>
              <input
                className="mt-1 w-full rounded-2xl border border-fx-border bg-fx-bg px-4 py-3 text-sm"
                value={pauseReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPauseReason(e.target.value)}
                placeholder="Enter reason for pausing execution"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowPauseConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handlePause} disabled={pause.isPending}>
                {pause.isPending ? 'Pausing...' : 'Pause Execution'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}

export function AdminSystemPage() {
  const { data: health, isLoading: healthLoading, error: healthError } = useSystemHealth();
  const { data: configs, isLoading: configsLoading } = useSystemConfig();

  const isPaused = configs?.find((c) => c.key === 'execution_paused')?.value === true;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fx-text-muted">Admin</p>
          <h1 className="text-2xl font-semibold text-fx-text-primary">System Health</h1>
          <p className="max-w-2xl text-sm text-fx-text-secondary">
            Operational telemetry, queue health, and platform controls.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-fx-text-muted">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Auto-refreshes every 30s
        </div>
      </header>

      {isPaused && <MaintenanceBanner />}

      <Card>
        <h3 className="text-lg font-semibold">Health Status</h3>
        <p className="mb-4 text-sm text-fx-text-secondary">Platform health across all components.</p>
        {healthLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-fx-surface-strong" />
            ))}
          </div>
        ) : healthError ? (
          <div className="py-8 text-center">
            <p className="text-fx-text-secondary">Failed to load system health.</p>
          </div>
        ) : health ? (
          <SystemHealthGrid health={health} />
        ) : null}
      </Card>

      <QuickActions />

      {configs && <ConfigEditor configs={configs} />}
    </div>
  );
}