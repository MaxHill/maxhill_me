import { MTab } from "./tab";
import { MTabPanel } from "./tab-panel";
import { BindAttribute, handleAttributeChange } from "../utils/reflect-attribute";
import styles from "./tab-list.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MTabList extends HTMLElement {
    static observedAttributes = ['tab', 'label'];
    
    #shadowRoot: ShadowRoot;
    private tabSlot!: HTMLSlotElement;
    private panelSlot!: HTMLSlotElement;

    @BindAttribute()
    tab: string = '';

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
        if (oldValue === newValue) return;
        handleAttributeChange(this, name, newValue as string | null);
        
        
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

        switch (event.key) {
            case 'ArrowLeft':
            case 'h':
                targetTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
                break;
            case 'ArrowRight':
            case 'l':
                targetTab = tabs[(currentIndex + 1) % tabs.length];
                break;
            case 'Home':
                targetTab = tabs[0];
                break;
            case 'End':
                targetTab = tabs[tabs.length - 1];
                break;
            case ' ':
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
                panel.visible = true;
            } else if (linkedTab && panel.visible) {
                panel.visible = false;
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
        if (!registry.get(tag)) {
            registry.define(tag, this);
        }
        return this;
    }
}

