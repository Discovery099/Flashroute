import '@testing-library/jest-dom/vitest';

if (!globalThis.Headers) {
  globalThis.Headers = window.Headers;
}

if (!globalThis.Request) {
  globalThis.Request = window.Request;
}

if (!globalThis.Response) {
  globalThis.Response = window.Response;
}
