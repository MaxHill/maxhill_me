import { expect, fixture, html } from '@open-wc/testing';
import { OptionListManager } from './option-list-manager';
import { MOption } from '../m-option';

MOption.define();

describe('OptionListManager', () => {
    describe('constructor', () => {
        it('should create an instance with target element and selector', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                </div>
            `);

            const manager = new OptionListManager(container, 'm-option');
            
            expect(manager).to.be.instanceOf(OptionListManager);
        });

        it('should default multiple to false when not provided', async () => {
            const container = await fixture<HTMLElement>(html`<div></div>`);
            const managerSingle = new OptionListManager(container, 'm-option', false);
            expect(managerSingle.multiple).to.equal(false);
            
            const managerMultiple = new OptionListManager(container, 'm-option', true);
            expect(managerMultiple.multiple).to.equal(true);

            const managerDefault = new OptionListManager(container, 'm-option');
            expect(managerDefault.multiple).to.equal(false);
        });
    });

    describe('options getter - light DOM', () => {
        it('should query options from light DOM when specified', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                    <m-option value="3">Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            const options = manager.options;
            
            expect(options).to.have.lengthOf(3);
        });

        it('should return correct options with specific selector in light DOM', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" class="selectable">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                    <m-option value="3" class="selectable">Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option.selectable', 
                false, 
                { dom: 'light' }
            );
            const options = manager.options;
            
            expect(options).to.have.lengthOf(2);
        });

        it('should return empty array when no matching options exist', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <span>Not an option</span>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            const options = manager.options;
            
            expect(options).to.have.lengthOf(0);
        });
    });

    describe('options getter - shadow DOM', () => {
        it('should return empty array when no shadow root exists', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(container, 'm-option');
            const options = manager.options;
            
            expect(options).to.have.lengthOf(0);
        });
    });

    describe('selectedOptions getter', () => {
        it('should return only selected options', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" selected>Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                    <m-option value="3" selected>Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            const selected = manager.selectedOptions;
            
            expect(selected).to.have.lengthOf(2);
        });

        it('should return empty array when no options are selected', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            const selected = manager.selectedOptions;
            
            expect(selected).to.have.lengthOf(0);
        });

        it('should update when option selection changes', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.selectedOptions).to.have.lengthOf(0);
            
            const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
            option1.selected = true;
            
            expect(manager.selectedOptions).to.have.lengthOf(1);
        });
    });

    describe('selectedValues getter', () => {
        it('should return values of selected options', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="apple" selected>Apple</m-option>
                    <m-option value="banana">Banana</m-option>
                    <m-option value="cherry" selected>Cherry</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            const values = manager.selectedValues;
            
            expect(values).to.deep.equal(['apple', 'cherry']);
        });

        it('should return empty array when no options are selected', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            const values = manager.selectedValues;
            
            expect(values).to.deep.equal([]);
        });

        it('should exclude options without values', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" selected>Option 1</m-option>
                    <m-option selected>Option without value</m-option>
                    <m-option value="3" selected>Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            const values = manager.selectedValues;
            
            expect(values).to.deep.equal(['1', '3']);
        });
    });

    describe('value getter - single select mode', () => {
        it('should return value of first selected option', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2" selected>Option 2</m-option>
                    <m-option value="3" selected>Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.value).to.equal('2');
        });

        it('should return null when no option is selected', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.value).to.be.null;
        });

        it('should return empty string when selected option has no value', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option selected>Option without value</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.value).to.equal('');
        });
    });

    describe('value getter - multiple select mode', () => {
        it('should return array of selected values', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" selected>Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                    <m-option value="3" selected>Option 3</m-option>
                    <m-option value="4" selected>Option 4</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                true, 
                { dom: 'light' }
            );
            
            expect(manager.value).to.deep.equal(['1', '3', '4']);
        });

        it('should return empty array when no options are selected', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                true, 
                { dom: 'light' }
            );
            
            expect(manager.value).to.deep.equal([]);
        });

        it('should exclude options without values from array', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" selected>Option 1</m-option>
                    <m-option selected>Option without value</m-option>
                    <m-option value="3" selected>Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                true, 
                { dom: 'light' }
            );
            
            expect(manager.value).to.deep.equal(['1', '3']);
        });
    });

    describe('integration with MOption', () => {
        it('should work with MOption custom elements', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="red" selected>Red</m-option>
                    <m-option value="green">Green</m-option>
                    <m-option value="blue" selected>Blue</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                true, 
                { dom: 'light' }
            );
            
            const options = manager.options as MOption[];
            expect(options).to.have.lengthOf(3);
            expect(options[0]).to.be.instanceOf(MOption);
            
            const selectedValues = manager.selectedValues;
            expect(selectedValues).to.deep.equal(['red', 'blue']);
        });

        it('should handle disabled options', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" selected>Option 1</m-option>
                    <m-option value="2" disabled>Option 2</m-option>
                    <m-option value="3">Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            const options = manager.options as MOption[];
            const disabledOptions = options.filter(opt => opt.disabled);
            
            expect(disabledOptions).to.have.lengthOf(1);
            expect(disabledOptions[0].value).to.equal('2');
        });

        it('should dynamically reflect option state changes', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.selectedOptions).to.have.lengthOf(0);
            
            const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
            option1.selected = true;
            
            expect(manager.selectedOptions).to.have.lengthOf(1);
            expect(manager.value).to.equal('1');
            
            const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
            option2.selected = true;
            
            expect(manager.selectedOptions).to.have.lengthOf(2);
        });
    });

    describe('edge cases', () => {
        it('should handle container with no options', async () => {
            const container = await fixture<HTMLElement>(html`<div></div>`);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.options).to.have.lengthOf(0);
            expect(manager.selectedOptions).to.have.lengthOf(0);
            expect(manager.selectedValues).to.deep.equal([]);
            expect(manager.value).to.be.null;
        });

        it('should handle all options being disabled', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" disabled>Option 1</m-option>
                    <m-option value="2" disabled>Option 2</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            const options = manager.options as MOption[];
            expect(options.every(opt => opt.disabled)).to.be.true;
        });

        it('should handle complex selectors', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <m-option value="1" class="active">Option 1</m-option>
                    <m-option value="2">Option 2</m-option>
                    <m-option value="3" class="active">Option 3</m-option>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option.active', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.options).to.have.lengthOf(2);
        });

        it('should handle nested structure', async () => {
            const container = await fixture<HTMLElement>(html`
                <div>
                    <div class="group">
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                    <div class="group">
                        <m-option value="3">Option 3</m-option>
                    </div>
                </div>
            `);
            
            const manager = new OptionListManager(
                container, 
                'm-option', 
                false, 
                { dom: 'light' }
            );
            
            expect(manager.options).to.have.lengthOf(3);
        });
    });

    describe('Focus Management', () => {
        describe('focusedElement', () => {
            it('should initialize as null', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.focusedElement).to.be.null;
            });
        });

        describe('firstOption getter', () => {
            it('should return first option when options exist', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const firstOption = container.querySelector<MOption>('m-option[value="1"]')!;
                expect(manager.firstOption).to.equal(firstOption);
            });

            it('should return null when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.firstOption).to.be.null;
            });
        });

        describe('lastOption getter', () => {
            it('should return last option when options exist', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const lastOption = container.querySelector<MOption>('m-option[value="3"]')!;
                expect(manager.lastOption).to.equal(lastOption);
            });

            it('should return null when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.lastOption).to.be.null;
            });

            it('should return same element as first when only one option exists', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Only Option</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.lastOption).to.equal(manager.firstOption);
            });
        });

        describe('nextOption getter', () => {
            it('should return first option when no element is focused', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.nextOption).to.equal(manager.firstOption);
            });

            it('should return next option in sequence', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusedElement = option1;
                
                expect(manager.nextOption).to.equal(option2);
            });

            it('should wrap to first option when at the end', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusedElement = option3;
                
                expect(manager.nextOption).to.equal(option1);
            });

            it('should return null when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.nextOption).to.be.null;
            });
        });

        describe('previousOption getter', () => {
            it('should return last option when no element is focused', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.previousOption).to.equal(manager.lastOption);
            });

            it('should return previous option in sequence', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusedElement = option3;
                
                expect(manager.previousOption).to.equal(option2);
            });

            it('should wrap to last option when at the beginning', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusedElement = option1;
                
                expect(manager.previousOption).to.equal(option3);
            });

            it('should return null when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.previousOption).to.be.null;
            });
        });

        describe('focusSet method', () => {
            it('should set focused property on the option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.focusSet(option1);
                
                expect(option1.focused).to.be.true;
                expect(manager.focusedElement).to.equal(option1);
            });

            it('should remove focused from previously focused element', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                expect(option1.focused).to.be.true;
                
                manager.focusSet(option2);
                expect(option1.hasAttribute('focused')).to.be.false;
                expect(option2.focused).to.be.true;
                expect(manager.focusedElement).to.equal(option2);
            });

            it('should do nothing when passed null', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.focusSet(option1);
                expect(manager.focusedElement).to.equal(option1);
                
                manager.focusSet(null);
                expect(manager.focusedElement).to.equal(option1);
            });
        });

        describe('focusFirst method', () => {
            it('should focus the first option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.focusFirst();
                
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.focused).to.be.true;
            });

            it('should do nothing when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.focusFirst();
                
                expect(manager.focusedElement).to.be.null;
            });
        });

        describe('focusLast method', () => {
            it('should focus the last option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusLast();
                
                expect(manager.focusedElement).to.equal(option3);
                expect(option3.focused).to.be.true;
            });

            it('should do nothing when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.focusLast();
                
                expect(manager.focusedElement).to.be.null;
            });
        });

        describe('focusNext method', () => {
            it('should focus the next option in sequence', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                manager.focusNext();
                
                expect(manager.focusedElement).to.equal(option2);
                expect(option2.focused).to.be.true;
                expect(option1.hasAttribute('focused')).to.be.false;
            });

            it('should wrap to first option when at end', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option3);
                manager.focusNext();
                
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.focused).to.be.true;
                expect(option3.hasAttribute('focused')).to.be.false;
            });

            it('should focus first option when nothing is focused', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.focusNext();
                
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.focused).to.be.true;
            });
        });

        describe('focusPrev method', () => {
            it('should focus the previous option in sequence', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option3);
                manager.focusPrev();
                
                expect(manager.focusedElement).to.equal(option2);
                expect(option2.focused).to.be.true;
                expect(option3.hasAttribute('focused')).to.be.false;
            });

            it('should wrap to last option when at beginning', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option1);
                manager.focusPrev();
                
                expect(manager.focusedElement).to.equal(option3);
                expect(option3.focused).to.be.true;
                expect(option1.hasAttribute('focused')).to.be.false;
            });

            it('should focus last option when nothing is focused', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusPrev();
                
                expect(manager.focusedElement).to.equal(option2);
                expect(option2.focused).to.be.true;
            });
        });

        describe('focusBlur method', () => {
            it('should remove focus from focused element', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.focusSet(option1);
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.focused).to.be.true;
                
                manager.focusBlur();
                
                expect(manager.focusedElement).to.be.null;
                expect(option1.hasAttribute('focused')).to.be.false;
            });

            it('should do nothing when no element is focused', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                expect(manager.focusedElement).to.be.null;
                
                manager.focusBlur();
                
                expect(manager.focusedElement).to.be.null;
            });
        });

        describe('focus navigation integration', () => {
            it('should handle multiple sequential focus changes', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusFirst();
                expect(manager.focusedElement).to.equal(option1);
                
                manager.focusNext();
                expect(manager.focusedElement).to.equal(option2);
                
                manager.focusNext();
                expect(manager.focusedElement).to.equal(option3);
                
                manager.focusPrev();
                expect(manager.focusedElement).to.equal(option2);
                
                manager.focusLast();
                expect(manager.focusedElement).to.equal(option3);
                
                manager.focusBlur();
                expect(manager.focusedElement).to.be.null;
            });

            it('should handle focus with single option list', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Only Option</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.focusFirst();
                expect(manager.focusedElement).to.equal(option1);
                
                manager.focusNext();
                expect(manager.focusedElement).to.equal(option1);
                
                manager.focusPrev();
                expect(manager.focusedElement).to.equal(option1);
                
                manager.focusLast();
                expect(manager.focusedElement).to.equal(option1);
            });

            it('should maintain only one focused element at a time', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.focusFirst();
                manager.focusNext();
                
                const options = manager.options as MOption[];
                const focusedOptions = options.filter(opt => opt.focused);
                
                expect(focusedOptions).to.have.lengthOf(1);
            });

            it('should work with dynamically added options', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.focusFirst();
                expect(manager.options).to.have.lengthOf(1);
                
                // Add new option
                const newOption = document.createElement('m-option') as MOption;
                newOption.value = '2';
                newOption.textContent = 'Option 2';
                container.appendChild(newOption);
                
                await newOption.updateComplete;
                
                expect(manager.options).to.have.lengthOf(2);
                manager.focusNext();
                expect(manager.focusedElement).to.equal(newOption);
            });
        });
    });

    describe('Selection Management', () => {
        describe('Option accessor getters', () => {
            describe('firstOption getter', () => {
                it('should return first option when options exist', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                            <m-option value="3">Option 3</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                    expect(manager.firstOption).to.equal(option1);
                });

                it('should return null when no options exist', async () => {
                    const container = await fixture<HTMLElement>(html`<div></div>`);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    expect(manager.firstOption).to.be.null;
                });
            });

            describe('lastOption getter', () => {
                it('should return last option when options exist', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                            <m-option value="3">Option 3</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                    expect(manager.lastOption).to.equal(option3);
                });

                it('should return null when no options exist', async () => {
                    const container = await fixture<HTMLElement>(html`<div></div>`);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    expect(manager.lastOption).to.be.null;
                });
            });

            describe('nextOption getter', () => {
                it('should return first option when no element is focused', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    expect(manager.nextOption).to.equal(manager.firstOption);
                });

                it('should return next option in sequence', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                            <m-option value="3">Option 3</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                    const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                    
                    manager.focusedElement = option1;
                    
                    expect(manager.nextOption).to.equal(option2);
                });

                it('should wrap to first option when at the end', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                            <m-option value="3">Option 3</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                    const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                    
                    manager.focusedElement = option3;
                    
                    expect(manager.nextOption).to.equal(option1);
                });
            });

            describe('previousOption getter', () => {
                it('should return last option when no element is focused', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    expect(manager.previousOption).to.equal(manager.lastOption);
                });

                it('should return previous option in sequence', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                            <m-option value="3">Option 3</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                    const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                    
                    manager.focusedElement = option3;
                    
                    expect(manager.previousOption).to.equal(option2);
                });

                it('should wrap to last option when at the beginning', async () => {
                    const container = await fixture<HTMLElement>(html`
                        <div>
                            <m-option value="1">Option 1</m-option>
                            <m-option value="2">Option 2</m-option>
                            <m-option value="3">Option 3</m-option>
                        </div>
                    `);
                    
                    const manager = new OptionListManager(
                        container, 
                        'm-option', 
                        false, 
                        { dom: 'light' }
                    );
                    
                    const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                    const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                    
                    manager.focusedElement = option1;
                    
                    expect(manager.previousOption).to.equal(option3);
                });
            });
        });

        describe('select method - single mode', () => {
            it('should select an unselected option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.select(option1);
                
                expect(option1.selected).to.be.true;
                expect(manager.focusedElement).to.equal(option1);
            });

            it('should deselect other options when selecting in single mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1" selected>Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                expect(option1.selected).to.be.true;
                
                manager.select(option2);
                
                expect(option1.selected).to.be.false;
                expect(option2.selected).to.be.true;
            });

            it('should keep option selected when selecting already selected option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1" selected>Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                expect(option1.selected).to.be.true;
                
                manager.select(option1);
                
                expect(option1.selected).to.be.true;
            });

            it('should do nothing when passed null', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.select(null as any);
                
                expect(manager.selectedOptions).to.have.lengthOf(0);
            });

            it('should move focus to selected option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                manager.select(option2);
                
                expect(manager.focusedElement).to.equal(option2);
                expect(option2.selected).to.be.true;
            });
        });

        describe('select method - multiple mode', () => {
            it('should toggle selection on an option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                expect(option1.selected).to.be.false;
                
                manager.select(option1);
                expect(option1.selected).to.be.true;
                
                manager.select(option1);
                expect(option1.selected).to.be.false;
            });

            it('should allow multiple options to be selected', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.select(option1);
                manager.select(option2);
                manager.select(option3);
                
                expect(option1.selected).to.be.true;
                expect(option2.selected).to.be.true;
                expect(option3.selected).to.be.true;
                expect(manager.selectedOptions).to.have.lengthOf(3);
            });

            it('should not deselect other options in multiple mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1" selected>Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                expect(option1.selected).to.be.true;
                
                manager.select(option2);
                
                expect(option1.selected).to.be.true;
                expect(option2.selected).to.be.true;
            });

            it('should maintain focus when toggling selection', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                manager.select(option2);
                
                expect(manager.focusedElement).to.equal(option1);
            });
        });

        describe('selectFocused method', () => {
            it('should select the currently focused option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option2);
                manager.selectFocused();
                
                expect(option2.selected).to.be.true;
            });

            it('should do nothing when no option is focused', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.selectFocused();
                
                expect(manager.selectedOptions).to.have.lengthOf(0);
            });

            it('should toggle selection in multiple mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.focusSet(option1);
                manager.selectFocused();
                expect(option1.selected).to.be.true;
                
                manager.selectFocused();
                expect(option1.selected).to.be.false;
            });
        });

        describe('selectFirst method', () => {
            it('should select the first option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                manager.selectFirst();
                
                expect(option1.selected).to.be.true;
            });

            it('should do nothing when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.selectFirst();
                
                expect(manager.selectedOptions).to.have.lengthOf(0);
            });
        });

        describe('selectLast method', () => {
            it('should select the last option', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.selectLast();
                
                expect(option3.selected).to.be.true;
            });

            it('should do nothing when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.selectLast();
                
                expect(manager.selectedOptions).to.have.lengthOf(0);
            });
        });

        describe('selectNext method', () => {
            it('should select the next option relative to focused element', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                manager.selectNext();
                
                expect(option2.selected).to.be.true;
            });

            it('should do nothing when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.selectNext();
                
                expect(manager.selectedOptions).to.have.lengthOf(0);
            });
        });

        describe('selectPrev method', () => {
            it('should select the previous option relative to focused element', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option3);
                manager.selectPrev();
                
                expect(option2.selected).to.be.true;
            });

            it('should do nothing when no options exist', async () => {
                const container = await fixture<HTMLElement>(html`<div></div>`);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                manager.selectPrev();
                
                expect(manager.selectedOptions).to.have.lengthOf(0);
            });
        });

        describe('createSelectionResultSingle method', () => {
            it('should create result with items to deselect', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1" selected>Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                const result = manager.createSelectionResultSingle(option2);
                
                expect(result.itemToSelect).to.equal(option2);
                expect(result.itemsToDeselect).to.include(option1);
                expect(result.shouldToggle).to.be.false;
                expect(result.newFocusTarget).to.equal(option2);
            });

            it('should not include target option in items to deselect', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1" selected>Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                
                const result = manager.createSelectionResultSingle(option1);
                
                expect(result.itemsToDeselect).to.not.include(option1);
            });
        });

        describe('createSelectionResultMultiple method', () => {
            it('should create result with toggle behavior', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option2);
                
                const result = manager.createSelectionResultMultiple(option1);
                
                expect(result.itemToSelect).to.equal(option1);
                expect(result.itemsToDeselect).to.have.lengthOf(0);
                expect(result.shouldToggle).to.be.true;
                expect(result.newFocusTarget).to.equal(option2);
            });

            it('should preserve focused element', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                
                const result = manager.createSelectionResultMultiple(option2);
                
                expect(result.newFocusTarget).to.equal(option1);
            });
        });

        describe('selection integration tests', () => {
            it('should handle switching from multiple to single mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.select(option1);
                manager.select(option2);
                
                expect(manager.selectedOptions).to.have.lengthOf(2);
                
                manager.multiple = false;
                manager.select(option3);
                
                expect(option1.selected).to.be.false;
                expect(option2.selected).to.be.false;
                expect(option3.selected).to.be.true;
            });

            it('should coordinate focus and selection', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusFirst();
                expect(manager.focusedElement).to.equal(option1);
                
                manager.focusNext();
                expect(manager.focusedElement).to.equal(option2);
                
                manager.selectFocused();
                expect(option2.selected).to.be.true;
            });

            it('should work with complex selection scenarios', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                        <m-option value="4">Option 4</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusFirst();
                manager.selectFocused();
                expect(option1.selected).to.be.true;
                
                manager.focusNext();
                manager.selectFocused();
                expect(option2.selected).to.be.true;
                
                manager.focusNext();
                manager.selectFocused();
                expect(option3.selected).to.be.true;
                
                manager.focusPrev();
                manager.selectFocused();
                expect(option2.selected).to.be.false;
                
                expect(manager.selectedOptions).to.have.lengthOf(2);
                expect(manager.selectedValues).to.deep.equal(['1', '3']);
            });
        });
    });

    describe('Keyboard Navigation', () => {
        describe('handleKeydown - single-select mode', () => {
            it('should select next option on ArrowDown', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                // Set initial focus
                manager.focusSet(option1);
                
                const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
                manager.handleKeydown(event);
                
                expect(option2.selected).to.be.true;
            });

            it('should select previous option on ArrowUp', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                // Set initial focus
                manager.focusSet(option2);
                
                const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                manager.handleKeydown(event);
                
                expect(option1.selected).to.be.true;
            });

            it('should select first option on Home', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3" selected>Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                const event = new KeyboardEvent('keydown', { key: 'Home' });
                manager.handleKeydown(event);
                
                expect(option3.selected).to.be.false;
                expect(option1.selected).to.be.true;
            });

            it('should select last option on End', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1" selected>Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                const event = new KeyboardEvent('keydown', { key: 'End' });
                manager.handleKeydown(event);
                
                expect(option1.selected).to.be.false;
                expect(option3.selected).to.be.true;
            });

            it('should select focused option on Space', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                manager.focusSet(option2);
                
                const event = new KeyboardEvent('keydown', { key: ' ' });
                manager.handleKeydown(event);
                
                expect(option2.selected).to.be.true;
            });

            it('should select focused option on Enter', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                manager.focusSet(option2);
                
                const event = new KeyboardEvent('keydown', { key: 'Enter' });
                manager.handleKeydown(event);
                
                expect(option2.selected).to.be.true;
            });
        });

        describe('handleKeydown - multiple-select mode', () => {
            it('should move focus only on ArrowDown without shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                
                const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option2);
                expect(option1.selected).to.be.false;
                expect(option2.selected).to.be.false;
            });

            it('should move focus and extend selection on ArrowDown with shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option1);
                
                const event = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option2);
                expect(option2.selected).to.be.true;
            });

            it('should move focus only on ArrowUp without shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option2);
                
                const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.selected).to.be.false;
                expect(option2.selected).to.be.false;
            });

            it('should move focus and extend selection on ArrowUp with shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                manager.focusSet(option2);
                
                const event = new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.selected).to.be.true;
            });

            it('should move focus to first on Home without shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option3);
                
                const event = new KeyboardEvent('keydown', { key: 'Home' });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.selected).to.be.false;
            });

            it('should move focus to first and select on Home with shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option3);
                
                const event = new KeyboardEvent('keydown', { key: 'Home', shiftKey: true });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option1);
                expect(option1.selected).to.be.true;
            });

            it('should move focus to last on End without shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option1);
                
                const event = new KeyboardEvent('keydown', { key: 'End' });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option3);
                expect(option3.selected).to.be.false;
            });

            it('should move focus to last and select on End with shift', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                manager.focusSet(option1);
                
                const event = new KeyboardEvent('keydown', { key: 'End', shiftKey: true });
                manager.handleKeydown(event);
                
                expect(manager.focusedElement).to.equal(option3);
                expect(option3.selected).to.be.true;
            });

            it('should toggle selection on Space', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                manager.focusSet(option2);
                
                const event = new KeyboardEvent('keydown', { key: ' ' });
                manager.handleKeydown(event);
                expect(option2.selected).to.be.true;
                
                manager.handleKeydown(event);
                expect(option2.selected).to.be.false;
            });

            it('should toggle selection on Enter', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                manager.focusSet(option2);
                
                const event = new KeyboardEvent('keydown', { key: 'Enter' });
                manager.handleKeydown(event);
                expect(option2.selected).to.be.true;
                
                manager.handleKeydown(event);
                expect(option2.selected).to.be.false;
            });
        });

        describe('handleKeydown - integration scenarios', () => {
            it('should support sequential navigation in single-select mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                // Start at first
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
                expect(option1.selected).to.be.true;
                
                // Move down
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
                expect(option2.selected).to.be.true;
                expect(option1.selected).to.be.false;
                
                // Move down again
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
                expect(option3.selected).to.be.true;
                expect(option2.selected).to.be.false;
                
                // Move back up
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
                expect(option2.selected).to.be.true;
                expect(option3.selected).to.be.false;
            });

            it('should support range selection in multiple-select mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                        <m-option value="4">Option 4</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                const option3 = container.querySelector<MOption>('m-option[value="3"]')!;
                
                // Start at first
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
                
                // Select first
                manager.handleKeydown(new KeyboardEvent('keydown', { key: ' ' }));
                expect(option1.selected).to.be.true;
                
                // Extend selection down with shift
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
                expect(option1.selected).to.be.true;
                expect(option2.selected).to.be.true;
                
                // Extend selection down again with shift
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
                expect(option1.selected).to.be.true;
                expect(option2.selected).to.be.true;
                expect(option3.selected).to.be.true;
            });

            it('should handle mixed navigation without shift in multiple mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                        <m-option value="3">Option 3</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                // Focus first
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
                expect(manager.focusedElement).to.equal(option1);
                
                // Select it
                manager.handleKeydown(new KeyboardEvent('keydown', { key: ' ' }));
                expect(option1.selected).to.be.true;
                
                // Move focus without selecting
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
                expect(manager.focusedElement).to.equal(option2);
                expect(option2.selected).to.be.false;
                
                // Select current focus
                manager.handleKeydown(new KeyboardEvent('keydown', { key: ' ' }));
                expect(option1.selected).to.be.true;
                expect(option2.selected).to.be.true;
            });

            it('should wrap around with ArrowDown in single-select mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    false, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                // Start at last
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'End' }));
                expect(option2.selected).to.be.true;
                
                // Wrap to first
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
                expect(option1.selected).to.be.true;
                expect(option2.selected).to.be.false;
            });

            it('should wrap around with ArrowUp in multiple-select mode', async () => {
                const container = await fixture<HTMLElement>(html`
                    <div>
                        <m-option value="1">Option 1</m-option>
                        <m-option value="2">Option 2</m-option>
                    </div>
                `);
                
                const manager = new OptionListManager(
                    container, 
                    'm-option', 
                    true, 
                    { dom: 'light' }
                );
                
                const option1 = container.querySelector<MOption>('m-option[value="1"]')!;
                const option2 = container.querySelector<MOption>('m-option[value="2"]')!;
                
                // Start at first
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
                expect(manager.focusedElement).to.equal(option1);
                
                // Wrap to last
                manager.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
                expect(manager.focusedElement).to.equal(option2);
            });
        });
    });
});
