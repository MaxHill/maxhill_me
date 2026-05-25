import { MElement, generateUUID } from "@maxhill/web-component-utils";
import { BindAttribute } from "@maxhill/web-component-utils";
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
 * A web component for declarative commands — focus, navigate, open dialogs/popovers, or custom actions — triggered via JavaScript or keyboard shortcuts.
 * 
 * @customElement
 * @tagname m-command
 * 
 * @slot - Default slot for label content (shown in command palette)
 * 
 * @attr {string} keys - Keyboard shortcut in vim notation (e.g. "<Space>o", "<C-b>x")
 * @attr {"navigate"|"show-modal"|"close"|"request-close"|"show-popover"|"hide-popover"|"toggle-popover"|"focus"|"custom"} command - The action type to perform
 * @attr {string} commandfor - Target element selector (URL for navigate, CSS selector for others)
 * @attr {boolean} preventdefault - Whether to call preventDefault on the keyboard event
 * 
 * @fires m-command-trigger - Fired when the command is triggered (detail: { command: CommandDefinition })
 * @fires m-command-register - Fired when the command registers its keyboard shortcut (detail: { command: CommandDefinition })
 * @fires m-command-unregister - Fired when the command unregisters its keyboard shortcut (detail: { command: CommandDefinition })
 */
const COMMAND_ACTIONS: Record<string, string> = {
    "show-modal": "showModal",
    "close": "close",
    "request-close": "close",
    "show-popover": "showPopover",
    "hide-popover": "hidePopover",
    "toggle-popover": "togglePopover"
};

export class MCommand extends MElement {
    static tagName = 'm-command';

    private unregister?: UnregisterCommandFn;

    private _customCommand?: (e: KeyboardEvent) => void;
    set customCommand(command: (e: KeyboardEvent) => void) {
        this._customCommand = command;
        this.command = "custom"
    }
    get customCommand(): ((e: KeyboardEvent) => void) | undefined {
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

        this.id = this.id || `command_${commandDefinition?.id || generateUUID()}`;
        if (commandDefinition) {
            this.keys = commandDefinition.keys;
            this.preventDefault = commandDefinition.preventDefault || false;
            this._customCommand = commandDefinition.customCommand;
            this.command = commandDefinition.command;
            this.commandfor = commandDefinition.commandfor;
        }

        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [baseStyleSheet];
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
        if (this.unregister) { this.unregister(); this.unregister = undefined; }
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
                return;
            }
            this.customCommand(e);
            return;
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

        const method = COMMAND_ACTIONS[this.command];
        if (method && typeof (target as any)[method] === 'function') {
            (target as any)[method]();
        } else if (method) {
            console.error(`Action ${this.id}'s target (${this.commandfor}) does not have a ${method} method`);
        }
    }

    private render() {
        this.shadowRoot!.innerHTML = ``;
    }
}

// Auto-define when using default import
MCommand.define();

export default MCommand;