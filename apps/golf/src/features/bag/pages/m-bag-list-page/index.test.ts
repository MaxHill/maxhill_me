import { describe, it, expect } from 'vitest';
import { MBagListPage } from './index';

describe('MBagListPage', () => {
  it('should be defined', () => {
    expect(MBagListPage).toBeDefined();
  });

  it('should have the correct tag name', () => {
    expect(MBagListPage.tagName).toBe('m-bag-list-page');
  });
});
