import { expect } from "@esm-bundle/chai";

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
            expect(result).to.equal(expected)
        });
    });

    describe("Trie creation", () => {
        it("single value", () => {
            const handler = () => console.log("a pressed")
            const unregister = keyboardManager.register("a", handler)

            expect(keyboardManager.commands).to.deep.equal(
                { children: { "a": { _handler: handler, preventDefault: false } }, preventDefault: false }
            )

            unregister();
        })

        it("double value", () => {
            const handler = () => console.log("a pressed")
            const unregister = keyboardManager.register("ab", handler)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            children: { "b": { _handler: handler, preventDefault: false } },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )

            unregister();
        })

        it("multiple entry points", () => {
            const handler = () => console.log("a pressed")
            const unregister1 = keyboardManager.register("ab", handler)
            const unregister2 = keyboardManager.register("bb", handler)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            children: { "b": { _handler: handler, preventDefault: false } },
                            preventDefault: false
                        },
                        "b": {
                            children: { "b": { _handler: handler, preventDefault: false } },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )

            unregister1();
            unregister2();
        })

        it("multiple endings", () => {
            const handler = () => console.log("a pressed")
            const unregister1 = keyboardManager.register("ab", handler)
            const unregister2 = keyboardManager.register("ac", handler)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            children: {
                                "b": { _handler: handler, preventDefault: false },
                                "c": { _handler: handler, preventDefault: false }
                            },
                            preventDefault: false
                        },
                    },
                    preventDefault: false
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

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            _handler: handler1,
                            children: {
                                "b": { _handler: handler2, preventDefault: false }
                            },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )
        })

        it("same command registered twice throws error", () => {
            const handler1 = () => console.log("first")
            const handler2 = () => console.log("second")
            keyboardManager.register("a", handler1)

            expect(() => keyboardManager.register("a", handler2)).to.throw(
                /Keymap conflict/
            )

            expect(keyboardManager.commands).to.deep.equal(
                { children: { "a": { _handler: handler1, preventDefault: false } }, preventDefault: false }
            )
        })

        it("different handlers for different commands", () => {
            const handler1 = () => console.log("a pressed")
            const handler2 = () => console.log("b pressed")
            keyboardManager.register("a", handler1)
            keyboardManager.register("b", handler2)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": { _handler: handler1, preventDefault: false },
                        "b": { _handler: handler2, preventDefault: false }
                    },
                    preventDefault: false
                }
            )
        })

        it("with modifiers", () => {
            const handler = () => { };
            const unregister = keyboardManager.register("<C-a>", handler)

            expect(keyboardManager.commands).to.deep.equal(
                { children: { "<C-a>": { _handler: handler, preventDefault: false } }, preventDefault: false }
            )

            unregister();
        })

        it("complex command with special key in middle", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<CR>b", handler)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            children: {
                                "<CR>": {
                                    children: {
                                        "b": { _handler: handler, preventDefault: false }
                                    },
                                    preventDefault: false
                                }
                            },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )

            unregister();
        })

        it("complex command with multiple special keys", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<CR>b<Esc>", handler)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            children: {
                                "<CR>": {
                                    children: {
                                        "b": {
                                            children: {
                                                "<Esc>": { _handler: handler, preventDefault: false }
                                            },
                                            preventDefault: false
                                        }
                                    },
                                    preventDefault: false
                                }
                            },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )

            unregister();
        })

        it("command starting with special key", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("<CR>abc", handler)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "<CR>": {
                            children: {
                                "a": {
                                    children: {
                                        "b": {
                                            children: {
                                                "c": { _handler: handler, preventDefault: false }
                                            },
                                            preventDefault: false
                                        }
                                    },
                                    preventDefault: false
                                }
                            },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )

            unregister();
        })

        it("command with multiple modifiers", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<C-S-x>b", handler)

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            children: {
                                "<C-S-x>": {
                                    children: {
                                        "b": { _handler: handler, preventDefault: false }
                                    },
                                    preventDefault: false
                                }
                            },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )

            unregister();
        })
    })

    describe("unregister", () => {
        it("unregister simple command", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a", handler);

            expect(keyboardManager.commands).to.deep.equal(
                { children: { "a": { _handler: handler, preventDefault: false } }, preventDefault: false }
            )

            unregister();

            expect(keyboardManager.commands).to.deep.equal(
                { children: {}, preventDefault: false }
            )
        })

        it("unregister command with special key", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("<C-a>", handler)

            expect(keyboardManager.commands).to.deep.equal(
                { children: { "<C-a>": { _handler: handler, preventDefault: false } }, preventDefault: false }
            )

            unregister()

            expect(keyboardManager.commands).to.deep.equal(
                { children: {}, preventDefault: false }
            )
        })

        it("unregister complex command with special keys", () => {
            const handler = () => { }
            const unregister = keyboardManager.register("a<CR>b", handler)

            expect(
                keyboardManager.commands.children?.["a"]?.children?.["<CR>"]?.children?.["b"]
            ).to.deep.equal(
                { _handler: handler, preventDefault: false }
            )

            unregister()

            expect(keyboardManager.commands).to.deep.equal(
                { children: {}, preventDefault: false }
            )

            unregister()

            expect(keyboardManager.commands).to.deep.equal(
                { children: {}, preventDefault: false }
            )
        })

        it("unregister preserves other branches", () => {
            const handler1 = () => { }
            const handler2 = () => { }
            const unregister1 = keyboardManager.register("a<CR>", handler1)
            const unregister2 = keyboardManager.register("a<Esc>", handler2)

            unregister1()

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            children: {
                                "<Esc>": { _handler: handler2, preventDefault: false }
                            },
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )
        })

        it("unregister preserves parent handlers", () => {
            const handler1 = () => { }
            const handler2 = () => { }
            const unregister1 = keyboardManager.register("a", handler1)
            const unregister2 = keyboardManager.register("a<CR>", handler2)

            unregister2()

            expect(keyboardManager.commands).to.deep.equal(
                {
                    children: {
                        "a": {
                            _handler: handler1,
                            children: {},
                            preventDefault: false
                        }
                    },
                    preventDefault: false
                }
            )
        })

        it("unregister non-existent command does nothing", () => {
            const handler = () => { }
            keyboardManager.register("a", handler)

            const commands = keyboardManager.commands;
            const unregister = keyboardManager.register("b", () => { })
            unregister()

            expect(keyboardManager.commands).to.deep.equal(
                commands
            )
        })
    })

    describe("parseCommand", () => {
        it("simple string - single character", () => {
            const result = (keyboardManager as any).parseCommand("a")
            expect(result).to.deep.equal(["a"])
        })

        it("simple string - multiple characters", () => {
            const result = (keyboardManager as any).parseCommand("abc")
            expect(result).to.deep.equal(["a", "b", "c"])
        })

        it("single special key", () => {
            const result = (keyboardManager as any).parseCommand("<CR>")
            expect(result).to.deep.equal(["<CR>"])
        })

        it("special key with characters before", () => {
            const result = (keyboardManager as any).parseCommand("a<CR>")
            expect(result).to.deep.equal(["a", "<CR>"])
        })

        it("special key with characters after", () => {
            const result = (keyboardManager as any).parseCommand("<CR>b")
            expect(result).to.deep.equal(["<CR>", "b"])
        })

        it("special key in the middle", () => {
            const result = (keyboardManager as any).parseCommand("a<CR>b")
            expect(result).to.deep.equal(["a", "<CR>", "b"])
        })

        it("multiple special keys", () => {
            const result = (keyboardManager as any).parseCommand("<C-a><C-b>")
            expect(result).to.deep.equal(["<C-a>", "<C-b>"])
        })

        it("complex command with multiple special keys and characters", () => {
            const result = (keyboardManager as any).parseCommand("a<CR>b<Esc>c")
            expect(result).to.deep.equal(["a", "<CR>", "b", "<Esc>", "c"])
        })

        it("empty string returns empty array", () => {
            const result = (keyboardManager as any).parseCommand("")
            expect(result).to.deep.equal([])
        })

        it("throws error on unclosed bracket", () => {
            expect(
                () => (keyboardManager as any).parseCommand("a<CR")
            ).to.throw(
                /Unclosed bracket/
            )
        })

        it("throws error on unclosed bracket at start", () => {
            expect(
                () => (keyboardManager as any).parseCommand("<CR")
            ).to.throw(
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

            expect(executed).to.equal(true)
            expect(keyboardManager.currentSequence).to.deep.equal([])
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
            expect(executed).to.equal(false)

            keyboardManager.handleKey("b")
            expect(executed).to.equal(false)

            keyboardManager.handleKey("c")
            expect(executed).to.equal(true)
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
            expect(keyboardManager.currentSequence).to.deep.equal(["a"])

            keyboardManager.handleKey("x")
            expect(executed).to.equal(false)
            expect(keyboardManager.currentSequence).to.deep.equal([])
        })

        it("branch node (has children) sets timeout", () => {
            return new Promise((resolve) => {
                keyboardManager.comboTimeoutDuration = 50
                let executed = false
                const handler = () => {
                    executed = true
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

                expect(executed).to.equal(false)

                setTimeout(() => {
                    expect(executed).to.equal(true)
                    resolve()
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
            expect(count).to.equal(1)

            keyboardManager.handleKey("b")
            expect(count).to.equal(2)
        })

        it("invalid first character resets", () => {
            keyboardManager.commands = {
                children: {
                    "a": { _handler: () => { } }
                }
            }

            keyboardManager.handleKey("x")

            expect(keyboardManager.currentSequence).to.deep.equal([])
        })

        it("empty command tree with input resets", () => {
            keyboardManager.commands = { children: {} }

            keyboardManager.handleKey("a")

            expect(keyboardManager.currentSequence).to.deep.equal([])
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
            expect(count).to.equal(1)

            keyboardManager.handleKey("a")
            expect(count).to.equal(2)
        })

        it("partial sequence timeout resets", () => {
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
                expect(keyboardManager.currentSequence).to.deep.equal(["a"])

                setTimeout(() => {
                    expect(keyboardManager.currentSequence).to.deep.equal([])
                    resolve()
                }, 100)
            })
        })
    })

    describe("preventDefault behavior", () => {
        const mockEvent = (key: string, code: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => {
            const preventDefaultFn = { called: false };
            return {
                key,
                code,
                ctrlKey: modifiers.ctrl || false,
                altKey: modifiers.alt || false,
                shiftKey: modifiers.shift || false,
                metaKey: modifiers.meta || false,
                preventDefault: () => { preventDefaultFn.called = true },
                preventDefaultFn
            } as any;
        };

        it("basic preventDefault with flag, without flag, and unmatched keys", () => {
            let executedWith = false;
            let executedWithout = false;
            const handlerWith = () => { executedWith = true };
            const handlerWithout = () => { executedWithout = true };

            keyboardManager.register("a", handlerWith, true);
            keyboardManager.register("b", handlerWithout, false);

            const eventA = mockEvent('a', 'KeyA');
            (keyboardManager as any).onKeyDown(eventA);
            expect(executedWith).to.equal(true);
            expect(eventA.preventDefaultFn.called).to.equal(true);

            const eventB = mockEvent('b', 'KeyB');
            (keyboardManager as any).onKeyDown(eventB);
            expect(executedWithout).to.equal(true);
            expect(eventB.preventDefaultFn.called).to.equal(false);

            const eventX = mockEvent('x', 'KeyX');
            (keyboardManager as any).onKeyDown(eventX);
            expect(eventX.preventDefaultFn.called).to.equal(false);
        });

        it("multi-key sequence calls preventDefault on all keys", () => {
            let executed = false;
            const handler = () => { executed = true };

            keyboardManager.register("abc", handler, true);

            const eventA = mockEvent('a', 'KeyA');
            (keyboardManager as any).onKeyDown(eventA);
            expect(executed).to.equal(false);
            expect(eventA.preventDefaultFn.called).to.equal(true);

            const eventB = mockEvent('b', 'KeyB');
            (keyboardManager as any).onKeyDown(eventB);
            expect(executed).to.equal(false);
            expect(eventB.preventDefaultFn.called).to.equal(true);

            const eventC = mockEvent('c', 'KeyC');
            (keyboardManager as any).onKeyDown(eventC);
            expect(executed).to.equal(true);
            expect(eventC.preventDefaultFn.called).to.equal(true);
        });

        it("shared prefix - preventDefault takes precedence", () => {
            let executedXY = false;
            let executedXZ = false;
            const handlerXY = () => { executedXY = true };
            const handlerXZ = () => { executedXZ = true };

            keyboardManager.register("xy", handlerXY, false);
            keyboardManager.register("xz", handlerXZ, true);

            const eventX = mockEvent('x', 'KeyX');
            (keyboardManager as any).onKeyDown(eventX);
            expect(eventX.preventDefaultFn.called).to.equal(true);

            const eventY = mockEvent('y', 'KeyY');
            (keyboardManager as any).onKeyDown(eventY);
            expect(executedXY).to.equal(true);
            expect(eventY.preventDefaultFn.called).to.equal(true);
        });

        it("shared prefix - registration order independence", () => {
            let executedXY = false;
            let executedXZ = false;
            const handlerXY = () => { executedXY = true };
            const handlerXZ = () => { executedXZ = true };

            keyboardManager.register("xz", handlerXZ, true);
            keyboardManager.register("xy", handlerXY, false);

            const eventX = mockEvent('x', 'KeyX');
            (keyboardManager as any).onKeyDown(eventX);
            expect(eventX.preventDefaultFn.called).to.equal(true);

            const eventY = mockEvent('y', 'KeyY');
            (keyboardManager as any).onKeyDown(eventY);
            expect(executedXY).to.equal(true);
            expect(eventY.preventDefaultFn.called).to.equal(true);
        });
    });

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

            expect(executed).to.equal(true)
        })

        it("key sequence with Enter executes handler", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("a<CR>", handler)

            const event1 = mockEvent('a', 'KeyA');
            (keyboardManager as any).onKeyDown(event1)
            expect(executed).to.equal(false)

            const event2 = mockEvent('Enter', 'Enter');
            (keyboardManager as any).onKeyDown(event2)
            expect(executed).to.equal(true)
        })

        it("Ctrl+s shortcut executes handler", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("<C-s>", handler)

            const event = mockEvent('s', 'KeyS', { ctrl: true });
            (keyboardManager as any).onKeyDown(event)

            expect(executed).to.equal(true)
        })

        it("complex sequence with modifiers and special keys", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("g<C-a><CR>", handler)

            const event1 = mockEvent('g', 'KeyG');
            (keyboardManager as any).onKeyDown(event1)
            expect(executed).to.equal(false)

            const event2 = mockEvent('a', 'KeyA', { ctrl: true });
            (keyboardManager as any).onKeyDown(event2)
            expect(executed).to.equal(false)

            const event3 = mockEvent('Enter', 'Enter');
            (keyboardManager as any).onKeyDown(event3)
            expect(executed).to.equal(true)
        })

        it("Control key press is ignored", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("a", handler)

            const event = mockEvent('Control', 'ControlLeft', { ctrl: true });
            (keyboardManager as any).onKeyDown(event)

            expect(executed).to.equal(false)
            expect(keyboardManager.currentSequence).to.deep.equal([])
        })

        it("wrong sequence resets and doesn't execute", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("abc", handler)

            const event1 = mockEvent('a', 'KeyA');
            (keyboardManager as any).onKeyDown(event1)
            expect(keyboardManager.currentSequence).to.deep.equal(["a"])

            const event2 = mockEvent('x', 'KeyX');
            (keyboardManager as any).onKeyDown(event2)
            expect(keyboardManager.currentSequence).to.deep.equal([])
            expect(executed).to.equal(false)
        })

        it("Shift+A produces uppercase A", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("A", handler)

            const event = mockEvent('A', 'KeyA', { shift: true });
            (keyboardManager as any).onKeyDown(event)

            expect(executed).to.equal(true)
        })

        it("special characters like < > are parsed correctly", () => {
            let executed = false
            const handler = () => { executed = true }
            keyboardManager.register("<Lt>", handler)

            const event = mockEvent('<', 'Comma', { shift: true });
            (keyboardManager as any).onKeyDown(event)

            expect(executed).to.equal(true)
        })
    })
})
