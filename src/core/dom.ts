export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function link(text: string, href: string, className = '') {
  const node = element('a', className, text);
  node.href = href;
  return node;
}
