import { element } from './dom';
import { nativeStyles } from './native-styles';
/** The same native dropdown shell is shared by Singleplayer and Multiplayer. */
export function dropdownLists() {
  const lists = [...document.querySelectorAll('[class*="menu-item_dropdown__"], [role="menu"]')];
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
  const c = nativeStyles().resolve;
  const item = element(
    tag,
    template?.className ?? c('link_anchor__TGl1_', 'menu-dropdown-item_dropdownItem__k29Nw'),
  );
  icon.setAttribute('class', c('menu-dropdown-item_image__r1egm'));
  const title = element('div', c('menu-dropdown-item_title__4U4eM'), titleText);
  const description = element('div', c('menu-dropdown-item_description__uVic7'), descriptionText);
  item.append(icon, title, description);
  return { item, title };
}
export function insertMenuEntry(container: Element, item: HTMLElement) {
  container.insertBefore(
    item,
    container.querySelector(':scope > [class*="menu-dropdown-secondary_container__"]'),
  );
}
