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
export class MTabShowEvent extends CustomEvent<MTabChangeEventDetail> {
    constructor(detail: MTabChangeEventDetail) {
        super('m-tab-show', {
            detail,
            bubbles: true,
            composed: true
        });
    }
}

export class MTabHideEvent extends CustomEvent<MTabChangeEventDetail> {
    constructor(detail: MTabChangeEventDetail) {
        super('m-tab-hide', {
            detail,
            bubbles: true,
            composed: true
        });
    }
}

export class MTabList extends MElement {
    static observedAttributes = ['tab', 'label'];

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

        if (name === 'label') {
            this.setAttribute('aria-label', newValue as string ?? '');
        }

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
                    this.dispatchEvent(new MTabShowEvent({tab: linkedTab, panel}));
                }
            } else if (linkedTab && panel.visible) {
                panel.visible = false;
                this.dispatchEvent(new MTabHideEvent({tab: linkedTab, panel}));
            }
        }

    }

    render() {
        this.#shadowRoot.innerHTML = `
            <div part="tab">
                <slot name="tab"></slot>
            </div>
            <div part="panels">
                <slot name="tab-panel"></slot>
            </div>
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

    static define(tag = 'm-tab-list', registry = customElements) {
        return super.define(tag, registry) as typeof MTabList;
    }
}

