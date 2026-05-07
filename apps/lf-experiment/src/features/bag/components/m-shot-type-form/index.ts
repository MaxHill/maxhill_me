import { MElement, BindAttribute } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "uhtml";
import { get_DB } from "../../../../db";
import { ShotType, ShotTypeService } from "../../shot-type-service";
import { globalStyleSheet } from "../../../../styles/global-styles";
import "@maxhill/components/m-input";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form for adding or editing shot types
 *
 * @customElement
 * @tagname m-shot-type-form
 * 
 * @attr {string} shot-type-key - Key of shot type to edit (omit for add mode)
 */
export class MShotTypeForm extends MElement {
  static tagName = "m-shot-type-form";

  @BindAttribute({ attribute: "shot-type-key" })
  shotTypeKey: string = "";

  @BindAttribute()
  inline: boolean = false; // If true, renders in inline/dialog mode

  private shotTypeService!: ShotTypeService;
  private formRef: HTMLFormElement | null = null;
  private shotType: ShotType | null = null;
  private isEditMode = false;
  private isStockShotType = false;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.shotTypeService = new ShotTypeService(db);
    
    // Check if we're in edit mode
    this.isEditMode = !!this.shotTypeKey;
    
    // Load existing shot type if in edit mode
    if (this.isEditMode) {
      const row = await this.shotTypeService.table.get(this.shotTypeKey);
      this.shotType = row ? (row as ShotType) : null;
      this.isStockShotType = this.shotType?.name === "Stock";
    }
    
    this.renderComponent();
  }

  private handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    if (!this.formRef) return;

    const formData = new FormData(this.formRef);
    const name = formData.get("name")?.toString();
    const description = formData.get("description")?.toString();

    if (!name || !description) {
      return;
    }

    if (this.isEditMode) {
      // Update existing shot type
      await this.shotTypeService.table.setRow(this.shotTypeKey, {
        ...this.shotType,
        name: this.isStockShotType ? "Stock" : name, // Don't allow changing Stock name
        description,
      });
      
      // Always emit event - let parent decide what to do
      this.dispatchEvent(new CustomEvent('shot-type-saved', { 
        detail: { key: this.shotTypeKey },
        bubbles: true,
        composed: true
      }));
      
      // Navigate back if not in inline mode
      if (!this.inline) {
        window.location.href = '/bag';
      }
    } else {
      // Add new shot type
      const newKey = crypto.randomUUID();
      await this.shotTypeService.table.setRow(newKey, {
        name,
        description,
      });
      
      // Always emit event with the new key - let parent decide what to do
      this.dispatchEvent(new CustomEvent('shot-type-created', { 
        detail: { key: newKey },
        bubbles: true,
        composed: true
      }));
      
      // Navigate back if not in inline mode
      if (!this.inline) {
        window.location.href = '/bag';
      }
    }
  };

  private handleDelete = async () => {
    if (!this.isEditMode || !this.shotType) return;
    
    // Confirm deletion
    if (!confirm(`Archive "${this.shotType.name}" shot type? It will be hidden from new clubs but preserved in existing clubs.`)) {
      return;
    }
    
    // Soft delete: mark as archived
    await this.shotTypeService.table.setRow(this.shotTypeKey, {
      ...this.shotType,
      archived: true,
    });
    
    // Navigate back
    window.history.back();
  };

  private renderComponent() {
    const title = this.isEditMode 
      ? `Edit${this.isStockShotType ? " Stock Shot Type" : " Shot Type"}` 
      : this.inline ? "New Shot Type" : "Add Shot Type";
    const submitLabel = this.isEditMode 
      ? "Save Changes" 
      : this.inline ? "Create & Select" : "Add Shot Type";

    render(this.shadowRoot!, html`
      <form 
        ref=${(el: any) => this.formRef = el}
        class="form" 
        aria-label=${`${title} form`}
        @submit=${this.handleFormSubmit}
      >
        <h2 class="h1">${title}</h2>
        
        <m-input 
          required 
          minlength="2" 
          name="name" 
          label="Name" 
          placeholder="e.g., Full swing, Punch, Flop"
          value=${this.shotType?.name || ""}
          ?disabled=${this.isStockShotType}
          aria-required="true"
          clearable
        ></m-input>
        
        <m-input 
          required 
          minlength="10" 
          name="description" 
          label="Description" 
          placeholder="Describe when and how you use this shot"
          value=${this.shotType?.description || ""}
          aria-required="true"
          clearable
        ></m-input>

        <div class="form-actions stack" data-direction="row">
          <button class="button" type="submit" data-style="constructive">
            ${submitLabel}
          </button>
          <button 
            class="button" 
            type="button" 
            data-variant="secondary" 
            @click=${() => {
              this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
              if (!this.inline) {
                window.location.href = '/bag';
              }
            }}
          >
            Cancel
          </button>
        </div>
        
        ${this.isEditMode && !this.isStockShotType && !this.inline ? html`
          <button 
            class="button delete-button" 
            type="button" 
            data-style="destructive"
            @click=${this.handleDelete}
          >
            Archive Shot Type
          </button>
        ` : null}
      </form>
    `);
  }
}

export default MShotTypeForm;
