import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";
import { MCommandChangeEvent } from "./events";
import { keyboardManager, UnregisterCommandFn } from "../utils/keyboard-manager";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A webcomponent used to add commands like focus naivgate open or other custom ones that can be triggered using javascript or keyboard shortcuts
 * 
 * @customElement
 * @tagname m-command
 * 
 * @slot - Default slot for component content
 * 
 * @attr {string} example - An example property
 * 
 * @prop {string} example - An example property
 * 
 * @fires m-command-change - Fired when the example changes (detail: { example: string })
 */
export class MCommand extends MElement {
    static tagName = 'm-command';
    static observedAttributes = ['example'];

    private _shadowRoot: ShadowRoot;
    private unregister!: UnregisterCommandFn;

    @BindAttribute()
    example: string = '';

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open' });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();
        this.dispatchEvent(new MCommandChangeEvent({ example: this.example }));
        this.unregister = keyboardManager.register("<C-t>", this.handleChange);
        console.log("Connected");
    }
    disconnectedCallback() {
        this.unregister();
    }

    private handleChange = () => {
        console.log("ctrl+t pressed");
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <p>m-command</p>
        `;
    }
}

export default MCommand;
