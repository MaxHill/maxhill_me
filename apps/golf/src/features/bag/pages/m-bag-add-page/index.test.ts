import { describe, it, expect } from 'vitest';
import { MBagAddPage } from './index';

describe('MBagAddPage', () => {
  it('should be defined', () => {
    expect(MBagAddPage).toBeDefined();
  });

  it('should have the correct tag name', () => {
    expect(MBagAddPage.tagName).toBe('m-bag-add-page');
  });
});
