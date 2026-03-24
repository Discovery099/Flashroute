import { clsx } from 'clsx';

export type LiveIndicatorProps = {
  status: 'connected' | 'reconnecting' | 'disconnected' | 'polling';
};

const stateStyles = {
  connected: {
    dot: 'bg-emerald-400 animate-pulse-soft',
    label: 'Live',
    shell: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
  },
  reconnecting: {
    dot: 'bg-amber-400 animate-pulse-soft',
    label: 'Reconnecting',
    shell: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
  },
  disconnected: {
    dot: 'bg-red-400',
    label: 'Offline',
    shell: 'border-red-500/25 bg-red-500/10 text-red-100',
  },
  polling: {
    dot: 'bg-slate-400',
    label: 'Polling only',
    shell: 'border-fx-border bg-fx-surface text-fx-text-secondary',
  },
} as const;

export function LiveIndicator({ status }: LiveIndicatorProps) {
  const tone = stateStyles[status];

  return (
    <span className={clsx('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', tone.shell)}>
      <span className={clsx('h-2.5 w-2.5 rounded-full', tone.dot)} />
      {tone.label}
    </span>
  );
}
