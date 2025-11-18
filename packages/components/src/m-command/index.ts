import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";
import { MCommandRegisterEvent, MCommandUnRegisterEvent, MCommandTriggerEvent } from "./events";
import { keyboardManager, UnregisterCommandFn } from "../utils/keyboard-manager";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

type CommandTypes =
    "navigate" |
    "show-modal" |
    "close" |
    "request-close" |
    "show-popover" |
    "hide-popover" |
    "toggle-popover" |
    "focus" |
    "custom"

export type CommandDefinition = {
    command: CommandTypes,
    preventDefault?: boolean,
    id?: string,
    commandfor?: string,
    keys?: string,
    customCommand?: (e: KeyboardEvent) => void,
}

type CreateCommandDefinition = {
    command?: CommandTypes,
    preventDefault?: boolean,
    id?: string,
    commandfor?: string,
    keys?: string,
    customCommand?: (e: KeyboardEvent) => void,
}

export function registerCommand(createCommandDefinition: CreateCommandDefinition, target = "body") {
    const commandDefinition: CommandDefinition = {
        command: createCommandDefinition.command || "custom",
        ...createCommandDefinition
    }
    const targetElement = document.querySelector(target);
    if (!targetElement) {
        throw new Error(`Action ${commandDefinition.id} registration could not find target ${target}`);
    }

    const commandElement = new MCommand(commandDefinition);

    targetElement.appendChild(commandElement)

    return () => {
        targetElement.removeChild(commandElement);
    }
}

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
    static observedAttributes = ['command', 'commandfor', 'keys'];

    private _shadowRoot: ShadowRoot;
    private unregister?: UnregisterCommandFn;

    private _customCommand?: (e: KeyboardEvent) => void;
    set customCommand(command: (e: KeyboardEvent) => void) {
        this._customCommand = command;
        this.command = "custom"
    }
    get customCommandse() {
        return this._customCommand;
    }

    @BindAttribute()
    keys?: string;

    @BindAttribute()
    command: CommandTypes = "custom"

    @BindAttribute()
    commandfor?: string;

    @BindAttribute()
    preventDefault: boolean = false;

    constructor(commandDefinition?: CommandDefinition) {
        super();

        this.id = this.id || `command_${commandDefinition?.id || crypto.randomUUID()}`;
        if (commandDefinition) {
            this.keys = commandDefinition.keys;
            this.preventDefault = commandDefinition.preventDefault || false;
            this._customCommand = commandDefinition.customCommand;
            this.command = commandDefinition.command;
            this.commandfor = commandDefinition.commandfor;
        }

        this._shadowRoot = this.attachShadow({ mode: 'open' });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        if (this.unregister) {
            return;
        }
        
        this.render();
        if (this.keys) {
            try {
                this.unregister = keyboardManager.register(this.keys, this.handleChange, this.preventDefault);
                this.dispatchEvent(new MCommandRegisterEvent({
                    command: {
                        command: this.command,
                        id: this.id,
                        commandfor: this.commandfor,
                        keys: this.keys,
                        customCommand: this.customCommand
                    }
                }))
            } catch (error) {
                console.error(`Failed to register keyboard shortcut for command "${this.id}":`, error);
            }
        }
    }
    disconnectedCallback() {
        if (this.unregister) { this.unregister(); }
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown): void {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (name === "keys" && newValue) {
            if (this.unregister) {
                this.unregister()
                this.dispatchEvent(new MCommandUnRegisterEvent({
                    command: {
                        command: this.command,
                        id: this.id,
                        commandfor: this.commandfor,
                        keys: this.keys,
                        customCommand: this.customCommand
                    }
                }))
            }

            try {
                this.unregister = keyboardManager.register((newValue as string), this.handleChange, this.preventDefault);
                this.dispatchEvent(new MCommandRegisterEvent({
                    command: {
                        command: this.command,
                        id: this.id,
                        commandfor: this.commandfor,
                        keys: this.keys,
                        customCommand: this.customCommand
                    }
                }))
            } catch (error) {
                console.error(`Failed to register keyboard shortcut for command "${this.id}":`, error);
            }
        }
    }

    private handleChange = (e: KeyboardEvent) => {
        this.dispatchEvent(new MCommandTriggerEvent({
                    command: {
                        command: this.command,
                        id: this.id,
                        commandfor: this.commandfor,
                        keys: this.keys,
                        customCommand: this.customCommand
                    }
        }));

        if (this.command === "custom") {
            if (!this.customCommand) {
                console.error(`Action ${this.id} does not have a custom command registered: ${this.customCommand}`);
            }
            this.customCommand(e);
        }

        if (this.command === "navigate") {
            if (!this.commandfor) {
                console.error(`Action ${this.id} could not find target url: ${this.commandfor}`);
                return;
            }
            window.location.href = this.commandfor;
            return;
        }

        if (!this.commandfor) {
            console.error(`Action ${this.id} has no commandfor set`);
            return;
        }

        const target = document.querySelector(this.commandfor);
        if (!target) {
            console.error(`Action ${this.id} could not find target element: ${this.commandfor}`);
            return;
        }

        if (this.command === "focus") {
            if (typeof (target as HTMLElement).focus === 'function') {
                (target as HTMLElement).focus();
            } else {
                console.error(`Action ${this.id}'s target (${this.commandfor}) does not have a focus method`);
            }
            return;
        }

        const actions: Record<string, keyof HTMLDialogElement | keyof HTMLElement> = {
            "show-modal": "showModal",
            "close": "close",
            "request-close": "close",
            "show-popover": "showPopover",
            "hide-popover": "hidePopover",
            "toggle-popover": "togglePopover"
        };

        const method = actions[this.command];
        if (method && typeof (target as any)[method] === 'function') {
            (target as any)[method]();
        } else if (method) {
            console.error(`Action ${this.id}'s target (${this.commandfor}) does not have a ${method} method`);
        }
    }

    private render() {
        this._shadowRoot.innerHTML = ``;
    }
}

export default MCommand;
