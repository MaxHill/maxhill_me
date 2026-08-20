import { html, nothing, type TemplateResult } from "lit-html";
import { ref } from "lit-html/directives/ref.js";

type DangerZoneAttribute = readonly [key: string, value: string];

interface DangerZoneTemplateOptions {
  title: string;
  actionLabel: string;
  onAction: (e: Event) => void;
  className?: string;
  attributes?: DangerZoneAttribute[];
  description?: string | TemplateResult;
}

export function renderDangerZone({
  title,
  actionLabel,
  onAction,
  className = "",
  attributes = [],
  description,
}: DangerZoneTemplateOptions): TemplateResult {
  const applyAttrs = (el: Element | undefined) => {
    if (!el) return;

    const entries = attributes;
    const nextKeys = entries.map(([key]) => key);

    const prevKeys = ((el as HTMLElement).dataset.dangerZonePrevAttrs || "")
      .split(",")
      .filter(Boolean);

    for (const key of prevKeys) {
      if (!nextKeys.includes(key)) {
        el.removeAttribute(key);
      }
    }

    for (const [key, value] of entries) {
      el.setAttribute(key, value);
    }

    (el as HTMLElement).dataset.dangerZonePrevAttrs = nextKeys.join(",");
  };

  return html`
    <details
      ${ref(applyAttrs)}
      class=${`danger-zone box ${className}`.trim()}
      data-variant="surface"
      data-gap="2"
      data-padding="2"
    >
      <summary class="danger-zone-summary">${title}</summary>
      ${description ? html`<p data-text="softer">${description}</p>` : nothing}
      <button
      data-margin="bs-2"
        type="button"
        class="button"
        data-style="destructive"
        @click=${onAction}
      >
        ${actionLabel}
      </button>
    </details>
  `;
}
