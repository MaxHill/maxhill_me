import { describe, it, expect } from 'vitest';
import { MBagEditPage } from './index';

describe('MBagEditPage', () => {
  it('should be defined', () => {
    expect(MBagEditPage).toBeDefined();
  });

  it('should have the correct tag name', () => {
    expect(MBagEditPage.tagName).toBe('m-bag-edit-page');
  });
});
