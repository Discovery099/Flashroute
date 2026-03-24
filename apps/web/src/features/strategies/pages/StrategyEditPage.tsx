import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@flashroute/ui';
import { useNavigate, useParams } from 'react-router-dom';

import { getStrategy, getStrategyFieldErrors, updateStrategy } from '../api';
import { StrategyForm, type StrategyFormValues } from '../components/StrategyForm';
import { useUiStore } from '@/state/ui.store';

export function StrategyEditPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const pushToast = useUiStore((state) => state.pushToast);
  const strategyQuery = useQuery({ queryKey: ['strategy', id], queryFn: () => getStrategy(id), enabled: id.length > 0 });
  const mutation = useMutation({ mutationFn: ({ chainId: _chainId, ...values }: StrategyFormValues) => updateStrategy(id, values as StrategyFormValues) });

  if (strategyQuery.isLoading) {
    return <div className="h-56 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  }

  if (strategyQuery.isError || !strategyQuery.data) {
    return <Card variant="error" title="Strategy unavailable" subtitle="We could not load this strategy for editing."><p className="text-sm text-fx-text-secondary">Return to the strategy list and try again.</p></Card>;
  }

  const handleSubmit = async (values: StrategyFormValues) => {
    try {
      await mutation.mutateAsync(values);
      pushToast({ id: `strategy-update-${Date.now()}`, title: 'Strategy updated', description: 'The strategy has been saved.', tone: 'success' });
      await navigate(`/strategies/${id}`);
    } catch {
      return;
    }
  };

  return <StrategyForm mode="edit" onSubmit={handleSubmit} onCancel={() => void navigate(`/strategies/${id}`)} onDuplicate={() => void navigate('/strategies/new')} canDuplicate defaultValues={strategyQuery.data.strategy} serverErrors={getStrategyFieldErrors(mutation.error)} submitting={mutation.isPending} />;
}
