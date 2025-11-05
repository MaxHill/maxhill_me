import { MTab } from "./tab";
import { MTabPanel } from "./tab-panel";
import { BindAttribute } from "../utils/reflect-attribute";
import { MElement } from "../utils/m-element";
import styles from "./tab-list.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export interface MTabChangeEventDetail {
    tab: MTab;
    panel: MTabPanel;
}

/**
 * 
 * @class
 * @classdesc Event sent when tab becomes active
 */
export class MTabShowEvent extends CustomEvent<MTabChangeEventDetail> {
    constructor(detail: MTabChangeEventDetail) {
        super('m-tab-show', {
            detail,
            bubbles: true,
            composed: true
        });
    }
}

/**
 * 
 * @class
 * @classdesc Event sent when a tab is hidden
 */
export class MTabHideEvent extends CustomEvent<MTabChangeEventDetail> {
    constructor(detail: MTabChangeEventDetail) {
        super('m-tab-hide', {
            detail,
            bubbles: true,
            composed: true
        });
    }
}

/**
 * A tab list container that manages tabs and their associated panels with full keyboard navigation.
 * Supports arrow keys (and vim h/l), Home/End keys for navigation.
 * 
 * ### Example
 * ```html
 * <m-tab-list tab="home">
 *   <m-tab panel="home">Home</m-tab>
 *   <m-tab panel="profile">Profile</m-tab>
 *   <m-tab panel="settings" disabled>Settings</m-tab>
 *   
 *   <m-tab-panel name="home">
 *     <h2>Home Content</h2>
 *   </m-tab-panel>
 *   <m-tab-panel name="profile">
 *     <h2>Profile Content</h2>
 *   </m-tab-panel>
 *   <m-tab-panel name="settings">
 *     <h2>Settings Content</h2>
 *   </m-tab-panel>
 * </m-tab-list>
 * ```
 * 
 * @customElement
 * @tagname m-tab-list
 * 
 * @slot tab - Slot for m-tab elements (auto-assigned)
 * @slot tab-panel - Slot for m-tab-panel elements (auto-assigned)
 * 
 * @attr {string} tab - The currently active tab panel name
 * @attr {string} label - Accessible label for the tab list (sets aria-label)
 * 
 * @prop {string} tab - The currently active tab panel name
 * @prop {string} label - Accessible label for the tab list
 * 
 * @csspart tab - Container wrapping the tab buttons
 * 
 * @event m-tab-show - Fired when a tab panel becomes visible. Detail: MTabChangeEventDetail { tab: MTab, panel: MTabPanel }
 * @event m-tab-hide - Fired when a tab panel becomes hidden. Detail: MTabChangeEventDetail { tab: MTab, panel: MTabPanel }
 * 
 */
export class MTabList extends MElement {
    static tagName = 'm-tab-list';
    static observedAttributes = ['tab', 'label'];

    @BindAttribute({ attribute: "aria-label" })
    label: string = '';

    @BindAttribute()
    tab: string = '';

    #shadowRoot: ShadowRoot;
    private tabSlot!: HTMLSlotElement;
    private panelSlot!: HTMLSlotElement;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.setAttribute('role', 'tablist');
        this.render();
        this.tabSlot = this.#shadowRoot.querySelector("slot[name='tab']")!;
        this.panelSlot = this.#shadowRoot.querySelector("slot[name='tab-panel']")!;

        this.classList.add("box")
        this.setAttribute("data-padded", "false")

        this.addEventListener("click", this.handleTabsClick.bind(this));
        this.addEventListener("keydown", this.handleTabsKeyDown.bind(this));
        this.tabSlot.addEventListener('slotchange', () => {
            this.initializeActiveTab();
        });
    }

    disconnectedCallback() {
        this.removeEventListener("click", this.handleTabsClick);
        this.removeEventListener("keydown", this.handleTabsKeyDown);
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === "tab") {
            this.setActiveTab(this.tab);
        }
    }

    private initializeActiveTab() {
        const tabs = this.getTabs();
        const panels = this.getPanels();

        if (!tabs.length || !panels.length) return;

        if (!this.tab && tabs[0]?.panel) {
            this.tab = tabs[0].panel;
        } else if (this.tab) {
            this.setActiveTab(this.tab);
        }
    }

    private handleTabsClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const tab = target.closest<MTab>('m-tab');

        if (tab?.panel && !tab.disabled) {
            this.tab = tab.panel || '';
        }
    }

    private handleTabsKeyDown(event: KeyboardEvent) {
        const target = event.target as HTMLElement;
        const tab = target.closest<MTab>('m-tab');

        if (!tab) return;

        const tabs = this.getTabs();
        const currentIndex = tabs.indexOf(tab);

        if (currentIndex === -1) return;

        let targetTab: MTab | undefined;

        if (event.key === 'ArrowLeft' || event.key === 'h') {
            targetTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        } else if (event.key === 'ArrowRight' || event.key === 'l') {
            targetTab = tabs[(currentIndex + 1) % tabs.length];
        } else if (event.key === 'Home') {
            targetTab = tabs[0];
        } else if (event.key === 'End') {
            targetTab = tabs[tabs.length - 1];
        } else if (event.key === ' ') {
            event.preventDefault();
            return;
        }

        if (targetTab && targetTab.panel) {
            this.tab = targetTab.panel;
            targetTab.focus();
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private setActiveTab(name: string) {
        if (!name) { return }
        const tabs = this.getTabs({ includeDisabled: true });
        const panels = this.getPanels();

        for (const tab of tabs) {
            tab.active = tab.panel === name && !tab.disabled;
        }

        for (const panel of panels) {
            const linkedTab = tabs.find(tab => tab.panel === panel.name);

            if (linkedTab) {
                linkedTab.setAttribute('aria-controls', panel.id);
                panel.setAttribute('aria-labelledby', linkedTab.id);
            }

            if (panel.name === name && linkedTab && !linkedTab.disabled) {
                const wasVisible = panel.visible;
                panel.visible = true;
                if (!wasVisible) {
                    this.dispatchEvent(new MTabShowEvent({ tab: linkedTab, panel }));
                }
            } else if (linkedTab && panel.visible) {
                panel.visible = false;
                this.dispatchEvent(new MTabHideEvent({ tab: linkedTab, panel }));
            }
        }

    }

    render() {
        this.#shadowRoot.innerHTML = `
            <div part="tab">
                <slot name="tab"></slot>
            </div>
            <slot name="tab-panel"></slot>
        `;
    }

    private getTabs(options = { includeDisabled: false }) {
        const tabs = this.tabSlot.assignedElements({ flatten: true }) as MTab[];

        if (options.includeDisabled) {
            return tabs.filter(tab => tab.localName === 'm-tab');
        } else {
            return tabs.filter(tab => tab.localName === 'm-tab' && !tab.disabled);
        }
    }

    private getPanels() {
        const panels = this.panelSlot.assignedElements({ flatten: true }) as MTabPanel[];
        return panels.filter(panel => panel.localName === 'm-tab-panel');
    }
}

