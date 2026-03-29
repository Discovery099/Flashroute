import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeConfigSubscriber } from './runtime-config-subscriber';

describe('RuntimeConfigSubscriber', () => {
  let mockSubscriber: any;
  let subscriber: RuntimeConfigSubscriber;
  let onPauseChange: any;

  beforeEach(() => {
    onPauseChange = vi.fn();
    mockSubscriber = {
      subscribe: vi.fn(),
      psubscribe: vi.fn(),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    subscriber = new RuntimeConfigSubscriber(mockSubscriber as any, onPauseChange);
  });

  it('subscribes to fr:config:changed', async () => {
    await subscriber.start();
    expect(mockSubscriber.subscribe).toHaveBeenCalledWith('fr:config:changed');
  });

  it('calls onPauseChange(true when execution_paused=true', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]: [string]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'execution_paused', value: true }));
    expect(onPauseChange).toHaveBeenCalledWith(true);
  });

  it('calls onPauseChange(true when maintenance_mode=true', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]: [string]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'maintenance_mode', value: true }));
    expect(onPauseChange).toHaveBeenCalledWith(true);
  });

  it('calls onPauseChange(false when execution_paused=false', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]: [string]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'execution_paused', value: false }));
    expect(onPauseChange).toHaveBeenCalledWith(false);
  });

  it('calls onPauseChange(false when maintenance_mode=false', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]: [string]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'maintenance_mode', value: false }));
    expect(onPauseChange).toHaveBeenCalledWith(false);
  });

  it('ignores other config keys', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]: [string]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'some_other_key', value: true }));
    expect(onPauseChange).not.toHaveBeenCalled();
  });

  it('closes cleanly', async () => {
    await subscriber.close();
    expect(mockSubscriber.quit).toHaveBeenCalled();
  });
});
