export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((result, str, i) => result + str + (values[i] || ''), '');
}

export async function fixture<T extends HTMLElement>(template: string): Promise<T> {
  const container = document.createElement('div');
  container.innerHTML = template;
  const element = container.firstElementChild as T;
  document.body.appendChild(element);
  await new Promise(resolve => setTimeout(resolve, 0));
  return element;
}

export async function waitUntil(condition: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitUntil timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
