import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

class FakeCSSStyleSheet {
  replaceSync() {}
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const dbReady = deferred<{}>();

vi.mock("../../../db", () => ({
  get_DB: vi.fn(() => dbReady.promise),
}));

vi.mock("../../auth/auth-client", () => ({
  authClient: {
    onAuthChange: vi.fn(() => () => {}),
    getToken: vi.fn(async () => null),
    authorize: vi.fn(),
  },
}));

vi.mock("../../user-settings/sync-banner", () => ({
  renderSyncBanner: () => null,
}));

vi.mock("../../../styles/global-styles", () => ({
  globalStyleSheet: new FakeCSSStyleSheet(),
}));

vi.mock("@maxhill/components/m-fit-text", () => ({}));

beforeAll(() => {
  Object.assign(globalThis, {
    CSSStyleSheet: FakeCSSStyleSheet,
  });

  Object.defineProperty(Document.prototype, "adoptedStyleSheets", {
    configurable: true,
    writable: true,
    value: [],
  });

  Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", {
    configurable: true,
    writable: true,
    value: [],
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("m-landing-page", () => {
  it("renders the hero before async settings work completes", async () => {
    await import("./index");

    const el = document.createElement("m-landing-page");
    document.body.appendChild(el);

    expect(el.shadowRoot?.textContent).toContain("Train with intent");
  });
});
