import { Injectable } from '@nestjs/common';
import type { LuieEventConsumer } from './luie-event.types';

@Injectable()
export class LuieConsumerRegistry {
  private readonly consumers = new Map<string, LuieEventConsumer>();

  register(consumer: LuieEventConsumer): void {
    if (!consumer || typeof consumer.name !== 'string' || !/^[a-z][a-z0-9_.-]{1,99}$/.test(consumer.name.trim())) {
      throw new Error('A LUIE consumer must provide a valid lower-case consumer name.');
    }
    if (typeof consumer.supports !== 'function' || typeof consumer.handle !== 'function') {
      throw new Error(`LUIE consumer ${consumer.name} must implement supports() and handle().`);
    }
    const name = consumer.name.trim();
    if (this.consumers.has(name)) {
      throw new Error(`LUIE consumer "${name}" is already registered.`);
    }
    this.consumers.set(name, consumer);
  }

  get(name: string): LuieEventConsumer | undefined {
    return this.consumers.get(name);
  }

  names(): string[] {
    return [...this.consumers.keys()].sort();
  }
}
