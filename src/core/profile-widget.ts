import { element } from './dom';
import { nativeStyles } from './native-styles';
import * as css from '../geoguessr/styles';
/** Native profile card shell, with content supplied by the feature. */
export function profileWidget(title: string, icon: HTMLImageElement) {
  const styles = nativeStyles();
  const profile = styles.module(css.profile),
    frame = styles.module(css.widget),
    card = styles.module(css.profileWidget),
    headline = styles.module(css.headline),
    text = styles.module(css.typography);
  const root = element('div', profile.cls('widgetRow'));
  const widget = element('div', frame.cls('root', 'compact'));
  const border = element('div', frame.cls('widgetBorder', 'hasLoaded'));
  const outer = element('div', frame.cls('widgetOuter'));
  const inner = element('div', frame.cls('widgetInner'));
  const heading = element(
    'h2',
    [headline.cls('heading'), text.cls('boldWeight'), headline.cls('italic')].join(' ').trim(),
    title,
  );
  heading.style.cssText = '--fs:var(--font-size-16);--lh:var(--line-height-16)';
  const header = element('div', frame.cls('header', 'compact'));
  const titleSlot = element('div', frame.cls('title'));
  const titleRow = element('div', card.cls('header'));
  const content = element('div', card.cls('headerContent'));
  content.append(heading);
  icon.className = card.cls('icon');
  titleRow.append(icon, content);
  titleSlot.append(titleRow);
  header.append(titleSlot);
  const body = element('div');
  inner.append(header, element('div', frame.cls('dividerWrapper')), body);
  outer.append(inner);
  border.append(outer);
  widget.append(border);
  root.append(widget);
  return { root, body, inner, header, titleRow, content, styles };
}
