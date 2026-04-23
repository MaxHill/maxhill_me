import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
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
  private formRef: HTMLFormElement | null = null;
  private clubTypeCombobox: MCombobox | null = null;
  private shotTypesCombobox: MCombobox | null = null;
  private successMessage: string = '';

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

    // Load club if editing
    if (this.isEditing) {
      this.currentClub = await this.clubService.table.get(this.clubKey);

      // Redirect to 404 if club doesn't exist
      if (!this.currentClub) {
        window.history.pushState({}, "", "/404");
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }
    }

    // Load shot types
    this.shotTypes = [];
    const shotTypesIterator = this.shotTypeService.table.query();
    for await (const shotType of shotTypesIterator) {
      if (shotType._key) {
        this.shotTypes.push(shotType);
      }
    }

    this.renderComponent();

    // Populate form if editing
    if (this.isEditing && this.currentClub) {
      this.populateForm(this.currentClub);
    }
  }

  private populateForm(club: Club) {
    // Set club type by selecting the matching option
    if (this.clubTypeCombobox && club.clubType) {
      const clubTypeOption = this.clubTypeCombobox.querySelector(
        `m-option[value="${club.clubType}"]`,
      ) as MOption;
      if (clubTypeOption) {
        this.clubTypeCombobox.select(clubTypeOption);
      }
    }

    // Set shot types by selecting the matching options
    if (this.shotTypesCombobox && club.shotTypes) {
      for (const shotType of club.shotTypes) {
        if (shotType._key) {
          const option = this.shotTypesCombobox.querySelector(
            `m-option[value="${shotType._key}"]`,
          ) as MOption;
          if (option) {
            this.shotTypesCombobox.select(option);
          }
        }
      }
    }
  }

  private handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    if (!this.formRef) return;

    const formData = new FormData(this.formRef);

    const name = formData.get("name")?.toString();
    const clubType = formData.get("clubType")?.toString() as ClubTypes;
    const shotTypes = await Promise.all(
      formData.getAll("shotTypes").map(async (key) => {
        return await this.shotTypeService.table.get(key.toString());
      }),
    ) as ShotType[];

    if (!name || !clubType || shotTypes.length === 0) {
      return;
    }


    const brand = formData.get("brand")?.toString();
    const model = formData.get("model")?.toString();
    const loft = formData.get("loft")?.toString();
    const lie = formData.get("lie")?.toString();

    const club: Club = { name, clubType, shotTypes, brand, model, loft, lie };
    const key = this.isEditing ? this.clubKey : crypto.randomUUID();

    await this.clubService.setClub(key, club);

    // Dispatch event
    this.dispatchEvent(new ClubSavedEvent({ key, club }));

    // Show success message
    this.successMessage = this.isEditing ? 'Club saved' : 'Club added';
    this.renderComponent();
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      this.successMessage = '';
      this.renderComponent();
    }, 3000);

    // Reset form only when adding (not editing)
    if (!this.isEditing) {
      this.formRef.reset();
      // Reset combobox selections
      this.clubTypeCombobox?.reset?.();
      this.shotTypesCombobox?.reset?.();
    }
  };

  private renderComponent() {
    const heading = this.isEditing ? "Edit club" : "Add club";
    const buttonText = this.isEditing ? "Save" : "Add";
    const ariaLabel = this.isEditing ? "Edit club form" : "Add new club form";
    const buttonAriaLabel = this.isEditing ? "Submit form to save club" : "Submit form to add club";

    render(
      this.shadowRoot!,
      html`
        <form
          ref=${(el: any) => this.formRef = el}
          class="form"
          aria-label=${ariaLabel}
          @submit=${this.handleFormSubmit}
          part="form"
        >
        
        ${this.successMessage ? html`
          <div class="success-message" role="status" aria-live="polite">
            ${this.successMessage}
          </div>
        ` : null}
        
        <div class="form-header">
          <h2 class="h1" part="title">${heading}</h2>
          <a href="/bag" class="close-link" aria-label="Close form">×</a>
        </div>
        <div class="main-inputs">
          <m-input
            required
            min="2"
            name="name"
            label="Name *"
            placeholder="Ex. 60deg, 7, spoon"
            aria-required="true"
            value=${this.currentClub?.name || ''}
          ></m-input>

          <m-listbox
            ref=${(el: any) => this.clubTypeCombobox = el}
            required
            name="clubType"
            label="Club type *"
            placeholder="Select what type of club"
            aria-required="true"
          >
            <m-option value="putter">Putter</m-option>
            <m-option value="wedge">Wedge</m-option>
            <m-option value="iron">Iron</m-option>
            <m-option value="hybrid">Hybrid</m-option>
            <m-option value="wood">Wood</m-option>
            <m-option value="driver">Driver</m-option>
          </m-listbox>

          <details>
            <summary>Optional specs</summary>
              <m-input
                min="2"
                name="brand"
                label="Brand"
                placeholder="Ex. Titleist"
                value=${this.currentClub?.brand || ''}
              ></m-input>

              <m-input
                min="2"
                name="model"
                label="Model"
                placeholder="Ex. t100"
                value=${this.currentClub?.model || ''}
              ></m-input>

              <m-input
                min="2"
                type="number"
                name="loft"
                label="Loft (deg)"
                placeholder="Ex. 38"
                value=${this.currentClub?.loft || ''}
              ></m-input>

              <m-input
                min="2"
                type="number"
                name="lie"
                label="Lie"
                placeholder="Ex. 30"
                value=${this.currentClub?.loft || ''}
              ></m-input>


          </details>
        </div>
        
        <m-listbox
            ref=${(el: any) => this.shotTypesCombobox = el}
            class="shot-type"
            required
            name="shotTypes"
            label="Shot types *"
            mode="multiple"
            placeholder="Select available shot types"
            aria-required="true"
          >
            ${this.shotTypes.map((shotType) =>
              html`
                <m-option value=${shotType._key}>
                    <div class="name">${shotType.name}</div>
                    <div class="description">${shotType.description}</div>
                </m-option>
              `
            )}
          </m-listbox>
        
        <button part="save-button" class="button submit-button" type="submit" aria-label=${buttonAriaLabel}>
          ${buttonText}
        </button>
        </form>
      `,
    );
  }
}

export default MClubForm;
