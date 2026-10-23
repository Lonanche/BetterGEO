import type { PageWindow } from './geoguessr/types';
declare global {
  const unsafeWindow: PageWindow;
  function GM_getValue<T>(key: string, fallback: T): T;
  function GM_setValue(key: string, value: unknown): void;
  function GM_registerMenuCommand(label: string, callback: () => void): number;
  function GM_xmlhttpRequest(details: {
    method: string;
    url: string;
    timeout: number;
    anonymous?: boolean;
    onload(response: { status: number; responseText: string }): void;
    onerror(): void;
    ontimeout(): void;
    onabort(): void;
  }): { abort(): void };
}
