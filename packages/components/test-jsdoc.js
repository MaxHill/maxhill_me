import ts from 'typescript';

const code = `
/**
 * A form-associated listbox component
 * 
 * @customElement
 * @tagname m-list-box
 * 
 * @since 1.0.0
 * @testTag foo - This is a test
 * 
 * @example basic
 * <m-list-box name="fruit">
 *   <m-list-box-item value="apple">Apple</m-list-box-item>
 * </m-list-box>
 * 
 */
export class MListBox {}
`;

const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);

function visit(node) {
  if (ts.isClassDeclaration(node)) {
    console.log('Class:', node.name?.getText());
    if (node.jsDoc) {
      node.jsDoc.forEach((jsDoc, i) => {
        console.log(`\nJSDoc ${i}:`, jsDoc.comment);
        if (jsDoc.tags) {
          console.log('Tags found:', jsDoc.tags.length);
          jsDoc.tags.forEach(tag => {
            console.log(`  @${tag.tagName.getText()}:`, tag.comment);
          });
        } else {
          console.log('No tags found');
        }
      });
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);
