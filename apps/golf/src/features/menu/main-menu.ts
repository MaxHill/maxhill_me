/**
 * Persistent main menu behavior: keeps the theme button label in sync,
 * and wires up the theme switcher radio forms in the popover menus.
 *
 * Mirrors the behavior of apps/site PageLayout + ThemeSwitcher.
 */

function updateThemeLabel() {
  const themeLabel = document.getElementById("theme-label");
  if (!themeLabel) return;

  let savedTheme: string | null = null;
  try {
    savedTheme = localStorage.getItem("theme");
  } catch (_) {
    // ignore
  }
  const currentTheme = savedTheme || "system";
  const themeName = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
  themeLabel.textContent = `Theme: ${themeName}`;
}

function initThemeSwitcher(form: HTMLFormElement) {
  const targetSelector = form.getAttribute("data-target") || "html";
  const shouldPersist = form.getAttribute("data-persist") === "true";

  const targetElement =
    targetSelector === "html"
      ? document.documentElement
      : (document.querySelector(targetSelector) as HTMLElement | null);

  if (!targetElement) return;

  let savedTheme = "system";
  if (shouldPersist) {
    try {
      savedTheme = localStorage.getItem("theme") || "system";
    } catch (_) {
      // ignore
    }
  }

  const savedInput = form.querySelector<HTMLInputElement>(`input[value="${savedTheme}"]`);
  if (savedInput) savedInput.checked = true;

  function updateTheme(theme: string) {
    if (!targetElement) return;

    if (theme === "system") {
      if (shouldPersist) {
        try {
          localStorage.removeItem("theme");
        } catch (_) {
          // ignore
        }
      }
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        targetElement.setAttribute("data-theme", "dark");
      } else {
        targetElement.setAttribute("data-theme", "light");
      }
    } else {
      if (shouldPersist) {
        try {
          localStorage.setItem("theme", theme);
        } catch (_) {
          // ignore
        }
      }
      targetElement.setAttribute("data-theme", theme);
    }

    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }

  if (shouldPersist) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      let currentTheme: string | null = null;
      try {
        currentTheme = localStorage.getItem("theme");
      } catch (_) {
        // ignore
      }
      if (!currentTheme) updateTheme("system");
    });
  }

  form.addEventListener("change", (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.name === "theme") {
      const theme = target.value;
      const startVT = (
        document as Document & {
          startViewTransition?: (cb: () => void) => unknown;
        }
      ).startViewTransition;
      if (typeof startVT === "function") {
        startVT.call(document, () => updateTheme(theme));
      } else {
        updateTheme(theme);
      }
    }
  });
}

function init() {
  document.querySelectorAll<HTMLFormElement>(".theme-switcher").forEach(initThemeSwitcher);
  updateThemeLabel();
  document.addEventListener("themechange", updateThemeLabel);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
