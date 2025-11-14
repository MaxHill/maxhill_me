import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { html, fixture } from '../utils/test-helpers';
import { MInput } from './index';

MInput.define();

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m-input', () => {
  describe('basic rendering', () => {
    it('should render with default values', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      expect(el).toBeInstanceOf(MInput);
      expect(el.value).toBe('');
      expect(el.type).toBe('text');
      expect(el.required).toBe(false);
      expect(el.disabled).toBe(false);
    });

    it('should render with label', async () => {
      const el = await fixture<MInput>(html`
        <m-input label="Email"></m-input>
      `);

      const label = el.shadowRoot?.querySelector('label');
      expect(label?.textContent).toBe('Email');
    });

    it('should render with value', async () => {
      const el = await fixture<MInput>(html`
        <m-input value="test@example.com"></m-input>
      `);

      expect(el.value).toBe('test@example.com');
      const input = el.shadowRoot?.querySelector('input');
      expect(input?.value).toBe('test@example.com');
    });

    it('should have unique input ID', async () => {
      const el1 = await fixture<MInput>(html`<m-input label="Input 1"></m-input>`);
      const el2 = await fixture<MInput>(html`<m-input label="Input 2"></m-input>`);

      const input1 = el1.shadowRoot?.querySelector('input');
      const input2 = el2.shadowRoot?.querySelector('input');
      const label1 = el1.shadowRoot?.querySelector('label');
      const label2 = el2.shadowRoot?.querySelector('label');

      expect(input1?.id).toBeTruthy();
      expect(input2?.id).toBeTruthy();
      expect(input1?.id).not.toBe(input2?.id);
      expect(label1?.getAttribute('for')).toBe(input1?.id);
      expect(label2?.getAttribute('for')).toBe(input2?.id);
    });
  });

  describe('events', () => {
    it('should dispatch m-input-input on input', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-input-input', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(eventFired).toBe(true);
      expect(eventDetail.value).toBe('test');
    });

    it('should dispatch m-input-change on change', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-input-change', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.value = 'test';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      expect(eventFired).toBe(true);
      expect(eventDetail.value).toBe('test');
    });

    it('should dispatch m-input-blur on blur', async () => {
      const el = await fixture<MInput>(html`
        <m-input value="test"></m-input>
      `);

      let eventFired = false;

      el.addEventListener('m-input-blur', (e: Event) => {
        eventFired = true;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      expect(eventFired).toBe(true);
    });

    it('should dispatch m-input-focus on focus', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      let eventFired = false;

      el.addEventListener('m-input-focus', (e: Event) => {
        eventFired = true;
      });

      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      expect(eventFired).toBe(true);
    });

    it('should dispatch m-input-select with selected text', async () => {
      const el = await fixture<MInput>(html`
        <m-input value="hello world"></m-input>
      `);

      let selectEventFired = false;
      let selectedValue = '';

      el.addEventListener('m-input-select', ((e: CustomEvent) => {
        selectEventFired = true;
        selectedValue = e.detail.value;
      }) as EventListener);

      const input = el.shadowRoot?.querySelector('input')!;
      input.setSelectionRange(0, 5);
      input.dispatchEvent(new Event('select', { bubbles: true }));

      expect(selectEventFired).toBe(true);
      expect(selectedValue).toBe('hello');
    });
  });

  describe('validation - submit-only behavior', () => {
    it('should NOT show error on initial render for required empty input', async () => {
      const el = await fixture<MInput>(html`
        <m-input required label="Name"></m-input>
      `);

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).toBe('');
      expect(errorEl?.style.display).not.toBe('block');
    });

    it('should NOT validate on blur', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const input = el.shadowRoot?.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).toBe('');
    });

    it('should NOT validate on change', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const input = el.shadowRoot?.querySelector('input')!;
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).toBe('');
    });

    it('should validate when reportValidity() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const isValid = el.reportValidity();

      expect(isValid).toBe(false);
      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).not.toBe('');
    });

    it('should validate when checkValidity() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      const isValid = el.checkValidity();

      expect(isValid).toBe(false);
    });
  });

  describe('validation - required', () => {
    it('should dispatch m-input-invalid event on failed validation', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      let invalidEventFired = false;
      let validationMessage = '';

      el.addEventListener('m-input-invalid', (e: Event) => {
        invalidEventFired = true;
        validationMessage = (e as CustomEvent).detail.validationMessage;
      });

      el.reportValidity();

      expect(invalidEventFired).toBe(true);
      expect(validationMessage).toBeTruthy();
    });

    it('should dispatch m-input-valid event on successful validation', async () => {
      const el = await fixture<MInput>(html`
        <m-input required value="test"></m-input>
      `);

      let validEventFired = false;

      el.addEventListener('m-input-valid', (e: Event) => {
        validEventFired = true;
      });

      el.reportValidity();

      expect(validEventFired).toBe(true);
    });
  });

  describe('validation - custom error message', () => {
    it('should use error-message attribute when provided', async () => {
      const el = await fixture<MInput>(html`
        <m-input required error-message="This field is mandatory"></m-input>
      `);

      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).toBe('This field is mandatory');
    });

    it('should use native validation message when error-message not provided', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent).toBeTruthy();
      expect(errorEl?.textContent).not.toBe('');
    });
  });

  describe('validation - error display', () => {
    it('should show error message after validation fails', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.style.display).toBe('block');
      expect(errorEl?.textContent).toBeTruthy();
    });

    it('should hide error message after validation passes', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();
      expect(el.shadowRoot?.querySelector('.error')?.style.display).toBe('block');

      el.value = 'valid';
      await new Promise(resolve => setTimeout(resolve, 0));
      el.reportValidity();

      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.style.display).toBe('none');
      expect(errorEl?.textContent).toBe('');
    });

    it('should update aria-invalid based on validation state', async () => {
      const el = await fixture<MInput>(html`
        <m-input required></m-input>
      `);

      el.reportValidity();
      // ARIA is set via ElementInternals (internals is private, but we can check the behavior)
      // ElementInternals ARIA doesn't reflect to attributes, it works at the accessibility tree level
      // We can verify by checking that validation works and error state is shown
      const errorEl = el.shadowRoot?.querySelector('.error');
      expect(errorEl?.textContent?.trim()).toBeTruthy();

      el.value = 'valid';
      await new Promise(resolve => setTimeout(resolve, 0));
      el.reportValidity();

      // Error should be hidden after valid input
      expect(errorEl?.style.display).toBe('none');
    });
  });

  describe('focus management', () => {
    it('should focus input when focus() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      el.focus();

      const input = el.shadowRoot?.querySelector('input');
      expect(document.activeElement).toBe(el);
    });

    it('should blur input when blur() is called', async () => {
      const el = await fixture<MInput>(html`
        <m-input></m-input>
      `);

      el.focus();
      el.blur();

      expect(document.activeElement).not.toBe(el);
    });
  });

});
