import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { createStrategy, getStrategyFieldErrors } from '../api';
import { StrategyForm, type StrategyFormValues } from '../components/StrategyForm';
import { useUiStore } from '@/state/ui.store';

export function StrategyCreatePage() {
  const navigate = useNavigate();
  const pushToast = useUiStore((state) => state.pushToast);
  const mutation = useMutation({ mutationFn: createStrategy });

  const handleSubmit = async (values: StrategyFormValues) => {
    try {
      const result = await mutation.mutateAsync(values);
      pushToast({ id: `strategy-create-${Date.now()}`, title: 'Strategy created', description: 'The strategy has been saved.', tone: 'success' });
      await navigate(`/strategies/${result.strategy.id}`);
    } catch {
      return;
    }
  };

  return <StrategyForm mode="create" onSubmit={handleSubmit} onCancel={() => void navigate('/strategies')} serverErrors={getStrategyFieldErrors(mutation.error)} submitting={mutation.isPending} />;
}
