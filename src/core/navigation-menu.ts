import { element } from './dom';
import { nativeSelector, nativeStyles } from './native-styles';
import { menu, menuItem } from '../geoguessr/styles';
/** The same native dropdown shell is shared by Singleplayer and Multiplayer. */
export function dropdownLists() {
  const lists = [
    ...document.querySelectorAll(`${nativeSelector(menu, 'dropdown')}, [role="menu"]`),
  ].filter((list) => list.querySelector('a[href]'));
  return lists.filter(
    (parent) => !lists.some((child) => child !== parent && parent.contains(child)),
  );
}
export function menuEntry<K extends 'a' | 'button'>(
  tag: K,
  titleText: string,
  descriptionText: string,
  icon: Element,
  template?: Element,
) {
  const item = nativeStyles().module(menuItem);
  const node = element(tag, template?.className || item.cls('dropdownItem'));
  icon.setAttribute(
    'class',
    template?.querySelector('img')?.getAttribute('class') || item.cls('image'),
  );
  const title = element('div', item.cls('title'), titleText);
  const description = element('div', item.cls('description'), descriptionText);
  node.append(icon, title, description);
  return { item: node, title };
}
/** Place after the last native entry, ahead of secondary links such as Streaks. */
export function insertMenuEntry(container: Element, item: HTMLElement) {
  const selector = nativeSelector(menuItem, 'dropdownItem');
  const native = [...container.children].filter(
    (child) =>
      child !== item &&
      child.matches(selector) &&
      !Object.keys((child as HTMLElement).dataset).some((key) => key.startsWith('bettergeo')),
  );
  const last = native.at(-1);
  if (last) last.after(item);
  else container.append(item);
}
