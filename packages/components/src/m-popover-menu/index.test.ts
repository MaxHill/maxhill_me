import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MPopoverMenu } from './index';

MPopoverMenu.define();

describe('m-popover-menu', () => {
    describe('accessibility', () => {
        it('should be accessible', async () => {
            const container = await fixture(html`
                <div>
                    <button id="trigger-btn" popovertarget="test-menu">Open Menu</button>
                    <m-popover-menu id="test-menu" popover anchor="trigger-btn">
                        <a href="/link">Link</a>
                    </m-popover-menu>
                </div>
            `);

            const menu = container.querySelector('m-popover-menu');
            await expect(menu).to.be.accessible();
        });

        it('should have role="menu" by default', async () => {
            const el = await fixture(html`
                <m-popover-menu id="test-menu" popover anchor="trigger">
                    <button>Action</button>
                </m-popover-menu>
            `);

            // Check internals role (ElementInternals.role)
            const menu = el as MPopoverMenu;
            expect(menu['internals'].role).to.equal('menu');
        });

        it('should allow role override', async () => {
            const el = await fixture(html`
                <m-popover-menu id="test-menu" popover anchor="trigger" role="dialog">
                    <p>Content</p>
                </m-popover-menu>
            `);

            expect(el.getAttribute('role')).to.equal('dialog');
        });
    });

    describe('anchor resolution', () => {
        it('should find anchor element by ID', async () => {
            const container = await fixture(html`
                <div>
                    <button id="my-trigger" popovertarget="my-menu">Open</button>
                    <m-popover-menu id="my-menu" popover anchor="my-trigger">
                        Content
                    </m-popover-menu>
                </div>
            `);

            const menu = container.querySelector('m-popover-menu') as MPopoverMenu;
            expect(menu.anchor).to.equal('my-trigger');
        });
    });

    describe('positioning', () => {
        it('should apply positioning when popover opens', async () => {
            const container = await fixture(html`
                <div>
                    <button id="pos-trigger" popovertarget="pos-menu">Open</button>
                    <m-popover-menu id="pos-menu" popover anchor="pos-trigger">
                        Content
                    </m-popover-menu>
                </div>
            `);

            const button = container.querySelector('button') as HTMLButtonElement;
            const menu = container.querySelector('m-popover-menu') as MPopoverMenu;

            button.click();
            
            await waitUntil(() => menu.matches(':popover-open'));
            
            // Wait for positioning to be applied (needs a microtask)
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Should have positioning styles applied
            expect(menu.style.left).to.not.equal('');
            expect(menu.style.top).to.not.equal('');
        });
    });
});
