import { MKeyboardMangerChangeEvent } from "./keyboard-manager-events";

/**
 * Trie data structure for commands
 */
export type Commands = {
    _handler?: (e: KeyboardEvent) => void
    preventDefault: boolean
    children?: Record<string, Commands>
}

export type UnregisterCommandFn = () => void;

// keyboard-manager.js
class KeyboardManager extends EventTarget {
    pressed: Set<string> = new Set();
    static instance: KeyboardManager;
    private comboTimeout?: ReturnType<typeof setTimeout>;
    combo?: string;

    commands: Commands = { children: {}, preventDefault: false };
    currentSequence: string[] = [];
    comboTimeoutDuration = 1000;

    constructor() {
        super();
        if (KeyboardManager.instance) return KeyboardManager.instance;
        KeyboardManager.instance = this;

        this.pressed = new Set();
        document.addEventListener('keydown', e => this.onKeyDown(e));
    }

    register(command: string, handler: (e: KeyboardEvent) => void, preventDefault = false) {
        const keys = this.parseCommand(command);

        const leafNode = keys.reduce((node, key) => {
            node.children = node.children || {};
            node.children[key] = node.children[key] || { preventDefault: false };
            node.children[key].preventDefault = node.children[key].preventDefault || preventDefault;
            return node.children[key];
        }, this.commands);

        if (leafNode._handler) {
            throw new Error(
                `[KeyboardManager] Keymap conflict: Command "${command}" is already registered. ` +
                `Please unregister the existing handler before registering a new one.`
            );
        }

        leafNode._handler = handler;

        document.dispatchEvent(new MKeyboardMangerChangeEvent({
            commands: this.commands
        }));
        return () => this.unregister(command);
    }

    private unregister(command: string) {
        const keys = this.parseCommand(command);
        const path = [];
        let node = this.commands;

        for (let key of keys) {
            if (!node.children) { 
                return false;
            }
            if (!node.children[key]) { 
                return false; 
            }

            path.push({ parent: node, key: key });
            node = node.children[key];
        }

        delete node._handler;

        // Cleanup backwards
        for (let i = path.length - 1; i >= 0; i--) {
            const { parent, key } = path[i];
            const currentNode = parent?.children?.[key];

            const hasHandler = !!currentNode?._handler
            const hasChildren = !!currentNode?.children && !!Object.keys(currentNode.children).length

            if (!hasHandler && !hasChildren && parent.children) {
                delete parent.children[key];
            } else {
                break;
            }
        }

        document.dispatchEvent(new MKeyboardMangerChangeEvent({
            commands: this.commands
        }));
    }

    clear() {
        this.commands = { children: {}, preventDefault: false };
        this.currentSequence = [];
        this.pressed.clear();
        clearTimeout(this.comboTimeout);
    }

    handleKey(key: string, e: KeyboardEvent) {
        this.currentSequence.push(key);

        // Navigate the tree
        let node = this.commands;
        for (let k of this.currentSequence) {
            if (!node.children || !node.children[k]) {
                // Invalid sequence - reset
                this.reset();
                return;
            }
            node = node.children[k];
            if(node.preventDefault) {e.preventDefault()}
        }

        const handler = node._handler;
        const hasChildren = !!node.children && !!Object.keys(node.children).length;

        if (handler && !hasChildren) {
            this.execute(handler, e)
        } else if (handler && hasChildren) {
            this.setTimeout(handler, e)
        } else if (!handler && hasChildren) {
            this.setTimeout(() => {
                this.reset(); // Timeout - abandon partial sequence
            }, e);
        }

    }

    private reset() {
        this.currentSequence = [];
        clearTimeout(this.comboTimeout);
    }

    // TODO: send current sequence as argument to handler
    private execute(handler: (e: KeyboardEvent) => void, e: KeyboardEvent) {
        clearTimeout(this.comboTimeout);
        handler(e);
        this.reset();
    }

    private setTimeout(handler: (e: KeyboardEvent) => void, e: KeyboardEvent) {
        clearTimeout(this.comboTimeout);
        this.comboTimeout = setTimeout(() => handler(e), this.comboTimeoutDuration);
    }

    private onKeyDown(e: KeyboardEvent) {
        const key = e.key.toLowerCase()

        if (key === "control") { return }
        if (key === "alt") { return }
        if (key === "meta") { return }
        if (key === "shift") { return }
        this.handleKey(this.parseKey(e), e);
    }

    private parseCommand(command: string): string[] {
        return command
            .split('<')
            .flatMap((segment, i) => {
                if (i === 0) {
                    // First segment - no '<' prefix, just individual chars
                    return Array.from(segment);
                }

                // Subsequent segments: "CR>bc" becomes ["<CR>", "b", "c"]
                const parts = segment.split('>');
                if (parts.length < 2) {
                    throw new Error(`Unclosed bracket in: ${command}`);
                }

                return [
                    `<${parts[0]}>`,      // The special key: <CR>
                    ...Array.from(parts[1]) // Individual chars after: b, c
                ];
            });
    }

    private parseKey(event: KeyboardEvent) {
        const parts = [];

        // Add modifiers (order: Ctrl, Alt, Shift)
        if (event.ctrlKey || event.metaKey) {
            parts.push('C');
        }
        if (event.altKey) {
            parts.push('M');
        }
        if (event.shiftKey) {
            parts.push('S');
        }

        // Map special keys to notation
        const specialKeys: Record<string, string> = {
            ' ': 'Space',
            'Enter': 'CR',
            'Escape': 'Esc',
            'Backspace': 'BS',
            'Delete': 'Del',
            'Tab': 'Tab',
            'Insert': 'Insert',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown',
            'ArrowUp': 'Up',
            'ArrowDown': 'Down',
            'ArrowLeft': 'Left',
            'ArrowRight': 'Right',
            '<': 'Lt',
            '>': 'Gt',
            '|': 'Bar',
            '\\': 'Bslash',
        };

        // Handle F-keys (F1-F12)
        if (event.key.match(/^F\d+$/)) {
            specialKeys[event.key] = event.key;
        }

        // Get the base key
        let key = event.key;

        // Check if it's a special key

        if (specialKeys[key]) {
            key = specialKeys[key];
            // If this special key is a shifted character (like < > | from Shift+key),
            // remove Shift from modifiers since it's already part of the character
            if (event.shiftKey && ['Lt', 'Gt', 'Bar'].includes(key)) {
                const shiftIndex = parts.indexOf('S');
                if (shiftIndex > -1) {
                    parts.splice(shiftIndex, 1);
                }
            }
        }
        // For regular characters
        else if (key.length === 1) {
            // If Shift is pressed with a letter, it's already uppercase in event.key
            // So we can use it directly
            // But we should remove Shift from modifiers for printable chars
            // since Shift+a is just "A", not "<S-a>"
            if (event.shiftKey && key.match(/[A-Z!@#$%^&*()_+{}|:"<>?]/)) {
                // Remove 'S' from parts for printable shifted characters
                const shiftIndex = parts.indexOf('S');
                if (shiftIndex > -1) {
                    parts.splice(shiftIndex, 1);
                }
            }
        }
        // For keys we don't recognize, use event.code as fallback
        else if (event.code) {
            key = event.code;
        }

        // Build the final notation
        if (parts.length === 0) {
            // No modifiers - just return the key
            return key.length === 1 ? key : `<${key}>`;
        } else {
            // Has modifiers - format as <Mod-key>
            return `<${parts.join('-')}-${key}>`;
        }
    }
}

export const keyboardManager = new KeyboardManager();
