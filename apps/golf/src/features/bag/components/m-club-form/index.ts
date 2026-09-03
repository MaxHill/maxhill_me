import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { createRef, ref } from "lit-html/directives/ref.js";
import "@maxhill/components/m-combobox";
import "@maxhill/components/m-listbox";
import "@maxhill/components/m-option";
import "@maxhill/components/m-input";
import "@maxhill/components/m-search-list";
import type { MCombobox } from "@maxhill/components/m-combobox";
import type { MOption } from "@maxhill/components/m-option";
import { ShotType, ShotTypeService } from "../../shot-type-service";
import { get_DB } from "../../../../db";
import { Club, ClubService, ClubTypes } from "../../club-service";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { ClubSavedEvent } from "../../events";
import "../m-shot-type-form";
import { renderDangerZone } from "../../../shared/templates/danger-zone";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form for adding or editing a club
 *
 * @customElement
 * @tagname m-club-form
 *
 * @attr {string} club-key - The key of the club to edit (optional, for edit mode)
 */
export class MClubForm extends MElement {
  static tagName = "m-club-form";

  @BindAttribute({ attribute: "club-key" })
  clubKey: string = "";

  private shotTypeService!: ShotTypeService;
  private clubService!: ClubService;
  private currentClub: Club | null = null;
  private shotTypes: ShotType[] = [];
  private formRef = createRef<HTMLFormElement>();
  private clubTypeCombobox = createRef<MCombobox>();
  private shotTypesCombobox = createRef<MCombobox>();
  private dialogRef = createRef<HTMLDialogElement>();
  private unsubscribe!: () => void;
  private saveInFlight: Promise<void> = Promise.resolve();

  get isEditing(): boolean {
    return !!this.clubKey;
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.shotTypeService = new ShotTypeService(db);
    this.clubService = new ClubService(db);

    this.unsubscribe = this.shotTypeService.subscribe(async () => {
      await this.loadShotTypes();
      this.renderComponent();
    });

    await this.loadForCurrentKey();
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    // Guarded on `clubService` to avoid racing connectedCallback.
    if (name === "club-key" && this.clubService) {
      void this.loadForCurrentKey();
    }
  }

  private async loadForCurrentKey() {
    // Reset state before reload so a navigation from one edit to another
    // (or to /add) doesn't leak previous values into the new render.
    this.currentClub = null;

    if (this.isEditing) {
      const row = await this.clubService.table.get(this.clubKey);
      this.currentClub = row ? (row as Club) : null;

      if (!this.currentClub) {
        window.history.pushState({}, "", "/404");
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }
    }

    await this.loadShotTypes();
    this.renderComponent();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  private async loadShotTypes() {
    this.shotTypes = [];
    const shotTypesIterator = this.shotTypeService.table.query();
    for await (const shotType of shotTypesIterator) {
      if (shotType._key) {
        this.shotTypes.push(shotType as ShotType);
      }
    }
  }

  private handleFormSubmit = (e: Event) => {
    e.preventDefault();
    void this.saveClub("submit");
  };

  private handleAutosave = () => {
    if (!this.isEditing) return;
    void this.saveClub("autosave");
  };

  private saveClub = (trigger: "submit" | "autosave"): Promise<void> => {
    this.saveInFlight = this.saveInFlight.then(async () => {
      const form = this.formRef.value;
      if (!form || !form.checkValidity()) return;

      const formData = new FormData(form);
      const name = formData.get("name")?.toString();
      const clubType = formData.get("clubType")?.toString() as ClubTypes;
      const shotTypes = await Promise.all(
        formData.getAll("shotTypes").map(async (key) =>
          await this.shotTypeService.table.get(key.toString()),
        ),
      ) as ShotType[];

      if (!name || !clubType || shotTypes.length === 0) return;

      const club: Club = { name, clubType, shotTypes };
      for (const field of ["brand", "model", "loft", "lie"] as const) {
        const value = formData.get(field)?.toString();
        if (value) club[field] = value;
      }

      const mode = this.isEditing ? "edit" : "add";
      const key = this.isEditing ? this.clubKey : crypto.randomUUID();
      await this.clubService.setClub(key, club);
      this.dispatchEvent(new ClubSavedEvent({ key, club, mode, trigger }));

      if (mode === "add") {
        // The controls are form-associated custom elements, so reset them
        // through the form rather than relying on rerendering attributes.
        form.reset();
        this.currentClub = null;
        this.renderComponent();
        (this.shadowRoot?.querySelector("m-input[name='name']") as HTMLElement)?.focus();
      }
    }).catch((error) => {
      // Keep the queue usable after a failed write. A future save can retry.
      console.error("Failed to save club", error);
    });
    return this.saveInFlight;
  };

  private handleOpenDialog = () => {
    this.dialogRef.value?.showModal();
  };

  private handleCloseDialog = () => {
    this.dialogRef.value?.close();
  };

  private handleShotTypeCreated = async (e: CustomEvent) => {
    const { key } = e.detail;

    this.handleCloseDialog();

    await new Promise((resolve) => setTimeout(resolve, 100));

    if (this.shotTypesCombobox.value) {
      const option = this.shotTypesCombobox.value.querySelector(
        `m-option[value="${key}"]`,
      ) as MOption;
      if (option) {
        this.shotTypesCombobox.value.select(option);
      }
    }
  };

  private handleDeleteClub = async () => {
    if (!this.isEditing) return;

    await this.clubService.deleteClub(this.clubKey);

    window.history.pushState({}, "", "/bag");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  private renderComponent() {
    const heading = this.isEditing ? "Edit club" : "Add club";
    const buttonText = this.isEditing ? "Save" : "Add";
    const ariaLabel = this.isEditing ? "Edit club form" : "Add new club form";
    const buttonAriaLabel = this.isEditing ? "Submit form to save club" : "Submit form to add club";
    const selectedShotTypeKeys = new Set(
      (this.currentClub?.shotTypes ?? [])
        .map((shotType) => shotType?._key)
        .filter((key): key is string => !!key),
    );

    render(
      html`
        <form
          ${ref(this.formRef)}
          class="form"
          aria-label=${ariaLabel}
          @submit=${this.handleFormSubmit}
          part="form"
        >

        <div class="form-header">
          <h2 class="h1" part="title">${heading}</h2>
          <a href="/bag" class="close-link" aria-label="Close form">×</a>
        </div>
        <div class="main-inputs">
          <m-input
            required
            min="2"
            name="name"
            @blur=${this.handleAutosave}
            label="Name *"
            placeholder="Ex. 60deg, 7, spoon"
            aria-required="true"
            value=${this.currentClub?.name || ""}
          ></m-input>

          <m-listbox
            ${ref(this.clubTypeCombobox)}
            required
            name="clubType"
            @change=${this.handleAutosave}
            label="Club type *"
            placeholder="Select what type of club"
            aria-required="true"
          >
            <m-option value="putter" ?selected=${this.currentClub?.clubType ===
              "putter"}>Putter</m-option>
            <m-option value="wedge" ?selected=${this.currentClub?.clubType ===
              "wedge"}>Wedge</m-option>
            <m-option value="iron" ?selected=${this.currentClub?.clubType ===
              "iron"}>Iron</m-option>
            <m-option value="hybrid" ?selected=${this.currentClub?.clubType ===
              "hybrid"}>Hybrid</m-option>
            <m-option value="wood" ?selected=${this.currentClub?.clubType ===
              "wood"}>Wood</m-option>
            <m-option value="driver" ?selected=${this.currentClub?.clubType ===
              "driver"}>Driver</m-option>
          </m-listbox>

          <details class="optional-specs box" data-padding="2">
            <summary>Optional specs</summary>
              <m-input
                min="2"
                name="brand"
                @blur=${this.handleAutosave}
                label="Brand"
                placeholder="Ex. Titleist"
                value=${this.currentClub?.brand || ""}
              ></m-input>

              <m-input
                min="2"
                name="model"
                @blur=${this.handleAutosave}
                label="Model"
                placeholder="Ex. t100"
                value=${this.currentClub?.model || ""}
              ></m-input>

              <m-input
                min="2"
                type="number"
                name="loft"
                @blur=${this.handleAutosave}
                label="Loft (deg)"
                placeholder="Ex. 38"
                value=${this.currentClub?.loft || ""}
              ></m-input>

              <m-input
                min="2"
                type="number"
                name="lie"
                @blur=${this.handleAutosave}
                label="Lie"
                placeholder="Ex. 30"
                value=${this.currentClub?.lie || ""}
              ></m-input>


          </details>
        </div>

        <div class="shot-types-section">
          <m-listbox
              ${ref(this.shotTypesCombobox)}
              class="shot-type"
              required
              name="shotTypes"
              @change=${this.handleAutosave}
              label="Shot types *"
              mode="multiple"
              placeholder="Select available shot types"
              aria-required="true"
            >
              ${this.shotTypes.map((shotType) =>
                html`
                  <m-option value=${shotType._key} ?selected=${selectedShotTypeKeys.has(
                    shotType._key!,
                  )}>
                    <div class="name">${shotType.name}</div>
                    <div class="description">${shotType.description}</div>
                  </m-option>
                `
              )}
            </m-listbox>

          <button 
            type="button" 
            class="button create-shot-type-button" 
            data-variant="secondary"
            @click=${this.handleOpenDialog}
            aria-label="Create new shot type"
          >
            + Create New Shot Type
          </button>
        </div>

        ${this.isEditing
          ? null
          : html`<button part="save-button" class="button submit-button" type="submit" aria-label=${buttonAriaLabel}>
              ${buttonText}
            </button>`}

        ${this.isEditing
          ? renderDangerZone({
            title: "Danger zone",
            attributes: [["data-margin", "bs-4"]],
            actionLabel: "Remove club",
            onAction: this.handleDeleteClub,
          })
          : null}
        </form>

        <dialog ${ref(this.dialogRef)} class="shot-type-dialog">
          <m-shot-type-form
            inline
            @shot-type-created=${this.handleShotTypeCreated}
            @cancel=${this.handleCloseDialog}
          ></m-shot-type-form>
        </dialog>
      `,
      this.shadowRoot!,
    );
  }
}

export default MClubForm;
