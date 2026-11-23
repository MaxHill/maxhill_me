type Theme = "system" | "light" | "dark";
type PreviewTheme = Theme | "none";

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem("theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function targetFor(form: Element): Element | null {
  return document.querySelector(form.getAttribute("data-target") || "html");
}

class ThemeControls {
  private controller = new AbortController();
  private mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  private previews = new WeakMap<Element, PreviewTheme>();
  private preference: Theme = "system";

  start(): void {
    const scheme = document.querySelector<HTMLMetaElement>(
      'meta[name="color-scheme"]',
    )?.content;
    this.preference =
      scheme === "light" || scheme === "dark" ? scheme : storedTheme();
    const options = { signal: this.controller.signal };
    document.addEventListener("change", (event) => this.change(event), options);
    this.mediaQuery.addEventListener(
      "change",
      () => this.synchronize(),
      options,
    );
    window.addEventListener(
      "storage",
      (event) => this.storageChanged(event),
      options,
    );
    document.addEventListener(
      "astro:after-swap",
      () => this.applyRoot(),
      options,
    );
    document.addEventListener(
      "astro:page-load",
      () => this.synchronize(),
      options,
    );
    this.synchronize();
  }

  dispose(): void {
    this.controller.abort();
  }

  private apply(target: Element, theme: PreviewTheme): void {
    if (theme === "none") {
      target.removeAttribute("data-theme");
    } else {
      const system = this.mediaQuery.matches ? "dark" : "light";
      target.setAttribute("data-theme", theme === "system" ? system : theme);
    }
  }

  private applyRoot(): void {
    this.apply(document.documentElement, this.preference);
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="color-scheme"]',
    );
    if (meta) {
      meta.content =
        this.preference === "system" ? "light dark" : this.preference;
    }
  }

  private synchronize(): void {
    this.applyRoot();
    document
      .querySelectorAll<HTMLFormElement>("form.theme-switcher")
      .forEach((form) => {
        const target = targetFor(form);
        if (!target) {
          return;
        }
        const isRoot = target === document.documentElement;
        const unset =
          form.getAttribute("data-unset-option") === "none" ? "none" : "system";
        const theme = isRoot
          ? this.preference
          : (this.previews.get(target) ?? unset);
        if (!isRoot) {
          this.previews.set(target, theme);
          this.apply(target, theme);
        }
        form
          .querySelectorAll<HTMLInputElement>('input[name="theme"]')
          .forEach((input) => {
            input.checked = input.value === theme;
          });
      });
    const label = document.getElementById("theme-label");
    if (label) {
      const theme = this.preference;
      label.textContent = `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}`;
    }
  }

  private change(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "theme") {
      return;
    }
    const form = input.closest("form.theme-switcher");
    const target = form ? targetFor(form) : null;
    const theme = input.value;
    if (
      !form ||
      !target ||
      !["system", "light", "dark", "none"].includes(theme)
    ) {
      return;
    }
    if (target === document.documentElement) {
      this.preference = theme === "none" ? "system" : (theme as Theme);
      if (form.getAttribute("data-persist") === "true") {
        this.persist();
      }
    } else {
      this.previews.set(target, theme as PreviewTheme);
    }
    this.synchronize();
    document.dispatchEvent(
      new CustomEvent("themechange", { detail: { theme } }),
    );
  }

  private persist(): void {
    try {
      if (this.preference === "system") {
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", this.preference);
      }
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }

  private storageChanged(event: StorageEvent): void {
    if (event.key !== "theme" && event.key !== null) {
      return;
    }
    try {
      if (event.storageArea !== localStorage) {
        return;
      }
    } catch {
      return;
    }
    this.preference = storedTheme();
    this.synchronize();
  }
}

/** Bind theme controls, including controls added by Astro navigation. */
export function installThemeSwitchers(): () => void {
  const controls = new ThemeControls();
  controls.start();
  return () => controls.dispose();
}
