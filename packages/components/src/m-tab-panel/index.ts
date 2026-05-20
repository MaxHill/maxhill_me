import { BindAttribute } from "@maxhill/web-component-utils";
import { MElement, generateUUID } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A tab panel that displays content when its associated tab is active.
 * 
 * @customElement
 * @tagname m-tab-panel
 * 
 * @slot - Default slot for panel content
 * 
 * @attr {string} name - Unique identifier for this panel, referenced by m-tab's panel attribute
 * @attr {boolean} visible - Whether this panel is currently visible
 * @attr {boolean} data-padded - Whether the panel has padding (default: true)
 * 
 * @prop {string} name - Unique identifier for this panel, referenced by m-tab's panel attribute
 * @prop {boolean} visible - Whether this panel is currently visible
 */
export class MTabPanel extends MElement {
    static tagName = 'm-tab-panel';

    @BindAttribute()
    name: string = "";

    @BindAttribute()
    visible: boolean = false;

    private _runningAnimation: Animation | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        if (!this.id) {
            this.id = `panel-${generateUUID()}`;
        }
        this.setAttribute('role', 'tabpanel');
        this.setAttribute("slot", "tab-panel");
        this.render();
    }

    disconnectedCallback() {
        this.visible = false;
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'visible' && oldValue === null && newValue !== null) {
            this.playEntryTransition();
        }
    }

    private playEntryTransition() {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) return;

        const transition = this.closest('m-tab-list')?.getAttribute('transition');
        if (!transition || transition === 'none') return;

        this._runningAnimation?.cancel();

        if (transition === 'terminal-wipe') {
            this._runningAnimation = this.animate(
                [
                    { clipPath: 'inset(0 100% 0 0)', opacity: '0.6' },
                    { clipPath: 'inset(0 0% 0 0)', opacity: '1' },
                ],
                {
                    duration: 200,
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    fill: 'none',
                }
            );
        }
    }

    render() {
        this.shadowRoot!.innerHTML = `
            <slot></slot>
        `;
    }
}

// Auto-define when using default import
MTabPanel.define();

export default MTabPanel;
