import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
  RAW_API_RESPONSE_METADATA,
  TransformInterceptor,
} from './transform.interceptor';

describe('TransformInterceptor binary response handling', () => {
  const makeContext = (handler: Function) => ({
    getHandler: () => handler,
  } as unknown as ExecutionContext);

  it('keeps the standard JSON envelope for ordinary API responses', async () => {
    const payload = { id: 'record-1' };
    const handler = () => undefined;
    const next = { handle: () => of(payload) } as CallHandler;

    const result = await lastValueFrom(
      new TransformInterceptor().intercept(makeContext(handler), next),
    );

    expect(result).toEqual({
      success: true,
      data: payload,
      timestamp: expect.any(String),
    });
  });

  it('passes a PDF/XLSX-style Buffer through without JSON wrapping', async () => {
    const payload = Buffer.from('%PDF-1.7 binary-test');
    const handler = () => undefined;
    const next = { handle: () => of(payload) } as CallHandler;

    const result = await lastValueFrom(
      new TransformInterceptor().intercept(makeContext(handler), next),
    );

    expect(result).toBe(payload);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect((result as Buffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('passes explicitly marked text downloads through unchanged', async () => {
    const payload = 'metric,value\nrevenue,100';
    const handler = () => undefined;
    Reflect.defineMetadata(RAW_API_RESPONSE_METADATA, true, handler);
    const next = { handle: () => of(payload) } as CallHandler;

    const result = await lastValueFrom(
      new TransformInterceptor().intercept(makeContext(handler), next),
    );

    expect(result).toBe(payload);
  });
});