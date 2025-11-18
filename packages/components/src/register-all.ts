import MCard from './m-card';
import MCombobox from './m-combobox';
import MCommandPalette from './m-command-palette';
import MCommand from './m-command';
import MCopyButton from './m-copy-button';
import { MSearchList } from './m-search-list';
import MFitText from './m-fit-text';
import MInput from './m-input';
import MTabList from './m-tab-list';
import MTab from './m-tab';
import MTabPanel from './m-tab-panel';
import MListbox from './m-listbox';
import MOption from './m-option';

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
  MOption.define();

  MCommand.define();
  MCommandPalette.define();

  MCombobox.define();

}

registerAll();
