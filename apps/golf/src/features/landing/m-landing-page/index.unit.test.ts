import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { newDatabase } from "@maxhill/syncdb";
import { authClient } from "../../auth/auth-client";

class FakeCSSStyleSheet {
  replaceSync() {}
}

const dbReady = Promise.withResolvers<unknown>();

vi.mock("../../../db", () => ({
  get_DB: vi["fn"](() => dbReady.promise),
}));

vi.mock("../../auth/auth-client", () => ({
  authClient: {
    onAuthChange: vi["fn"](() => () => {}),
    getToken: vi["fn"](async () => null),
    authorize: vi["fn"](),
  },
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
  document.body.replaceChildren();
});

describe("m-landing-page", () => {
  it("renders the hero before async settings work completes", async () => {
    await import("./index");

    const el = document.createElement("m-landing-page");
    document.body.appendChild(el);

    expect(el.shadowRoot?.textContent).toContain("Train with intent");
  });

  it("initializes signed-out settings and persists banner dismissal/reset", async () => {
    const database = await newDatabase(`landing-${crypto.randomUUID()}`)
      .addTable("user_settings", {})
      .build()
      .open();
    try {
      await import("./index");
      const element = document.createElement("m-landing-page");
      document.body.appendChild(element);
      dbReady.resolve(database);
      await expect
        .poll(() => element.shadowRoot?.textContent)
        .toContain("Sign in to sync");
      const dismiss = [...element.shadowRoot!.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Dismiss",
      );
      dismiss!.click();
      await expect
        .poll(
          async () =>
            (await database.table("user_settings").get("banner_dismissed"))
              ?.value,
        )
        .toBe(true);
      expect(element.shadowRoot?.textContent).not.toContain("Sign in to sync");
      const signedOut = vi
        .mocked(authClient.onAuthChange)
        .mock.calls.at(-1)![0];
      signedOut(false);
      await expect
        .poll(async () =>
          database.table("user_settings").get("banner_dismissed"),
        )
        .toBeUndefined();
      expect(element.shadowRoot?.textContent).toContain("Sign in to sync");
    } finally {
      await database.close();
    }
  });
});
