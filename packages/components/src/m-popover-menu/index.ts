import { MElement, BindAttribute, generateUUID } from "@maxhill/web-component-utils";
import { computePosition, autoUpdate, offset, flip, shift } from '@floating-ui/dom';
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A positioned popover menu using native Popover API with Floating UI positioning
 * 
 * @customElement
 * @tagname m-popover-menu
 * 
 * @slot - Default slot for popover content
 * 
 * @attr {string} id - Required ID for popovertarget reference
 * @attr {string} popover - Native popover mode ("auto" or "manual")
 * @attr {string} anchor - ID of the anchor/trigger element
 * 
 * @prop {string} anchor - ID of anchor element
 */
export class MPopoverMenu extends MElement {
    static tagName = 'm-popover-menu';

    @BindAttribute()
    anchor?: string;

    private _shadowRoot: ShadowRoot;
    private _cleanup: (() => void) | null = null;
    private anchorElement: HTMLElement | null = null;
    private internals: ElementInternals;

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open' });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
        this.internals = this.attachInternals();
    }

    connectedCallback() {
        this.render();
        this.setupRole();
        this.findAnchorElement();
        this.setupPositioning();
    }
    
    private setupRole() {
        // Set default role via internals if not already set by user
        if (!this.hasAttribute('role')) {
            this.internals.role = 'menu';
        }
    }

    disconnectedCallback() {
        this.cleanup();
        this.removeEventListener('beforetoggle', this.handleBeforeToggle);
        this.removeEventListener('toggle', this.handleToggle);
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        
        if (name === 'anchor' && this._shadowRoot) {
            this.findAnchorElement();
        }
    }

    private render() {
        this._shadowRoot.innerHTML = `<slot></slot>`;
    }

    private findAnchorElement() {
        if (!this.anchor) {
            console.warn('m-popover-menu: No anchor attribute provided');
            return;
        }

        this.anchorElement = document.getElementById(this.anchor);
        
        if (!this.anchorElement) {
            console.warn(`m-popover-menu: Could not find anchor element with id="${this.anchor}"`);
        }
    }

    private setupPositioning() {
        this.addEventListener('beforetoggle', this.handleBeforeToggle);
        this.addEventListener('toggle', this.handleToggle);
    }

    private handleBeforeToggle = async (event: Event) => {
        if ((event as ToggleEvent).newState === 'open' && this.anchorElement) {
            await this.updatePosition();
            
            this._cleanup = autoUpdate(
                this.anchorElement,
                this,
                () => this.updatePosition()
            );
        }
    };

    private handleToggle = (event: Event) => {
        if ((event as ToggleEvent).newState !== 'open') {
            this.cleanup();
        }
    };

    private async updatePosition() {
        if (!this.anchorElement) return;

        const { x, y } = await computePosition(
            this.anchorElement,
            this,
            {
                placement: 'bottom-end',
                middleware: [
                    offset(8),
                    flip(),
                    shift({ padding: 8 })
                ],
            }
        );

        Object.assign(this.style, {
            left: `${x}px`,
            top: `${y}px`,
        });
    }

    private cleanup() {
        if (this._cleanup) {
            this._cleanup();
            this._cleanup = null;
        }
    }
}

export default MPopoverMenu;
