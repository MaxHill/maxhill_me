import MCard from './m-card';
import MCommand from './m-command';
import MCopyButton from './m-copy-button';
import { MSearchList } from './m-search-list';
import MFitText from './m-fit-text';
import MInput from './m-input';
import MTabList from './m-tab-list';
import MTab from './m-tab';
import MTabPanel from './m-tab-panel';
import MListbox from './m-listbox';
import MListboxItem from './m-listbox-item';

export function registerAll() {
  MCard.define();
  MCopyButton.define();
  MFitText.define();
  MInput.define();

  MTabList.define();
  MTab.define();
  MTabPanel.define();

  MSearchList.define();

  MListbox.define();
  MListboxItem.define();

  MCommand.define();
}

registerAll();
