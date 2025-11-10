import MCard from './m-card';
import MCopyButton from './m-copy-button';
import { MSearchList } from './m-search-list';
import MFitText from './m-fit-text';
import MTabList from './m-tab-list';
import MTab from './m-tab';
import MTabPanel from './m-tab-panel';
import MListbox from './m-listbox';
import MListboxItem from './m-listbox-item';

export function registerAll() {
  MCard.define();
  MCopyButton.define();
  MFitText.define();

  MTabList.define();
  MTab.define();
  MTabPanel.define();

  MSearchList.define();

  MListbox.define();
  MListboxItem.define();
}

registerAll();
