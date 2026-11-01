export interface MountResult {
  element: HTMLElement;
  dispose(): void;
}

interface HostLike {
  signal?: AbortSignal;
  ui?: {make?: (tag: string, className?: string, text?: string) => HTMLElement};
  storage: Record<string, unknown>;
  w?: {
    title?: string;
    ownerSub?: string;
    launchContext?: {version: 1; storage: 'mirror'; path: string; owner: string};
  };
}

function makeFallback(tag: string, className = '', text = ''): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

/** Synchronous entry. The Phaser engine starts after the window shell exists. */
export function mount(host: HostLike): MountResult {
  const make = typeof host?.ui?.make === 'function' ? host.ui.make : makeFallback;
  const body = make('div', 'window-content snake-garden');
  body.dataset.game = 'snake-garden';
  const loading = make('div', 'snake-status', 'Loading Snake Garden…');
  body.append(loading);

  const controller = new AbortController();
  let disposed = false;
  let view: {dispose(): void} | null = null;
  const abort = () => controller.abort(host.signal?.reason || 'View removed');
  host.signal?.addEventListener('abort', abort, {once: true});
  if (host.signal?.aborted) abort();

  queueMicrotask(() => {
    void import('./view/run.js')
      .then(async ({startView}) => {
        if (disposed || controller.signal.aborted) return;
        const started = await startView(body, controller.signal, host as never);
        if (disposed || controller.signal.aborted) {
          started.dispose();
          return;
        }
        view = started;
        loading.remove();
      })
      .catch(error => {
        if (!disposed && !controller.signal.aborted) {
          loading.textContent = 'Snake Garden could not start: ' +
            (error instanceof Error ? error.message : 'unknown error');
        }
      });
  });

  return {
    element: body,
    dispose() {
      if (disposed) return;
      disposed = true;
      host.signal?.removeEventListener('abort', abort);
      controller.abort('App closed');
      view?.dispose();
      view = null;
    },
  };
}
