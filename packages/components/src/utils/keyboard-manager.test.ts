import { assert, beforeEach, describe, it } from "vitest";
import { keyboardManager } from "./keyboard-manager";

describe("keyboard-manager", () => {
    beforeEach(() => {
        keyboardManager.clear()
    })

    it("parsekey", () => {

        const mockEvent = (key: string, code: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
            key,
            code,
            ctrlKey: modifiers.ctrl || false,
            altKey: modifiers.alt || false,
            shiftKey: modifiers.shift || false,
            metaKey: modifiers.meta || false,
        } as KeyboardEvent);

        const tests = [
            // Regular keys
            [mockEvent('a', 'KeyA'), 'a'],
            [mockEvent('A', 'KeyA', { shift: true }), 'A'],
            [mockEvent('1', 'Digit1'), '1'],
            [mockEvent('!', 'Digit1', { shift: true }), '!'],

            // Special keys
            [mockEvent(' ', 'Space'), '<Space>'],
            [mockEvent('Enter', 'Enter'), '<CR>'],
            [mockEvent('Escape', 'Escape'), '<Esc>'],
            [mockEvent('Tab', 'Tab'), '<Tab>'],
            [mockEvent('Backspace', 'Backspace'), '<BS>'],

            // Arrow keys
            [mockEvent('ArrowUp', 'ArrowUp'), '<Up>'],
            [mockEvent('ArrowDown', 'ArrowDown'), '<Down>'],

            // Function keys
            [mockEvent('F5', 'F5'), '<F5>'],

            // Angle brackets and special chars
            [mockEvent('<', 'Comma', { shift: true }), '<Lt>'],
            [mockEvent('>', 'Period', { shift: true }), '<Gt>'],
            [mockEvent('|', 'Backslash', { shift: true }), '<Bar>'],
            [mockEvent('\\', 'Backslash'), '<Bslash>'],

            // With Ctrl
            [mockEvent('s', 'KeyS', { ctrl: true }), '<C-s>'],
            [mockEvent('a', 'KeyA', { ctrl: true }), '<C-a>'],
            [mockEvent(' ', 'Space', { ctrl: true }), '<C-Space>'],
            [mockEvent('Enter', 'Enter', { ctrl: true }), '<C-CR>'],

            // With Alt
            [mockEvent('x', 'KeyX', { alt: true }), '<M-x>'],

            // Multiple modifiers
            [mockEvent('s', 'KeyS', { ctrl: true, shift: true }), '<C-S-s>'],
            [mockEvent('p', 'KeyP', { ctrl: true, alt: true }), '<C-M-p>'],
            [mockEvent('ArrowUp', 'ArrowUp', { ctrl: true }), '<C-Up>'],

        ];

        tests.forEach(([event, expected]) => {
            const result = (keyboardManager as any).parseKey(event);
            assert.equal(result, expected)
        });
    });

    describe("Trie creation", () => {
        it("single value", () => {
            const handler = () => console.log("a pressed")
            const unregister = keyboardManager.register("a", handler)

            assert.deepEqual(
                keyboardManager.commands,
                { children: { "a": { _handler: handler } } }
            )

            unregister();
        })

        it("double value", () => {
            const handler = () => console.log("a pressed")
            const unregister = keyboardManager.register("ab", handler)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            children: { "b": { _handler: handler } },
                        }
                    }
                }
            )

            unregister();
        })

        it("multiple entry points", () => {
            const handler = () => console.log("a pressed")
            const unregister1 = keyboardManager.register("ab", handler)
            const unregister2 = keyboardManager.register("bb", handler)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            children: { "b": { _handler: handler } },
                        },
                        "b": {
                            children: { "b": { _handler: handler } },
                        }
                    }
                }
            )

            unregister1();
            unregister2();
        })

        it("multiple endings", () => {
            const handler = () => console.log("a pressed")
            const unregister1 = keyboardManager.register("ab", handler)
            const unregister2 = keyboardManager.register("ac", handler)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            children: {
                                "b": { _handler: handler },
                                "c": { _handler: handler }
                            },
                        },
                    }
                }
            )

            unregister1();
            unregister2();
        })

        it("overlapping commands - prefix and extension", () => {
            const handler1 = () => console.log("a pressed")
            const handler2 = () => console.log("ab pressed")
            keyboardManager.register("a", handler1)
            keyboardManager.register("ab", handler2)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            _handler: handler1,
                            children: {
                                "b": { _handler: handler2 }
                            }
                        }
                    }
                }
            )
        })

        it("same command registered twice", () => {
            const handler1 = () => console.log("first")
            const handler2 = () => console.log("second")
            keyboardManager.register("a", handler1)
            keyboardManager.register("a", handler2)

            assert.deepEqual(
                keyboardManager.commands,
                { children: { "a": { _handler: handler2 } } }
            )
        })

        it("different handlers for different commands", () => {
            const handler1 = () => console.log("a pressed")
            const handler2 = () => console.log("b pressed")
            keyboardManager.register("a", handler1)
            keyboardManager.register("b", handler2)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": { _handler: handler1 },
                        "b": { _handler: handler2 }
                    }
                }
            )
        })

        it("with modifiers", () => {
            const handler = () => { };
            const unregister = keyboardManager.register("<C-a>", handler)

            assert.deepEqual(
                keyboardManager.commands,
                { children: { "<C-a>": { _handler: handler } } }
            )

            unregister();
        })

        it("complex command with special key in middle", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<CR>b", handler)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            children: {
                                "<CR>": {
                                    children: {
                                        "b": { _handler: handler }
                                    }
                                }
                            }
                        }
                    }
                }
            )

            unregister();
        })

        it("complex command with multiple special keys", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<CR>b<Esc>", handler)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            children: {
                                "<CR>": {
                                    children: {
                                        "b": {
                                            children: {
                                                "<Esc>": { _handler: handler }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            )

            unregister();
        })

        it("command starting with special key", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("<CR>abc", handler)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "<CR>": {
                            children: {
                                "a": {
                                    children: {
                                        "b": {
                                            children: {
                                                "c": { _handler: handler }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            )

            unregister();
        })

        it("command with multiple modifiers", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<C-S-x>b", handler)

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            children: {
                                "<C-S-x>": {
                                    children: {
                                        "b": { _handler: handler }
                                    }
                                }
                            }
                        }
                    }
                }
            )

            unregister();
        })
    })

    describe("unregister", () => {
        it("unregister simple command", () => {
            const handler = () => { }
            keyboardManager.register("a", handler)
            keyboardManager.register("a", handler)

            assert.deepEqual(
                keyboardManager.commands,
                { children: { "a": { _handler: handler } } }
            )

            const unregister = keyboardManager.register("a", handler);
            unregister();

            assert.deepEqual(
                keyboardManager.commands,
                { children: {} }
            )
        })

        it("unregister command with special key", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("<C-a>", handler)

            assert.deepEqual(
                keyboardManager.commands,
                { children: { "<C-a>": { _handler: handler } } }
            )

            unregister()

            assert.deepEqual(
                keyboardManager.commands,
                { children: {} }
            )
        })

        it("unregister complex command with special keys", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<CR>b", handler)

            assert.deepEqual(
                keyboardManager.commands.children?.["a"]?.children?.["<CR>"]?.children?.["b"],
                { _handler: handler }
            )

            unregister()

            assert.deepEqual(
                keyboardManager.commands,
                { children: {} }
            )
        })

        it("unregister preserves other branches", () => {
            const handler1 = () => { }
            const handler2 = () => { }
            const unregister1 = keyboardManager.register("a<CR>", handler1)
            const unregister2 = keyboardManager.register("a<Esc>", handler2)

            unregister1()

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            children: {
                                "<Esc>": { _handler: handler2 }
                            }
                        }
                    }
                }
            )
        })

        it("unregister preserves parent handlers", () => {
            const handler1 = () => { }
            const handler2 = () => { }
            const unregister1 = keyboardManager.register("a", handler1)
            const unregister2 = keyboardManager.register("a<CR>", handler2)

            unregister2()

            assert.deepEqual(
                keyboardManager.commands,
                {
                    children: {
                        "a": {
                            _handler: handler1,
                            children: {}
                        }
                    }
                }
            )
        })

        it("unregister non-existent command does nothing", () => {
            const handler = () => { }
            keyboardManager.register("a", handler)

            const commands = keyboardManager.commands;
            const unregister = keyboardManager.register("b", () => { })
            unregister()

            assert.deepEqual(
                keyboardManager.commands,
                commands
            )
        })
    })

    describe("parseCommand", () => {
        it("simple string - single character", () => {
            const result = (keyboardManager as any).parseCommand("a")
            assert.deepEqual(result, ["a"])
        })

        it("simple string - multiple characters", () => {
            const result = (keyboardManager as any).parseCommand("abc")
            assert.deepEqual(result, ["a", "b", "c"])
        })

        it("single special key", () => {
            const result = (keyboardManager as any).parseCommand("<CR>")
            assert.deepEqual(result, ["<CR>"])
        })

        it("special key with characters before", () => {
            const result = (keyboardManager as any).parseCommand("a<CR>")
            assert.deepEqual(result, ["a", "<CR>"])
        })

        it("special key with characters after", () => {
            const result = (keyboardManager as any).parseCommand("<CR>b")
            assert.deepEqual(result, ["<CR>", "b"])
        })

        it("special key in the middle", () => {
            const result = (keyboardManager as any).parseCommand("a<CR>b")
            assert.deepEqual(result, ["a", "<CR>", "b"])
        })

        it("multiple special keys", () => {
            const result = (keyboardManager as any).parseCommand("<C-a><C-b>")
            assert.deepEqual(result, ["<C-a>", "<C-b>"])
        })

        it("complex command with multiple special keys and characters", () => {
            const result = (keyboardManager as any).parseCommand("a<CR>b<Esc>c")
            assert.deepEqual(result, ["a", "<CR>", "b", "<Esc>", "c"])
        })

        it("empty string returns empty array", () => {
            const result = (keyboardManager as any).parseCommand("")
            assert.deepEqual(result, [])
        })

        it("throws error on unclosed bracket", () => {
            assert.throws(
                () => (keyboardManager as any).parseCommand("a<CR"),
                /Unclosed bracket/
            )
        })

        it("throws error on unclosed bracket at start", () => {
            assert.throws(
                () => (keyboardManager as any).parseCommand("<CR"),
                /Unclosed bracket/
            )
        })
    })

    describe("handleKey execution", () => {
        it("single character command executes immediately", () => {
            let executed = false
            const handler = () => { executed = true }

            keyboardManager.commands = {
                children: {
                    "a": { _handler: handler }
                }
            }

            keyboardManager.handleKey("a")

            assert.equal(executed, true)
            assert.deepEqual(keyboardManager.currentSequence, [])
        })

        it("multi-character sequence executes after completion", () => {
            let executed = false
            const handler = () => { executed = true }

            keyboardManager.commands = {
                children: {
                    "a": {
                        children: {
                            "b": {
                                children: {
                                    "c": { _handler: handler }
                                }
                            }
                        }
                    }
                }
            }

            keyboardManager.handleKey("a")
            assert.equal(executed, false)

            keyboardManager.handleKey("b")
            assert.equal(executed, false)

            keyboardManager.handleKey("c")
            assert.equal(executed, true)
        })

        it("partial sequence interrupted resets", () => {
            let executed = false
            const handler = () => { executed = true }

            keyboardManager.commands = {
                children: {
                    "a": {
                        children: {
                            "b": { _handler: handler }
                        }
                    }
                }
            }

            keyboardManager.handleKey("a")
            assert.deepEqual(keyboardManager.currentSequence, ["a"])

            keyboardManager.handleKey("x")
            assert.equal(executed, false)
            assert.deepEqual(keyboardManager.currentSequence, [])
        })

        it("branch node (has children) sets timeout", (context) => {
            return new Promise((resolve) => {
                keyboardManager.comboTimeoutDuration = 50
                let executed = false
                const handler = () => {
                    executed = true
                    resolve()
                }

                keyboardManager.commands = {
                    children: {
                        "a": {
                            _handler: handler,
                            children: {
                                "b": { _handler: () => { } }
                            }
                        }
                    }
                }

                keyboardManager.handleKey("a")

                assert.equal(executed, false)

                setTimeout(() => {
                    assert.equal(executed, true)
                }, 100)
            })
        })

        it("sequential commands execute independently", () => {
            let count = 0
            const handler = () => { count++ }

            keyboardManager.commands = {
                children: {
                    "a": { _handler: handler },
                    "b": { _handler: handler }
                }
            }

            keyboardManager.handleKey("a")
            assert.equal(count, 1)

            keyboardManager.handleKey("b")
            assert.equal(count, 2)
        })

        it("invalid first character resets", () => {
            keyboardManager.commands = {
                children: {
                    "a": { _handler: () => { } }
                }
            }

            keyboardManager.handleKey("x")

            assert.deepEqual(keyboardManager.currentSequence, [])
        })

        it("empty command tree with input resets", () => {
            keyboardManager.commands = { children: {} }

            keyboardManager.handleKey("a")

            assert.deepEqual(keyboardManager.currentSequence, [])
        })

        it("typing same command twice executes twice", () => {
            let count = 0
            const handler = () => { count++ }

            keyboardManager.commands = {
                children: {
                    "a": { _handler: handler }
                }
            }

            keyboardManager.handleKey("a")
            assert.equal(count, 1)

            keyboardManager.handleKey("a")
            assert.equal(count, 2)
        })

        it("partial sequence timeout resets", (context) => {
            return new Promise<void>((resolve) => {
                keyboardManager.comboTimeoutDuration = 50

                keyboardManager.commands = {
                    children: {
                        "a": {
                            children: {
                                "b": { _handler: () => { } }
                            }
                        }
                    }
                }

                keyboardManager.handleKey("a")
                assert.deepEqual(keyboardManager.currentSequence, ["a"])

                setTimeout(() => {
                    assert.deepEqual(keyboardManager.currentSequence, [])
                    resolve()
                }, 100)
            })
        })
    })

    describe("Integration: onKeyDown → parseKey → handleKey flow", () => {
        const mockEvent = (key: string, code: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
            key,
            code,
            ctrlKey: modifiers.ctrl || false,
            altKey: modifiers.alt || false,
            shiftKey: modifiers.shift || false,
            metaKey: modifiers.meta || false,
        } as KeyboardEvent);

        it("simple key press executes handler", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("a", handler)

            const event = mockEvent('a', 'KeyA');
            (keyboardManager as any).onKeyDown(event)

            assert.equal(executed, true)
        })

        it("key sequence with Enter executes handler", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("a<CR>", handler)

            const event1 = mockEvent('a', 'KeyA');
            (keyboardManager as any).onKeyDown(event1)
            assert.equal(executed, false)

            const event2 = mockEvent('Enter', 'Enter');
            (keyboardManager as any).onKeyDown(event2)
            assert.equal(executed, true)
        })

        it("Ctrl+s shortcut executes handler", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("<C-s>", handler)

            const event = mockEvent('s', 'KeyS', { ctrl: true });
            (keyboardManager as any).onKeyDown(event)

            assert.equal(executed, true)
        })

        it("complex sequence with modifiers and special keys", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("g<C-a><CR>", handler)

            const event1 = mockEvent('g', 'KeyG');
            (keyboardManager as any).onKeyDown(event1)
            assert.equal(executed, false)

            const event2 = mockEvent('a', 'KeyA', { ctrl: true });
            (keyboardManager as any).onKeyDown(event2)
            assert.equal(executed, false)

            const event3 = mockEvent('Enter', 'Enter');
            (keyboardManager as any).onKeyDown(event3)
            assert.equal(executed, true)
        })

        it("Control key press is ignored", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("a", handler)

            const event = mockEvent('Control', 'ControlLeft', { ctrl: true });
            (keyboardManager as any).onKeyDown(event)

            assert.equal(executed, false)
            assert.deepEqual(keyboardManager.currentSequence, [])
        })

        it("wrong sequence resets and doesn't execute", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("abc", handler)

            const event1 = mockEvent('a', 'KeyA');
            (keyboardManager as any).onKeyDown(event1)
            assert.deepEqual(keyboardManager.currentSequence, ["a"])

            const event2 = mockEvent('x', 'KeyX');
            (keyboardManager as any).onKeyDown(event2)
            assert.deepEqual(keyboardManager.currentSequence, [])
            assert.equal(executed, false)
        })

        it("Shift+A produces uppercase A", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("A", handler)

            const event = mockEvent('A', 'KeyA', { shift: true });
            (keyboardManager as any).onKeyDown(event)

            assert.equal(executed, true)
        })

        it("special characters like < > are parsed correctly", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("<Lt>", handler)

            const event = mockEvent('<', 'Comma', { shift: true });
            (keyboardManager as any).onKeyDown(event)

            assert.equal(executed, true)
        })
    })
})
