import type { Config } from 'jest';

const config: Config = {
  displayName   : 'integration',
  preset        : 'ts-jest',
  testEnvironment: 'node',
  testMatch     : ['**/*.integration.test.ts'],
  globalSetup   : undefined,
  testTimeout   : 60_000,
  globals       : { 'ts-jest': { tsconfig: { strict: false } } },
};

export default config;
