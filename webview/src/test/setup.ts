import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

const postedMessages: unknown[] = [];

Object.assign(globalThis, {
  __postedMessages: postedMessages,
  acquireVsCodeApi: () => ({
    postMessage: (message: unknown) => postedMessages.push(message),
    getState: () => undefined,
    setState: () => undefined
  })
});

beforeEach(() => postedMessages.splice(0));
afterEach(() => cleanup());
