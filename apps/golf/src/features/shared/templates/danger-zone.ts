import { html, nothing, type TemplateResult } from "lit-html";

interface DangerZoneTemplateOptions {
  title: string;
  actionLabel: string;
  onAction: (e: Event) => void;
  className?: string;
  description?: string | TemplateResult;
}

export function renderDangerZone({
  title,
  actionLabel,
  onAction,
  className = "",
  description,
}: DangerZoneTemplateOptions): TemplateResult {
  return html`
    <details class=${`danger-zone box stack ${className}`.trim()} data-variant="surface" data-gap="2" data-margin="bs-4">
      <summary class="danger-zone-summary">${title}</summary>
      ${description ? html`<p data-text="softer">${description}</p>` : nothing}
      <button
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
