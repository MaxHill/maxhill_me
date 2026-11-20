import { expect, fixture, html } from "@open-wc/testing";
import { installThemeSwitchers } from "./theme-switcher";

const formMarkup = (target: string, unset = "system") => html`
  <form
    class="theme-switcher"
    data-target=${target}
    data-persist="true"
    data-unset-option=${unset}
  >
    <label><input type="radio" name="theme" value=${unset} />${unset}</label>
    <label><input type="radio" name="theme" value="light" />Light</label>
    <label><input type="radio" name="theme" value="dark" />Dark</label>
  </form>
`;

let container: HTMLElement;
let meta: HTMLMetaElement;
let stop: (() => void) | undefined;
let originalTheme: string | null;
let originalStored: string | null;
let originalStorage: PropertyDescriptor | undefined;

function select(index: number, value: string) {
  const form = container.querySelectorAll("form")[index];
  form.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click();
}

function selected(index: number) {
  const form = container.querySelectorAll("form")[index];
  return form.querySelector<HTMLInputElement>("input:checked")?.value;
}

function setupThemeControls() {
  beforeEach(async () => {
    originalTheme = document.documentElement.getAttribute("data-theme");
    originalStored = localStorage.getItem("theme");
    originalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
    localStorage.removeItem("theme");
    document.documentElement.removeAttribute("data-theme");
    meta = document.createElement("meta");
    meta.name = "color-scheme";
    meta.content = "light dark";
    document.head.append(meta);
    container = await fixture<HTMLElement>(html`
      <div>
        <span id="theme-label"></span>
        ${formMarkup("html")} ${formMarkup("html")}
        <section id="theme-preview">
          ${formMarkup("#theme-preview", "none")}
        </section>
      </div>
    `);
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    if (originalStorage) {
      Object.defineProperty(window, "localStorage", originalStorage);
    }
    if (originalStored === null) {
      localStorage.removeItem("theme");
    } else {
      localStorage.setItem("theme", originalStored);
    }
    if (originalTheme === null) {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", originalTheme);
    }
    meta.remove();
  });
}

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("theme menus", () => {
  setupThemeControls();

  it("synchronizes both menus, the label, and browser scheme, and can return to System", () => {
    stop = installThemeSwitchers();
    select(0, "dark");
    expect(selected(1)).to.equal("dark");
    expect(meta.content).to.equal("dark");
    expect(document.documentElement.dataset.theme).to.equal("dark");
    expect(localStorage.getItem("theme")).to.equal("dark");
    expect(container.querySelector("#theme-label")!.textContent).to.equal(
      "Theme: Dark",
    );
    select(1, "light");
    expect(selected(0)).to.equal("light");
    expect(meta.content).to.equal("light");
    select(0, "system");
    expect(selected(1)).to.equal("system");
    expect(meta.content).to.equal("light dark");
    expect(localStorage.getItem("theme")).to.equal(null);
    const expected = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    expect(document.documentElement.dataset.theme).to.equal(expected);
  });
});

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("theme previews", () => {
  setupThemeControls();

  it("keeps preview changes local and None restores inheritance", () => {
    stop = installThemeSwitchers();
    select(0, "light");
    select(2, "dark");
    expect(
      container.querySelector("#theme-preview")!.getAttribute("data-theme"),
    ).to.equal("dark");
    expect(document.documentElement.dataset.theme).to.equal("light");
    expect(meta.content).to.equal("light");
    expect(localStorage.getItem("theme")).to.equal("light");
    expect(selected(0)).to.equal("light");
    select(2, "none");
    expect(
      container.querySelector("#theme-preview")!.hasAttribute("data-theme"),
    ).to.equal(false);
  });
});

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("theme storage and navigation", () => {
  setupThemeControls();

  it("ignores malformed saved preferences", () => {
    localStorage.setItem("theme", '"][invalid');
    stop = installThemeSwitchers();
    expect(selected(0)).to.equal("system");
    expect(meta.content).to.equal("light dark");
  });

  it("updates from another tab, including clearing site storage", () => {
    stop = installThemeSwitchers();
    localStorage.setItem("theme", "dark");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", storageArea: localStorage }),
    );
    expect(selected(0)).to.equal("dark");
    expect(meta.content).to.equal("dark");
    localStorage.removeItem("theme");
    window.dispatchEvent(
      new StorageEvent("storage", { key: null, storageArea: localStorage }),
    );
    expect(selected(1)).to.equal("system");
    expect(meta.content).to.equal("light dark");
  });

  it("keeps a selection in memory across navigation when storage is blocked", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    stop = installThemeSwitchers();
    select(0, "dark");
    meta.content = "light dark";
    document.documentElement.removeAttribute("data-theme");
    document.dispatchEvent(new Event("astro:after-swap"));
    document.dispatchEvent(new Event("astro:page-load"));
    expect(meta.content).to.equal("dark");
    expect(document.documentElement.dataset.theme).to.equal("dark");
    expect(selected(1)).to.equal("dark");
  });

  it("resynchronizes replacement navigation controls", async () => {
    stop = installThemeSwitchers();
    select(0, "dark");
    container.remove();
    container = await fixture<HTMLElement>(
      html`<div>${formMarkup("html")}</div>`,
    );
    document.dispatchEvent(new Event("astro:page-load"));
    expect(selected(0)).to.equal("dark");
  });
});
