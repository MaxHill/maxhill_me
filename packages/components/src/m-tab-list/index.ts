import { MTab } from "../m-tab";
import { MTabPanel } from "../m-tab-panel";
import { BindAttribute } from "../utils/reflect-attribute";
import { MElement } from "../utils/m-element";
import { query } from "../utils/query";
import { MTabShowEvent, MTabHideEvent } from "./events";
import styles from "./index.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A tab list container that manages tabs and their associated panels with full keyboard navigation.
 * Supports horizontal (arrow left/right, h/l) and vertical (arrow up/down, j/k) navigation depending on position.
 * Home/End keys work in both orientations.
 * 
 * @customElement
 * @tagname m-tab-list
 * 
 * @slot tab - Slot for m-tab elements (auto-assigned)
 * @slot tab-panel - Slot for m-tab-panel elements (auto-assigned)
 * 
 * @attr {string} tab - The currently active tab panel name
 * @attr {string} label - Accessible label for the tab list (sets aria-label)
 * @attr {"top"|"bottom"|"start"|"end"} position - Tab list orientation: top/bottom for horizontal, start/end for vertical
 * 
 * @prop {string} tab - The currently active tab panel name
 * @prop {string} label - Accessible label for the tab list
 * @prop {"top"|"bottom"|"start"|"end"} position - Tab list orientation
 * 
 * @csspart tab - Container wrapping the tab buttons
 * 
 * @event m-tab-show - Fired when a tab panel becomes visible. Detail: MTabChangeEventDetail { tab: MTab, panel: MTabPanel }
 * @event m-tab-hide - Fired when a tab panel becomes hidden. Detail: MTabChangeEventDetail { tab: MTab, panel: MTabPanel }
 */
export class MTabList extends MElement {
    static tagName = 'm-tab-list';
    static observedAttributes = ['tab', 'label', "position"];

    @BindAttribute({ attribute: "aria-label" })
    label: string = '';

    @BindAttribute()
    tab: string = '';

    @BindAttribute()
    position: "start"|"end"|"top"|"bottom" = 'top';

    #shadowRoot: ShadowRoot;
    
    @query("slot[name='tab']")
    private tabSlot!: HTMLSlotElement;

    @query("slot[name='tab-panel']")
    private panelSlot!: HTMLSlotElement;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.setAttribute('role', 'tablist');
        this.updateOrientation();
        this.render();

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
        if (name === "position") {
            this.updateOrientation();
        }
    }

    private updateOrientation() {
        const isVertical = this.position === 'start' || this.position === 'end';
        this.setAttribute('aria-orientation', isVertical ? 'vertical' : 'horizontal');
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

        const isVertical = this.position === 'start' || this.position === 'end';
        let targetTab: MTab | undefined;

        if (isVertical) {
            if (event.key === 'ArrowUp' || event.key === 'k') {
                targetTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
            } else if (event.key === 'ArrowDown' || event.key === 'j') {
                targetTab = tabs[(currentIndex + 1) % tabs.length];
            }
        } else {
            if (event.key === 'ArrowLeft' || event.key === 'h') {
                targetTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
            } else if (event.key === 'ArrowRight' || event.key === 'l') {
                targetTab = tabs[(currentIndex + 1) % tabs.length];
            }
        }

        if (event.key === 'Home') {
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
        if (!this.tabSlot) return [];
        const tabs = this.tabSlot.assignedElements({ flatten: true }) as MTab[];

        if (options.includeDisabled) {
            return tabs.filter(tab => tab.localName === 'm-tab');
        } else {
            return tabs.filter(tab => tab.localName === 'm-tab' && !tab.disabled);
        }
    }

    private getPanels() {
        if (!this.panelSlot) return [];
        const panels = this.panelSlot.assignedElements({ flatten: true }) as MTabPanel[];
        return panels.filter(panel => panel.localName === 'm-tab-panel');
    }
}

export default MTabList;
