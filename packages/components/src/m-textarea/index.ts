import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { query } from "@maxhill/web-component-utils";
import { BindAttribute } from "@maxhill/web-component-utils";
import { MTextareaClearEvent } from "./events";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Multi-line text input component with form participation, validation,
 * clear buttons, and slot-based customization.
 *
 * @customElement
 * @tagname m-textarea
 *
 * @slot - Default slot for component content
 * @slot before - Content before the textarea element (icons, chips, buttons)
 * @slot after - Content after the textarea element
 * @slot clear - Override the default clear button
 *
 * @attr {string} value - Current value of the textarea
 * @attr {string} label - Visible label text and accessible name
 * @attr {string} name - Name for form submission
 * @attr {string} placeholder - Placeholder text
 * @attr {number} rows - Number of visible text lines (default: 3)
 * @attr {number} cols - Number of visible character columns
 * @attr {string} wrap - Text wrapping mode: soft (default), hard, or off
 * @attr {number} minlength - Minimum character length
 * @attr {number} maxlength - Maximum character length
 * @attr {boolean} required - Whether the field is required for form submission
 * @attr {boolean} disabled - Disables the textarea and excludes it from form submission
 * @attr {boolean} readonly - Makes the textarea read-only (value still submitted)
 * @attr {boolean} clearable - Shows a clear button when textarea has content
 * @attr {boolean} autofocus - Automatically focuses the textarea on page load
 *
 * @csspart label - The label element
 * @csspart textarea-wrapper - The wrapper containing the textarea and slots
 * @csspart textarea - The native textarea element
 * @csspart clear-button - The clear button
 * @csspart clear-icon - The icon inside the clear button
 * @csspart error - The error message container
 *
 * @event m-invalid - Fires when validation fails. Detail: { validity: ValidityState, validationMessage: string, value: string }
 * @event m-textarea-clear - Fires when clear button is clicked (cancelable). Detail: { value: string }
 */
export class MTextarea extends MFormAssociatedElement {
  static tagName = "m-textarea";
  static formAssociated = true;

  @query("textarea")
  private textareaElement!: HTMLTextAreaElement;

  @query("label")
  private labelElement!: HTMLLabelElement;

  @query(".error")
  private errorElement!: HTMLElement;

  @BindAttribute()
  rows: number = 3;

  @BindAttribute()
  cols?: number;

  @BindAttribute()
  wrap?: "soft" | "hard" | "off";

  @BindAttribute({ attribute: "minlength" })
  minLength?: number;

  @BindAttribute({ attribute: "maxlength" })
  maxLength?: number;

  @BindAttribute()
  placeholder?: string;

  @BindAttribute()
  clearable: boolean = false;

  @BindAttribute()
  autofocus: boolean = false;

  @query('slot[name="clear"]')
  private clearSlot!: HTMLSlotElement;
  get clearSlotHasContent() {
    return this.clearSlot?.assignedElements().length > 0;
  }

  get selectionStart(): number | null {
    return this.textareaElement?.selectionStart ?? null;
  }

  set selectionStart(value: number | null) {
    if (this.textareaElement && value !== null) {
      this.textareaElement.selectionStart = value;
    }
  }

  get selectionEnd(): number | null {
    return this.textareaElement?.selectionEnd ?? null;
  }

  set selectionEnd(value: number | null) {
    if (this.textareaElement && value !== null) {
      this.textareaElement.selectionEnd = value;
    }
  }

  get selectionDirection(): "forward" | "backward" | "none" | null {
    return (this.textareaElement?.selectionDirection as "forward" | "backward" | "none") ?? null;
  }

  set selectionDirection(value: "forward" | "backward" | "none" | null) {
    if (this.textareaElement && value !== null) {
      this.textareaElement.selectionDirection = value;
    }
  }

  select() {
    this.textareaElement?.select();
  }

  focus(options?: FocusOptions) {
    this.textareaElement?.focus(options);
  }
  
  blur() {
    this.textareaElement?.blur();
  }

  constructor() {
    super();
    this.attachShadow({
      mode: "open",
      delegatesFocus: true,
    });
    this.shadowRoot!.adoptedStyleSheets = [baseStyleSheet];

    // Set default value to empty string for textareas (not null like listbox)
    if (this.value === null) {
      this.value = "";
    }
  }

  connectedCallback() {
    super.connectedCallback();

    this.render();
    // Update validity after rendering so textareaElement exists
    this.updateValidity();

    this.toggleClearButton();

    this.textareaElement.addEventListener("input", this.handleInput);
    this.textareaElement.addEventListener("blur", this.handleBlur);
    this.clearSlot.addEventListener("click", this.handleClearClick);

    // Handle autofocus manually since it doesn't work automatically with Shadow DOM
    if (this.autofocus) {
      // Use requestAnimationFrame to ensure the element is fully connected
      requestAnimationFrame(() => {
        this.textareaElement?.focus();
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.textareaElement.removeEventListener("input", this.handleInput);
    this.textareaElement.removeEventListener("blur", this.handleBlur);
    this.clearSlot.removeEventListener("click", this.handleClearClick);
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (!this.textareaElement) return;

    // Special case: label goes to labelElement
    if (name === "label") {
      this.labelElement.textContent = newValue as string || "";
      return;
    }

    // Attributes to forward directly to the inner textarea element
    const textareaAttributes = [
      "disabled",
      "readonly",
      "required",
      "rows",
      "cols",
      "wrap",
      "minlength",
      "maxlength",
      "placeholder",
      "autofocus",
    ];

    if (textareaAttributes.includes(name)) {
      if (newValue != null) {
        this.textareaElement.setAttribute(name, String(newValue));
      } else {
        this.textareaElement.removeAttribute(name);
      }
    }

    // Note: parent's attributeChangedCallback already calls updateValidity()
    this.toggleClearButton();
  }

  /**
   * Tie wrapped native textarea value to m-textarea value
   */
  protected onValueChange = (value: string | string[] | null) => {
    if (Array.isArray(value)) {
      console.error("trying to set array value to string textarea", this.tagName, value);
      return;
    }
    if (this.textareaElement) {
      // Convert null to empty string for native textarea element
      this.textareaElement.value = value ?? "";
    }
  };

  /**
   * Update error UI when validation state changes
   */
  protected onValidationChange = (isValid: boolean, validationMessage: string) => {
    if (!this.errorElement) return;

    if (!isValid && this.hasInteracted) {
      // Show error when invalid and user has interacted
      this.errorElement.textContent = validationMessage;
    } else if (isValid) {
      // Clear error when valid
      this.errorElement.textContent = "";
    }
  };

  //  ------------------------------------------------------------------------
  //  Event handlers
  //  ------------------------------------------------------------------------
  handleBlur = (_e: Event) => {
    this.hasInteracted = true;
    this.updateValidity();
  };

  handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    if (target) this.value = target.value;
    // Note: value setter already calls updateValidity()
    this.toggleClearButton();
  };

  private handleClearClick = (e: Event) => {
    e.preventDefault();

    // Dispatch custom clear event with current value
    const clearEvent = new MTextareaClearEvent({ value: this.value as string });
    const shouldClear = this.dispatchEvent(clearEvent);

    // Only clear if event wasn't prevented
    if (shouldClear) {
      this.value = "";
      this.textareaElement.focus(); // Return focus to textarea
      this.toggleClearButton(); // Hide button after clearing
    }
  };

  //  ------------------------------------------------------------------------
  //  Validation
  //  ------------------------------------------------------------------------
  protected updateValidity() {
    if (!this.textareaElement) {
      this.updateValidationState({}, "");
      return;
    }
    const value = (this.value ?? "") as string;
    const validityState: ValidityStateFlags = {};
    let validationMessage = "";

    // 1. Check valueMissing (required)
    if (this.required && !value) {
      validityState.valueMissing = true;
      validationMessage = "This field is required";
    } // 2. Check tooShort (minlength) - only if value is not empty
    else if (this.minLength != null && value.length > 0 && value.length < this.minLength) {
      validityState.tooShort = true;
      validationMessage =
        `Please lengthen this text to ${this.minLength} characters or more (you are currently using ${value.length} characters).`;
    } // 3. Check tooLong (maxlength) - browser usually prevents this, but check anyway
    else if (this.maxLength != null && value.length > this.maxLength) {
      validityState.tooLong = true;
      validationMessage =
        `Please shorten this text to ${this.maxLength} characters or less (you are currently using ${value.length} characters).`;
    }

    // Update validation state (sets validity, custom states, and dispatches events)
    this.updateValidationState(validityState, validationMessage, this.textareaElement);
  }

  //  ------------------------------------------------------------------------
  //  Selection ranges
  //  ------------------------------------------------------------------------
  public setSelectionRange(
    start: number,
    end: number,
    direction?: "forward" | "backward" | "none",
  ) {
    this.textareaElement?.setSelectionRange(start, end, direction);
  }

  public setRangeText(replacement: string): void;
  public setRangeText(
    replacement: string,
    start: number,
    end: number,
    selectionMode?: "select" | "start" | "end" | "preserve",
  ): void;
  public setRangeText(
    replacement: string,
    start?: number,
    end?: number,
    selectionMode?: "select" | "start" | "end" | "preserve",
  ): void {
    if (!this.textareaElement) return;

    if (start !== undefined && end !== undefined) {
      this.textareaElement.setRangeText(replacement, start, end, selectionMode);
    } else {
      this.textareaElement.setRangeText(replacement);
    }

    // Sync value after setRangeText modifies the textarea
    this.value = this.textareaElement.value;
  }

  //  ------------------------------------------------------------------------
  //  Clear button
  //  ------------------------------------------------------------------------
  private toggleClearButton() {
    if (!this.clearSlot) return;

    const shouldHide = !this.clearable ||
      !this.value ||
      this.disabled ||
      this.readonly;

    if (shouldHide) {
      this.clearSlot.setAttribute("hidden", "");
    } else {
      this.clearSlot.removeAttribute("hidden");
    }
  }

  private render() {
    this.shadowRoot!.innerHTML = `
            ${this.label ? ` <label part="label" for="textarea">${this.label}</label>` : ""}
            <div part="textarea-wrapper" class="textarea-wrapper">
                <slot name="before"></slot>
                <textarea 
                part="textarea"
                id="textarea" 
                rows="${this.rows}"
                ${this.cols != null ? `cols="${this.cols}"` : ""}
                ${this.wrap != null ? `wrap="${this.wrap}"` : ""}
                ${this.required ? "required" : ""}
                ${this.readonly ? "readonly" : ""}
                ${this.disabled ? "disabled" : ""}
                ${this.autofocus ? "autofocus" : ""}
                ${this.minLength != null ? `minlength="${this.minLength}"` : ""}
                ${this.maxLength != null ? `maxlength="${this.maxLength}"` : ""}
                ${this.placeholder ? `placeholder="${this.placeholder}"` : ""}
            >${this.value ?? ""}</textarea>
                <slot name="clear">
                    <button part="clear-button" type="button" tabindex="-1" aria-label="Clear textarea">
                        <svg part="clear-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </slot>
                <slot name="after"></slot>
            </div>
            <div part="error" class="error"></div>

        `;
  }
}

export default MTextarea;
