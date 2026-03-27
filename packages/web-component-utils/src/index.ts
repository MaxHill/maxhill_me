// Core element
export { MElement, generateUUID } from './m-element';

// Decorators
export { 
  BindAttribute, 
  UpdatesAttribute, 
  handleAttributeChange 
} from './reflect-attribute';
export { query, queryAll } from './query';
export type { QueryOptions } from './query';

// Controllers
export { OutsideClickController } from './outside-click-controller';
