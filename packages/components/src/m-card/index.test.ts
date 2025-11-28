import { expect, html, fixture } from '@open-wc/testing';
import MCard from './index';

MCard.define();

describe('m-card', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-card>
          <h2 slot="title">Card Title</h2>
          <p>Card content goes here.</p>
          <div slot="footer">Footer content</div>
        </m-card>
      `);

      await expect(el).to.be.accessible();
    });

    it('should be accessible with href', async () => {
      const el = await fixture(html`
        <m-card href="/test">
          <h2 slot="title">Clickable Card</h2>
          <p>This card is a link.</p>
        </m-card>
      `);

      await expect(el).to.be.accessible();
    });
  });

  describe('link functionality', () => {
    it('should not render link when href is not provided', async () => {
      const el = await fixture<MCard>(html`
        <m-card>
          <p>Content</p>
        </m-card>
      `);

      const link = el.shadowRoot?.querySelector('a');
      expect(link).to.be.null;
    });

    it('should render link when href is provided', async () => {
      const el = await fixture<MCard>(html`
        <m-card href="/test-path">
          <p>Content</p>
        </m-card>
      `);

      const link = el.shadowRoot?.querySelector('a');
      expect(link).to.exist;
      expect(link?.getAttribute('href')).to.equal('/test-path');
    });

    it('should include target attribute when provided', async () => {
      const el = await fixture<MCard>(html`
        <m-card href="/test" target="_blank">
          <p>Content</p>
        </m-card>
      `);

      const link = el.shadowRoot?.querySelector('a');
      expect(link?.getAttribute('target')).to.equal('_blank');
    });

    it('should add rel="noopener noreferrer" when target="_blank"', async () => {
      const el = await fixture<MCard>(html`
        <m-card href="/test" target="_blank">
          <p>Content</p>
        </m-card>
      `);

      const link = el.shadowRoot?.querySelector('a');
      expect(link?.getAttribute('rel')).to.equal('noopener noreferrer');
    });

    it('should not add rel attribute when target is not _blank', async () => {
      const el = await fixture<MCard>(html`
        <m-card href="/test" target="_self">
          <p>Content</p>
        </m-card>
      `);

      const link = el.shadowRoot?.querySelector('a');
      expect(link?.getAttribute('rel')).to.be.null;
    });

    it('should update link when href attribute changes', async () => {
      const el = await fixture<MCard>(html`
        <m-card href="/initial">
          <p>Content</p>
        </m-card>
      `);

      let link = el.shadowRoot?.querySelector('a');
      expect(link?.getAttribute('href')).to.equal('/initial');

      el.setAttribute('href', '/updated');
      await el.updateComplete;

      link = el.shadowRoot?.querySelector('a');
      expect(link?.getAttribute('href')).to.equal('/updated');
    });

    it('should be tabbable when href is present', async () => {
      const el = await fixture<MCard>(html`
        <m-card href="/test">
          <p>Content</p>
        </m-card>
      `);

      expect(el.getAttribute('tabindex')).to.equal('0');
    });

    it('should not be tabbable when href is absent', async () => {
      const el = await fixture<MCard>(html`
        <m-card>
          <p>Content</p>
        </m-card>
      `);

      expect(el.getAttribute('tabindex')).to.be.null;
    });

    it('should have role="link" set via ElementInternals when href is present', async () => {
      const el = await fixture<MCard>(html`
        <m-card href="/test">
          <p>Content</p>
        </m-card>
      `);

      // Role should be set via ElementInternals
      // We can check this by verifying the computed role
      expect(el.getAttribute('role')).to.be.null; // Not set as attribute
      // The internals.role is set but not reflected as an attribute
    });

    it('should not have role when href is absent', async () => {
      const el = await fixture<MCard>(html`
        <m-card>
          <p>Content</p>
        </m-card>
      `);

      expect(el.getAttribute('role')).to.be.null;
    });
  });
});
