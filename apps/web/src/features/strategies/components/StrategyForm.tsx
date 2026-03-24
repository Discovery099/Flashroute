import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card } from '@flashroute/ui';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useBeforeUnload, useInRouterContext, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { STRATEGY_CHAIN_OPTIONS, STRATEGY_DEX_OPTIONS, flashLoanProviderOptions, supportedDexesByChain } from '../config';
import { useUiStore } from '@/state/ui.store';

const strategyFormSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(100, 'Name must be 100 characters or fewer'),
  description: z.string().trim().max(280, 'Description must be 280 characters or fewer').default(''),
  chainId: z.coerce.number().int().positive('Chain is required'),
  minProfitUsd: z.coerce.number().gt(0, 'Min profit must be greater than 0').default(10),
  maxTradeSizeUsd: z.coerce.number().min(100, 'Max trade size must be at least 100').default(100000),
  maxHops: z.coerce.number().int().min(2, 'Max hops must be at least 2').max(6, 'Max hops must be 6 or fewer'),
  cooldownSeconds: z.coerce.number().int().min(0, 'Cooldown must be 0 or greater').default(0),
  riskBufferPct: z.coerce.number().min(0.01, 'Risk buffer must be at least 0.01').max(5, 'Risk buffer must be 5.0 or lower'),
  maxGasPriceGwei: z.coerce.number().gt(0, 'Max gas price must be greater than 0').default(100),
  maxSlippageBps: z.coerce.number().int().min(1, 'Max slippage must be at least 1').max(500, 'Max slippage must be 500 or fewer'),
  allowedDexes: z.array(z.string()).min(1, 'Select at least one DEX'),
  flashLoanProvider: z.string().default('auto'),
  useFlashbots: z.boolean().default(true),
  useDemandPrediction: z.boolean().default(true),
});

export type StrategyFormValues = z.infer<typeof strategyFormSchema>;

function NavigationPrompt({ when }: { when: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    if (!when) {
      previousPathRef.current = location.pathname;
      return;
    }

    if (location.pathname === previousPathRef.current) {
      return;
    }

    const previousPath = previousPathRef.current;
    if (!window.confirm('You have unsaved changes. Leave this page?')) {
      navigate(previousPath, { replace: true });
      return;
    }

    previousPathRef.current = location.pathname;
  }, [location.pathname, navigate, when]);

  return null;
}

type StrategyFormProps = {
  mode: 'create' | 'edit';
  defaultValues?: Partial<StrategyFormValues>;
  onSubmit: (values: StrategyFormValues) => Promise<void> | void;
  onCancel?: () => void;
  onDuplicate?: () => void;
  canDuplicate?: boolean;
  serverErrors?: Record<string, string>;
  submitting?: boolean;
};

const defaultFormValues: StrategyFormValues = {
  name: '',
  description: '',
  chainId: 42161,
  minProfitUsd: 10,
  maxTradeSizeUsd: 100000,
  maxHops: 4,
  cooldownSeconds: 0,
  riskBufferPct: 0.5,
  maxGasPriceGwei: 100,
  maxSlippageBps: 50,
  allowedDexes: ['uniswap_v3'],
  flashLoanProvider: 'auto',
  useFlashbots: true,
  useDemandPrediction: true,
};

export function StrategyForm({ mode, defaultValues, onSubmit, onCancel, onDuplicate, canDuplicate = false, serverErrors, submitting = false }: StrategyFormProps) {
  const inRouterContext = useInRouterContext();
  const pushToast = useUiStore((state) => state.pushToast);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm<StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: { ...defaultFormValues, ...defaultValues },
  });

  const chainId = watch('chainId');
  const allowedDexes = watch('allowedDexes');
  const supportedDexes = supportedDexesByChain[chainId] ?? [];

  useBeforeUnload(
    (event) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    },
    { capture: true },
  );

  useEffect(() => {
    if (!serverErrors) {
      return;
    }

    for (const [field, message] of Object.entries(serverErrors)) {
      setError(field as keyof StrategyFormValues, { type: 'server', message });
    }
  }, [serverErrors, setError]);

  const handleChainChange = (nextChainId: number) => {
    setValue('chainId', nextChainId, { shouldDirty: true, shouldValidate: true });
    const nextSupportedDexes = new Set(supportedDexesByChain[nextChainId] ?? []);
    const nextAllowedDexes = allowedDexes.filter((dex) => nextSupportedDexes.has(dex));
    if (nextAllowedDexes.length !== allowedDexes.length) {
      setValue('allowedDexes', nextAllowedDexes, { shouldDirty: true, shouldValidate: true });
      pushToast({
        id: `dex-reset-${Date.now()}`,
        tone: 'warning',
        title: 'DEX selection updated',
        description: 'Unsupported DEXes were removed for the selected chain.',
      });
    }
  };

  const handleDexToggle = (dex: string, checked: boolean) => {
    const nextAllowedDexes = checked ? [...new Set([...allowedDexes, dex])] : allowedDexes.filter((entry) => entry !== dex);
    setValue('allowedDexes', nextAllowedDexes, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit(async (values) => onSubmit(values))}>
      {inRouterContext ? <NavigationPrompt when={isDirty} /> : null}
      <Card title={mode === 'create' ? 'New strategy' : 'Edit strategy'} subtitle="Define execution thresholds, chain coverage, and venue selection.">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm text-fx-text-secondary lg:col-span-2">
            <span>Name</span>
            <input aria-label="Name" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('name')} />
            {errors.name ? <span className="text-xs text-red-300">{errors.name.message}</span> : null}
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary lg:col-span-2">
            <span>Description</span>
            <textarea aria-label="Description" rows={3} className="w-full rounded-2xl border border-fx-border bg-fx-surface px-3 py-3 text-fx-text-primary outline-none" {...register('description')} />
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Chain</span>
            <select aria-label="Chain" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" value={String(chainId)} onChange={(event) => handleChainChange(Number(event.target.value))}>
              {STRATEGY_CHAIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {errors.chainId ? <span className="text-xs text-red-300">{errors.chainId.message}</span> : null}
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Min Profit USD</span>
            <input aria-label="Min Profit USD" type="number" step="0.01" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('minProfitUsd', { valueAsNumber: true })} />
            {errors.minProfitUsd ? <span className="text-xs text-red-300">{errors.minProfitUsd.message}</span> : null}
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Max Hops</span>
            <input aria-label="Max Hops" type="number" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('maxHops', { valueAsNumber: true })} />
            {errors.maxHops ? <span className="text-xs text-red-300">{errors.maxHops.message}</span> : null}
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Risk Buffer %</span>
            <input aria-label="Risk Buffer %" type="number" step="0.01" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('riskBufferPct', { valueAsNumber: true })} />
            {errors.riskBufferPct ? <span className="text-xs text-red-300">{errors.riskBufferPct.message}</span> : null}
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Max Slippage Bps</span>
            <input aria-label="Max Slippage Bps" type="number" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('maxSlippageBps', { valueAsNumber: true })} />
            {errors.maxSlippageBps ? <span className="text-xs text-red-300">{errors.maxSlippageBps.message}</span> : null}
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Cooldown Seconds</span>
            <input aria-label="Cooldown Seconds" type="number" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('cooldownSeconds', { valueAsNumber: true })} />
          </label>
        </div>
      </Card>

      <Card title="DEX selection" subtitle="Only supported venues remain available when you change chains.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STRATEGY_DEX_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-3 rounded-2xl border border-fx-border bg-fx-surface/80 px-4 py-3 text-sm text-fx-text-secondary">
              <input
                type="checkbox"
                aria-label={option.label}
                checked={allowedDexes.includes(option.value)}
                disabled={!supportedDexes.includes(option.value)}
                onChange={(event) => handleDexToggle(option.value, event.target.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {errors.allowedDexes ? <p className="mt-3 text-xs text-red-300">{errors.allowedDexes.message}</p> : null}
      </Card>

      <Card title="Execution options" subtitle="Default execution settings can be tuned per strategy.">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Max Trade Size USD</span>
            <input aria-label="Max Trade Size USD" type="number" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('maxTradeSizeUsd', { valueAsNumber: true })} />
          </label>
          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Max Gas Price Gwei</span>
            <input aria-label="Max Gas Price Gwei" type="number" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('maxGasPriceGwei', { valueAsNumber: true })} />
          </label>
          <label className="space-y-2 text-sm text-fx-text-secondary lg:col-span-2">
            <span>Flash Loan Provider</span>
            <select aria-label="Flash Loan Provider" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" {...register('flashLoanProvider')}>
              {flashLoanProviderOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-fx-border bg-fx-surface/80 px-4 py-3 text-sm text-fx-text-secondary">
            <input aria-label="Use Flashbots" type="checkbox" {...register('useFlashbots')} />
            <span>Use Flashbots</span>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-fx-border bg-fx-surface/80 px-4 py-3 text-sm text-fx-text-secondary">
            <input aria-label="Use Demand Prediction" type="checkbox" {...register('useDemandPrediction')} />
            <span>Use Demand Prediction</span>
          </label>
        </div>
      </Card>

      <Card title="Advanced risk controls" subtitle="Operator notes and cooldown controls stay attached to this strategy.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-fx-border bg-fx-surface/70 px-4 py-3 text-sm text-fx-text-secondary">
            Token list controls remain foundation-level for this phase and can be expanded without changing the strategy route contract.
          </div>
          <div className="rounded-2xl border border-fx-border bg-fx-surface/70 px-4 py-3 text-sm text-fx-text-secondary">
            Current risk controls persist description, cooldown, slippage, execution transport, and DEX selection in a stable shape.
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-3xl border border-fx-border bg-fx-bg/95 px-4 py-4 backdrop-blur">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        {canDuplicate ? <Button type="button" variant="secondary" onClick={onDuplicate}>Duplicate Strategy</Button> : null}
        <Button type="submit" loading={submitting}>{mode === 'create' ? 'Create Strategy' : 'Save Changes'}</Button>
      </div>
    </form>
  );
}
