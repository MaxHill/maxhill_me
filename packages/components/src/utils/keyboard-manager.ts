// keyboard-manager.js
class KeyboardManager extends EventTarget {
    pressed: Set<string> = new Set();
    static instance: KeyboardManager;
    private comboTimeout?: ReturnType<typeof setTimeout>;
    combo?: string;


    constructor() {
        console.log("Constructor")
        super();
        if (KeyboardManager.instance) return KeyboardManager.instance;
        KeyboardManager.instance = this;

        this.pressed = new Set();
        document.addEventListener('keydown', e => this._onKeyDown(e));
        document.addEventListener('keyup', e => this._onKeyUp(e));
    }


    _onKeyDown(e: KeyboardEvent) {
        if (this.comboTimeout) { clearTimeout(this.comboTimeout); }

        // Don't add multiple keypresses if key is held
        if (this.combo && this.combo.endsWith(e.key.toLowerCase())) { 
            this.comboTimeout = setTimeout(() => {
                this.combo = undefined;
            }, 1000);
            return 
        }

        if (!this.pressed.size && this.combo) { this.combo += " "; }
        if (this.pressed.size && this.combo) { this.combo += "+"; } 
        if (!this.pressed.size && !this.combo){ this.combo = ""; }


        this.combo += e.key.toLowerCase();
        this.pressed.add(e.key.toLowerCase());
        this.dispatchEvent(new CustomEvent('change', { detail: this.pressed }));
        throw new Error("TODO: rename space to be <space> ")
    }

    _onKeyUp(e: KeyboardEvent) {
        this.pressed.delete(e.key.toLowerCase());

        if (!this.pressed.size) {
            this.comboTimeout = setTimeout(() => {
                this.combo = undefined;
                this.dispatchEvent(new CustomEvent('change', { detail: this.pressed }));
            }, 1000);
        } else {
            this.dispatchEvent(new CustomEvent('change', { detail: this.pressed }));
        }

    }

    isPressed(key: string) {
        return this.pressed.has(key.toLowerCase());
    }

    comboMatch(combo: string) {
        if (!this.combo) {return false}
        return this.combo.endsWith(combo);
    }
}

export const keyboardManager = new KeyboardManager();
