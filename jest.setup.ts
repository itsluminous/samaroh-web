import '@testing-library/jest-dom';

// jsdom (jest-environment-jsdom) doesn't expose structuredClone; Dexie and
// the permission editor rely on it. JSON round-trip is sufficient for the
// plain data objects used in tests.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (<T,>(value: T): T => JSON.parse(JSON.stringify(value))) as typeof structuredClone;
}
