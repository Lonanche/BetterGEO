import { element } from './dom';
import { nativeStyles } from './native-styles';
/** Native profile card shell, with content supplied by the feature. */
export function profileWidget(title: string, icon: HTMLImageElement) {
  const styles = nativeStyles(),
    c = styles.resolve;
  const root = element('div', c('profile-v2_widgetRow__n1A_N'));
  const widget = element('div', c('widget_root__KcxU_', 'widget_compact__eg_L_'));
  const border = element('div', c('widget_widgetBorder__aJQpv', 'widget_hasLoaded__0Izv8'));
  const outer = element('div', c('widget_widgetOuter__SOAB_'));
  const inner = element('div', c('widget_widgetInner__qg276'));
  const heading = element(
    'h2',
    c('headline_heading__Bc8S9', 'shared_boldWeight__VXL2d', 'headline_italic__im8EF'),
    title,
  );
  heading.style.cssText = '--fs:var(--font-size-16);--lh:var(--line-height-16)';
  const header = element('div', c('widget_header___ZOfT', 'widget_compact__eg_L_'));
  const titleSlot = element('div', c('widget_title___eiUb'));
  const titleRow = element('div', c('widget_header__8mkus'));
  const content = element('div', c('widget_headerContent__Ljohq'));
  content.append(heading);
  icon.className = c('widget_icon__b0v5w');
  titleRow.append(icon);
  titleRow.append(content);
  titleSlot.append(titleRow);
  header.append(titleSlot);
  const body = element('div');
  inner.append(header, element('div', c('widget_dividerWrapper__tCjRQ')), body);
  outer.append(inner);
  border.append(outer);
  widget.append(border);
  root.append(widget);
  return { root, body, inner, header, content, styles };
}
