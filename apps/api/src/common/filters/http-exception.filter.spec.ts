import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { DATABASE_UNAVAILABLE_MESSAGE, HttpExceptionFilter, isDatabaseUnavailable } from './http-exception.filter';

function makeHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  const request = { url: '/api/v1/auth/login', method: 'POST' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('turns a pg-pool connection timeout into a retryable 503', () => {
    const { host, response } = makeHost();
    filter.catch(new Error('Connection terminated due to connection timeout'), host);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, message: DATABASE_UNAVAILABLE_MESSAGE }));
  });

  it('treats Postgres "cannot connect now" SQLSTATEs as unavailable', () => {
    expect(isDatabaseUnavailable(Object.assign(new Error('the database system is starting up'), { code: '57P03' }))).toBe(true);
    expect(isDatabaseUnavailable(Object.assign(new Error('sorry, too many clients already'), { code: '53300' }))).toBe(true);
  });

  it('does not blame the database for other network errors or query bugs', () => {
    expect(isDatabaseUnavailable(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(false);
    expect(isDatabaseUnavailable(Object.assign(new Error('column "x" is of type date but expression is of type text'), { code: '42804' }))).toBe(false);
  });

  it('keeps unexpected errors as a generic 500', () => {
    const { host, response } = makeHost();
    filter.catch(new Error('something broke'), host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
  });

  it('passes HTTP exceptions through unchanged', () => {
    const { host, response } = makeHost();
    filter.catch(new BadRequestException('Bad file'), host);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bad file' }));
  });
});
