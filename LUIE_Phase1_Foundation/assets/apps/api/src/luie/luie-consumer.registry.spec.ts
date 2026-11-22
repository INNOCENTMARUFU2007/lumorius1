import { LuieConsumerRegistry } from './luie-consumer.registry';
import type { LuieEventConsumer } from './luie-event.types';

describe('LuieConsumerRegistry', () => {
  it('registers consumers and returns stable sorted names', () => {
    const registry = new LuieConsumerRegistry();
    const consumer = (name: string): LuieEventConsumer => ({
      name,
      supports: () => true,
      handle: jest.fn().mockResolvedValue(undefined),
    });

    registry.register(consumer('luie.zeta'));
    registry.register(consumer('luie.alpha'));

    expect(registry.names()).toEqual(['luie.alpha', 'luie.zeta']);
    expect(registry.get('luie.alpha')).toBeDefined();
  });

  it('rejects duplicate consumer names', () => {
    const registry = new LuieConsumerRegistry();
    const consumer: LuieEventConsumer = { name: 'luie.search', supports: () => true, handle: async () => undefined };
    registry.register(consumer);
    expect(() => registry.register(consumer)).toThrow('already registered');
  });

  it('rejects incomplete consumers', () => {
    const registry = new LuieConsumerRegistry();
    expect(() => registry.register({ name: 'luie.invalid' } as never)).toThrow('must implement supports() and handle()');
  });
});
