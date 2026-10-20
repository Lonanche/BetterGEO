import { element } from './dom';
import type { FeatureManager } from './settings';
export function openSettings(manager: FeatureManager) {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => openSettings(manager), { once: true });
    return;
  }
  const existing = document
    .getElementById('bettergeo-settings-host')
    ?.shadowRoot?.querySelector('dialog');
  if (existing) {
    existing.querySelector<HTMLElement>('h2')?.focus();
    return;
  }
  // Shadow DOM keeps GeoGuessr styles from changing the settings controls.
  const host = element('div');
  host.id = 'bettergeo-settings-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = element('style');
  style.textContent = `
:host { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
dialog {
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  padding: 0;
  border: 1px solid #ffffff12;
  border-radius: 20px;
  background: #18181d;
  color: #f1f1f4;
  font: 14px/1.5 system-ui, sans-serif;
  box-shadow: 0 24px 80px #0006;
  overflow: auto;
}
dialog::backdrop { background: #09090db3; backdrop-filter: blur(6px); }
.panel { display: flex; flex-direction: column; }
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 20px;
}
h2 { outline: none; margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -.7px; }
.subtitle { margin: 2px 0 0; color: #94949f; font-size: 12px; }
.features { padding: 0 12px; }
label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background .15s;
}
label:hover { background: #ffffff04; }
label + label { border-top: 1px solid #ffffff08; }
.copy { min-width: 0; }
strong { display: block; font-size: 13px; font-weight: 550; }
small { display: block; margin-top: 4px; color: #94949f; font-size: 12px; line-height: 1.5; }
input {
  appearance: none;
  flex: 0 0 34px;
  width: 34px;
  height: 20px;
  margin: 0;
  border: 1px solid #ffffff12;
  border-radius: 20px;
  background: #393940;
  cursor: pointer;
  transition: background .15s;
}
input::before {
  content: '';
  display: block;
  width: 14px;
  height: 14px;
  margin: 2px;
  border-radius: 50%;
  background: #e7e7ec;
  transition: transform .15s;
}
input:checked { background: #a491f2; border-color: transparent; }
input:checked::before { transform: translateX(14px); background: #fff; }
button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #94949f;
  cursor: pointer;
}
button svg { width: 16px; height: 16px; pointer-events: none; }
button:hover { background: #ffffff09; color: #fff; }
input:focus-visible, button:focus-visible { outline: 2px solid #b5a3ff; outline-offset: 4px; }
footer { padding: 16px 24px 20px; color: #787884; font-size: 11px; }
@media (prefers-reduced-motion: reduce) { label, input, input::before { transition: none; } }
`;
  const dialog = element('dialog');
  dialog.id = 'bettergeo-settings';
  dialog.setAttribute('aria-label', 'BetterGEO settings');
  const panel = element('div', 'panel');
  const header = element('header');
  const heading = element('div');
  const title = element('h2', '', 'BetterGEO');
  title.tabIndex = -1;
  heading.append(title, element('p', 'subtitle', 'Settings'));
  header.append(heading);
  const close = element('button');
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.75');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(icon.namespaceURI, 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  icon.append(path);
  close.append(icon);
  close.setAttribute('aria-label', 'Close settings');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  header.append(close);
  panel.append(header);
  const features = element('div', 'features');
  for (const feature of manager.features) {
    const label = element('label'),
      toggle = element('input');
    toggle.type = 'checkbox';
    toggle.checked = manager.enabled(feature.id);
    toggle.setAttribute('role', 'switch');
    const text = element('span', 'copy');
    text.append(element('strong', '', feature.name), element('small', '', feature.description));
    toggle.addEventListener('change', () => {
      try {
        manager.set(feature.id, toggle.checked);
      } catch (error) {
        toggle.checked = manager.enabled(feature.id);
        console.error('[BetterGEO settings]', error);
      }
    });
    label.append(text, toggle);
    features.append(label);
  }
  panel.append(features, element('footer', '', 'Changes save automatically.'));
  dialog.append(panel);
  dialog.addEventListener('close', () => host.remove(), { once: true });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  shadow.append(style, dialog);
  document.body.append(host);
  dialog.showModal();
  title.focus({ preventScroll: true });
}
