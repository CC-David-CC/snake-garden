import * as Phaser from 'phaser';
import {SynthAudio} from '../audio/synth.js';
import {SnakeSession, gardenConfig, type DirectionName, type Mode, type Speed} from '../model/snake.js';
import {decodeSave, encodeSave, sessionFromSave} from '../model/save.js';

interface FileInfo {
  data: Uint8Array;
  version: string;
  status?: string;
  bytes?: number;
}

interface FileContext {
  owner: string;
  valid(): boolean;
  path(value: string): string;
  name(value: string): string;
  files: {
    read(path: string): Promise<FileInfo>;
    write(path: string, data: Uint8Array | string, expected: string | null): Promise<FileInfo>;
    stat?(path: string): Promise<FileInfo>;
    subscribe?(callback: () => void): () => void;
  };
}

interface Host {
  signal: AbortSignal;
  w?: {
    title?: string;
    snakeGarden?: {dirty: boolean};
    ownerSub?: string;
    launchContext?: {version: 1; storage: 'mirror'; path: string; owner: string};
  };
  ui: {
    make(tag: string, className?: string, text?: string): HTMLElement;
    confirm?(message: string, options?: unknown): Promise<boolean>;
  };
  storage: {
    signedInSubject(): string | null;
    mirrorFileContext(): Promise<FileContext>;
    pickFile?(options: unknown): Promise<string | null>;
    pickFolder?(options: unknown): Promise<string | null>;
  };
}

export interface ViewHandle {
  dispose(): void;
}

const COLORS = {
  standard: {field: 0x20362a, grid: 0x314b3b, rock: 0x493f46, head: 0xf2d760, body: 0x65c777, food: 0xf26b68},
  high: {field: 0x090d0a, grid: 0xffffff, rock: 0x777077, head: 0xffff6e, body: 0x69ff8a, food: 0xff7777},
};

class GardenScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly current: () => SnakeSession,
    private readonly highContrast: () => boolean,
    private readonly changed: (session: SnakeSession, before: {score: number; over: boolean; won: boolean}) => void,
  ) {
    super({key: 'snake-garden'});
  }

  create(): void {
    this.graphics = this.add.graphics();
  }

  update(_time: number, delta: number): void {
    const session = this.current();
    const before = {score: session.score, over: session.over, won: session.won};
    session.advance(delta);
    this.changed(session, before);
    this.draw(session);
  }

  private draw(session: SnakeSession): void {
    const colors = COLORS[this.highContrast() ? 'high' : 'standard'];
    const cell = 32;
    this.graphics.clear();
    this.graphics.fillStyle(colors.field, 1);
    this.graphics.fillRect(0, 0, 512, 512);
    this.graphics.lineStyle(1, colors.grid, .28);
    for (let i = 0; i <= session.gridCols; i += 1) {
      this.graphics.lineBetween(i * cell, 0, i * cell, 512);
      this.graphics.lineBetween(0, i * cell, 512, i * cell);
    }
    for (const rock of session.rocks) {
      this.graphics.fillStyle(colors.rock, 1);
      this.graphics.fillRoundedRect(rock.x * cell + 3, rock.y * cell + 3, cell - 6, cell - 6, 7);
      this.graphics.fillStyle(0x746a70, 1);
      this.graphics.fillCircle(rock.x * cell + 12, rock.y * cell + 11, 3);
    }
    session.snake.forEach((part, index) => {
      this.graphics.fillStyle(index === 0 ? colors.head : colors.body, 1);
      this.graphics.fillRoundedRect(part.x * cell + 3, part.y * cell + 3, cell - 6, cell - 6, index === 0 ? 10 : 7);
    });
    if (session.food) {
      this.graphics.fillStyle(colors.food, 1);
      this.graphics.fillCircle(session.food.x * cell + 16, session.food.y * cell + 16, 9);
      this.graphics.fillStyle(0x7acb5a, 1);
      this.graphics.fillEllipse(session.food.x * cell + 19, session.food.y * cell + 8, 8, 4);
    }
  }
}

function seed(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `${bytes[0]}-${bytes[1]}`;
}

function makeButton(doc: Document, label: string, onClick: () => void): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

export async function startView(container: HTMLElement, signal: AbortSignal, host: Host): Promise<ViewHandle> {
  const doc = container.ownerDocument;
  const accountOwner = host.storage.signedInSubject();
  if (!accountOwner) throw new Error('Sign in to play.');
  const owner: string = accountOwner;
  const state = host.w?.snakeGarden ?? {dirty: false};
  if (host.w) {
    host.w.snakeGarden = state;
    host.w.ownerSub = owner;
  }
  const audio = new SynthAudio();
  let session = new SnakeSession(seed(), 'campaign', 0);
  session.speed = 2;
  session.pause();
  let disposed = false;
  let busy = false;
  let dirty = false;
  let revision = 0;
  let savedPath: string | null = null;
  let savedVersion: string | null = null;
  let watchSerial = 0;
  let unwatch = () => {};
  let lastSummary = '';
  let lastScore = 0;
  let swipe: {id: number; x: number; y: number} | null = null;

  const valid = () => !disposed && !signal.aborted && container.isConnected && owner === host.storage.signedInSubject();
  const make = (tag: string, className = '', text = '') => {
    const element = doc.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const setDirty = (value: boolean) => {
    dirty = value;
    state.dirty = value;
  };
  const mark = () => {
    setDirty(true);
    revision += 1;
  };

  const header = make('div', 'snake-header');
  const modeLabel = make('label', 'snake-field', 'Mode ');
  const mode = doc.createElement('select');
  mode.setAttribute('aria-label', 'Game mode');
  for (const [value, label] of [['campaign', 'Campaign'], ['classic', 'Classic endless']] as const) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  modeLabel.append(mode);
  const gardenLabel = make('label', 'snake-field', 'Garden ');
  const garden = doc.createElement('select');
  garden.setAttribute('aria-label', 'Garden');
  for (let i = 0; i < 6; i += 1) {
    const option = doc.createElement('option');
    option.value = String(i);
    option.textContent = `Garden ${i + 1} · goal ${gardenConfig(i).goal}`;
    garden.append(option);
  }
  gardenLabel.append(garden);
  const speedLabel = make('label', 'snake-field', 'Speed ');
  const speed = doc.createElement('select');
  speed.setAttribute('aria-label', 'Speed');
  for (const value of [1, 2, 3] as const) {
    const option = doc.createElement('option');
    option.value = String(value);
    option.textContent = ['Slow', 'Normal', 'Fast'][value - 1];
    speed.append(option);
  }
  speed.value = '2';
  speedLabel.append(speed);
  const summary = make('div', 'snake-summary', 'Ready. Start a garden.');
  header.append(modeLabel, gardenLabel, speedLabel);

  const actions = make('div', 'snake-actions');
  const start = makeButton(doc, 'Start game', () => void startGame());
  const pause = makeButton(doc, 'Resume', togglePause);
  const openButton = makeButton(doc, 'Open', () => void open());
  const saveButton = makeButton(doc, 'Save', () => void save());
  actions.append(start, pause, openButton, saveButton);

  const play = make('div', 'snake-play');
  const board = make('div', 'snake-board');
  board.tabIndex = 0;
  board.setAttribute('aria-label', 'Snake Garden board. Arrow keys or W A S D turn; P pauses.');
  const guide = make('aside', 'snake-guide');
  const guideArt = make('div', 'snake-guide-art');
  guideArt.setAttribute('aria-hidden', 'true');
  guideArt.innerHTML = '<span class="snake-sprout">◆</span><span class="snake-face"><i></i><i></i></span><span class="snake-pot"></span>';
  const guideLabel = make('div', 'snake-guide-label', 'Garden guide');
  const guideNote = make('div', 'snake-rive-pending', 'Rive artwork pending; procedural guide shown.');
  const goal = make('div', 'snake-goal');
  guide.append(guideArt, guideLabel, guideNote, goal);
  play.append(board, guide);

  const dpad = make('div', 'snake-dpad');
  const directionButton = (label: string, direction: DirectionName) => {
    const button = makeButton(doc, label, () => turn(direction));
    button.className = 'snake-direction snake-' + direction;
    return button;
  };
  dpad.append(
    make('span', 'snake-dpad-spacer'),
    directionButton('▲ Up', 'up'),
    make('span', 'snake-dpad-spacer'),
    directionButton('◀ Left', 'left'),
    make('span', 'snake-dpad-center', '🐍'),
    directionButton('Right ▶', 'right'),
    make('span', 'snake-dpad-spacer'),
    directionButton('▼ Down', 'down'),
    make('span', 'snake-dpad-spacer'),
  );

  const settings = doc.createElement('details');
  settings.className = 'snake-settings';
  const settingsSummary = make('summary', '', 'Settings');
  const contrastLabel = make('label', 'snake-setting', 'High contrast ');
  const contrast = doc.createElement('input');
  contrast.type = 'checkbox';
  contrast.setAttribute('aria-label', 'High contrast');
  contrastLabel.prepend(contrast);
  const motionLabel = make('label', 'snake-setting', 'Reduce motion ');
  const motion = doc.createElement('input');
  motion.type = 'checkbox';
  motion.setAttribute('aria-label', 'Reduce motion');
  motionLabel.prepend(motion);
  const soundLabel = make('label', 'snake-setting', 'Sound ');
  const sound = doc.createElement('input');
  sound.type = 'checkbox';
  sound.setAttribute('aria-label', 'Sound');
  soundLabel.prepend(sound);
  const volumeLabel = make('label', 'snake-setting', 'Volume ');
  const volume = doc.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.step = '5';
  volume.value = '35';
  volume.setAttribute('aria-label', 'Volume');
  volumeLabel.append(volume);
  settings.append(settingsSummary, contrastLabel, motionLabel, soundLabel, volumeLabel);

  const help = doc.createElement('details');
  help.className = 'snake-help';
  help.append(
    make('summary', '', 'How to play'),
    make('p', '', 'Use the direction buttons, swipe the board, or use arrow keys/WASD. One turn is queued per movement tick. Eat seedlings to grow and reach the garden goal. The tail may move into its old cell, but rocks and collision end the round.'),
  );

  const saveDetails = doc.createElement('details');
  saveDetails.className = 'snake-save';
  const saveSummary = make('summary', '', 'Save location');
  const saveFields = make('div', 'snake-save-fields');
  const path = doc.createElement('input');
  path.setAttribute('aria-label', 'Snake save path');
  path.value = '/Snake Garden.game.json';
  const folder = makeButton(doc, 'Choose folder', () => void chooseFolder());
  saveFields.append(path, folder);
  saveDetails.append(saveSummary, saveFields);

  const warning = make('div', 'snake-warning');
  warning.setAttribute('role', 'status');
  warning.hidden = true;
  const status = make('div', 'app-status', 'Start a garden when ready.');
  status.setAttribute('role', 'status');
  container.append(header, actions, summary, play, dpad, help, settings, saveDetails, warning, status);

  const savedSettings = readSettings();
  sound.checked = savedSettings.sound;
  volume.value = String(savedSettings.volume);
  motion.checked = savedSettings.motion;
  contrast.checked = savedSettings.contrast;
  audio.setVolume(savedSettings.volume / 100);
  audio.setMuted(!sound.checked);
  volume.disabled = !sound.checked;
  container.classList.toggle('snake-reduced-motion', motion.checked);

  const scene = new GardenScene(
    () => session,
    () => contrast.checked,
    (current, before) => changed(current, before),
  );
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: board,
    width: 512,
    height: 512,
    backgroundColor: '#20362a',
    audio: {noAudio: true},
    scale: {mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH},
    scene,
  });
  const resizeObserver = new ResizeObserver(() => {
    if (!disposed && game.isBooted) {
      game.scale.getParentBounds();
      game.scale.refresh();
    }
  });
  resizeObserver.observe(board);

  function announce(message: string): void {
    if (valid()) status.textContent = message;
  }

  function refresh(): void {
    const target = session.mode === 'campaign' ? gardenConfig(session.gardenId).goal : 0;
    const phase = session.won ? 'Garden complete!' : session.over ? 'Collision — restart to try again.' :
      session.paused ? 'Paused' : 'Playing';
    const value = `${session.mode === 'campaign' ? `Growth ${session.growth}/${target}` : `Score ${session.score}`} · ` +
      `Speed ${['Slow', 'Normal', 'Fast'][session.speed - 1]} · ${phase}`;
    if (value !== lastSummary) {
      lastSummary = value;
      summary.textContent = value;
    }
    pause.textContent = session.paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-label', pause.textContent);
    pause.disabled = session.over;
    goal.textContent = session.mode === 'campaign'
      ? `${session.growth} of ${target} seedlings`
      : `Endless · ${session.score} points`;
    garden.disabled = session.mode === 'classic';
    lastScore = session.score;
  }

  function turn(direction: DirectionName): void {
    if (!valid() || busy || session.paused || session.over) return;
    if (session.queueTurn(direction)) { mark(); audio.eat(); }
  }

  function togglePause(): void {
    if (busy || session.over) return;
    if (session.paused) {
      if (sound.checked) audio.unlock();
      session.resume();
      mark();
      announce('Playing. Garden guide is watching your route.');
    } else {
      session.pause();
      announce('Game paused. Press Resume to continue.');
    }
    refresh();
  }

  async function startGame(): Promise<void> {
    if (!valid() || busy) return;
    busy = true; session.pause(); refresh();
    try {
    if (dirty && !await host.ui.confirm?.('Start a new game and discard unsaved progress?', {
      title: 'Unsaved garden progress', confirmLabel: 'Start new game', cancelLabel: 'Keep game',
      danger: true, signal,
    })) {
      announce('Game paused. Press Resume to continue.');
      return;
    }
    if (!valid()) return;
    session = new SnakeSession(seed(), mode.value as Mode, Number(garden.value));
    session.speed = Number(speed.value) as Speed;
    session.resume();
    savedPath = null;
    savedVersion = null;
    watchSerial += 1;
    unwatch();
    setDirty(true);
    revision += 1;
    warning.hidden = true;
    if (host.w) {
      delete host.w.launchContext;
      host.w.title = 'Snake Garden';
    }
    if (sound.checked) audio.unlock();
    lastSummary = '';
    refresh();
    announce(session.mode === 'campaign'
      ? `Garden ${session.gardenId + 1} started. Reach ${gardenConfig(session.gardenId).goal} seedlings.`
      : 'Classic endless garden started. Press Pause when needed.');
    board.focus({preventScroll: true});
    } finally { busy = false; }
  }

  function changed(current: SnakeSession, before: {score: number; over: boolean; won: boolean}): void {
    if (current.score > before.score) {
      mark();
      if (sound.checked) audio.eat();
    }
    if (current.over && !before.over) {
      mark();
      if (sound.checked) (current.won ? audio.win() : audio.fail());
      announce(current.won ? 'Garden complete! Save or start another garden.' : 'Collision. Start another garden to try again.');
    }
    refresh();
  }

  function watch(context: FileContext, pathValue: string, version: string): void {
    unwatch();
    const serial = ++watchSerial;
    const check = async () => {
      if (!valid() || !context.valid() || savedPath !== pathValue || savedVersion !== version) return;
      try {
        const current = context.files.stat ? await context.files.stat(pathValue) : await context.files.read(pathValue);
        if (serial === watchSerial && (current.status === 'conflict' || current.version !== version)) {
          warning.textContent = current.status === 'conflict'
            ? 'This save has conflicting copies. Your garden is unchanged; resolve them in Files.'
            : 'The saved garden changed. Your current game is unchanged; save a copy or reopen it.';
          warning.hidden = false;
        }
      } catch {
        if (serial === watchSerial) {
          warning.textContent = 'The saved garden is unavailable. Your current game is unchanged.';
          warning.hidden = false;
        }
      }
    };
    unwatch = context.files.subscribe?.(check) || (() => {});
    queueMicrotask(check);
  }

  async function save(): Promise<void> {
    if (!valid() || busy) return;
    busy = true;
    const capturedRevision = revision;
    const requested = path.value;
    session.pause();
    refresh();
    state.dirty = true;
    const snapshot = encodeSave(session);
    try {
      const context = await host.storage.mirrorFileContext();
      const target = context.path(requested);
      if (!target.toLowerCase().endsWith('.game.json')) throw new Error('Use a .game.json file name.');
      let expected: string | null = null;
      try {
        const existing = context.files.stat ? await context.files.stat(target) : await context.files.read(target);
        if (existing.status === 'conflict') throw new Error('Resolve the conflict in Files first.');
        if (target === savedPath && savedVersion) {
          if (existing.version !== savedVersion) throw new Error('The saved garden changed. Save a copy or reopen it.');
        } else {
          const replace = await host.ui.confirm?.('Replace ' + target + '?', {
            title: 'Replace saved garden', confirmLabel: 'Replace', cancelLabel: 'Cancel', danger: true, signal,
          });
          if (!replace) {
            announce('Save cancelled. Game remains paused.');
            return;
          }
        }
        expected = existing.version;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'File not found.') throw error;
        if (target === savedPath && savedVersion) throw new Error('The saved garden was removed. Save a copy or reopen it.');
      }
      if (!valid() || !context.valid()) return;
      const result = await context.files.write(target, snapshot, expected);
      if (!valid() || !context.valid()) return;
      savedPath = target;
      savedVersion = result.version;
      path.value = target;
      if (host.w) {
        host.w.launchContext = Object.freeze({version: 1, storage: 'mirror', path: target, owner});
        host.w.title = target.split('/').pop() + ' — Snake Garden';
      }
      setDirty(revision !== capturedRevision);
      watch(context, target, result.version);
      announce(result.status === 'conflict'
        ? 'Saved on this device with conflicting copies. Resolve them in Files.'
        : 'Saved to My files; syncing with the server.');
    } catch (error) {
      announce('Could not save: ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      state.dirty = dirty;
      busy = false;
    }
  }

  async function open(selected?: string): Promise<void> {
    if (!valid() || busy) return;
    busy = true;
    session.pause();
    refresh();
    try {
      if (dirty && !await host.ui.confirm?.('Open a saved garden and discard current progress?', {
        title: 'Unsaved garden progress', confirmLabel: 'Discard progress', cancelLabel: 'Keep garden',
        danger: true, signal,
      })) {
        announce('Game paused. Press Resume to continue.');
        return;
      }
      const choice = selected || await host.storage.pickFile?.({extensions: ['.json'], signal});
      if (!choice || !valid()) return;
      const context = await host.storage.mirrorFileContext();
      const target = context.path(choice);
      const file = await context.files.read(target);
      if (file.status === 'conflict') throw new Error('Resolve the conflict in Files first.');
      if (file.data.byteLength > 8 * 1024 * 1024) throw new Error('Save file is too large.');
      const restored = sessionFromSave(decodeSave(new TextDecoder('utf-8', {fatal: true}).decode(file.data)));
      if (!valid() || !context.valid()) return;
      session.applySnapshot(restored.snapshot());
      session.pause();
      mode.value = session.mode;
      garden.value = String(session.gardenId);
      speed.value = String(session.speed);
      savedPath = target;
      savedVersion = file.version;
      path.value = target;
      setDirty(false);
      warning.hidden = true;
      if (host.w) {
        host.w.launchContext = Object.freeze({version: 1, storage: 'mirror', path: target, owner});
        host.w.title = target.split('/').pop() + ' — Snake Garden';
      }
      watch(context, target, file.version);
      lastSummary = '';
      refresh();
      announce('Garden loaded and paused. Press Resume to play.');
    } catch (error) {
      announce('Could not open garden: ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      busy = false;
    }
  }

  async function chooseFolder(): Promise<void> {
    try {
      const folderPath = await host.storage.pickFolder?.({signal});
      if (folderPath === null || folderPath === undefined || !valid()) return;
      const context = await host.storage.mirrorFileContext();
      if (!valid() || !context.valid()) return;
      path.value = context.path((folderPath === '/' ? '' : folderPath) + '/' +
        context.name(path.value.split('/').pop() || 'Snake Garden.game.json'));
    } catch (error) {
      announce('Could not choose folder: ' + (error instanceof Error ? error.message : 'unknown error'));
    }
  }

  const keyboard = (event: KeyboardEvent): void => {
    const directions: Record<string, DirectionName> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const direction = directions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction) {
      event.preventDefault();
      turn(direction);
    } else if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      event.preventDefault();
      togglePause();
    }
  };
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    swipe = {id: event.pointerId, x: event.clientX, y: event.clientY};
    board.setPointerCapture(event.pointerId);
  };
  const pointerUp = (event: PointerEvent): void => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
  };
  const pointerCancel = (): void => {
    swipe = null;
  };
  const suspend = (): void => {
    if (!session.over) session.pause();
    refresh();
    announce('Game paused. Press Resume when ready.');
  };
  const visibility = (): void => {
    if (doc.hidden) suspend();
  };
  const saveSettings = (): void => {
    audio.setMuted(!sound.checked);
    audio.setVolume(Number(volume.value) / 100);
    volume.disabled = !sound.checked;
    try {
      localStorage.setItem('snake-garden-settings:' + owner, JSON.stringify({
        sound: sound.checked, volume: Number(volume.value), motion: motion.checked, contrast: contrast.checked,
      }));
    } catch {}
  };

  sound.addEventListener('change', () => {
    if (sound.checked) audio.unlock();
    saveSettings();
  });
  volume.addEventListener('input', saveSettings);
  motion.addEventListener('change', () => {
    container.classList.toggle('snake-reduced-motion', motion.checked);
    saveSettings();
  });
  contrast.addEventListener('change', saveSettings);
  mode.addEventListener('change', () => {
    garden.disabled = mode.value === 'classic';
  });
  board.addEventListener('keydown', keyboard);
  board.addEventListener('pointerdown', pointerDown);
  board.addEventListener('pointerup', pointerUp);
  board.addEventListener('pointercancel', pointerCancel);
  const desktopWindow = container.closest('.window');
  const windowObserver = desktopWindow ? new MutationObserver(() => {
    if (desktopWindow.hasAttribute('hidden') || !desktopWindow.classList.contains('focused') || desktopWindow.classList.contains('rolled')) suspend();
  }) : null;
  windowObserver?.observe(desktopWindow!, {attributes: true, attributeFilter: ['class', 'hidden']});
  window.addEventListener('blur', suspend);
  doc.addEventListener('visibilitychange', visibility);
  refresh();

  if (host.w?.launchContext?.storage === 'mirror' && host.w.launchContext.owner === owner) {
    path.value = host.w.launchContext.path;
    queueMicrotask(() => void open(host.w!.launchContext!.path));
  }

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      watchSerial += 1;
      unwatch();
      resizeObserver.disconnect();
      board.removeEventListener('keydown', keyboard);
      board.removeEventListener('pointerdown', pointerDown);
      board.removeEventListener('pointerup', pointerUp);
      board.removeEventListener('pointercancel', pointerCancel);
      windowObserver?.disconnect();
      window.removeEventListener('blur', suspend);
      doc.removeEventListener('visibilitychange', visibility);
      audio.dispose();
      game.destroy(true);
      container.replaceChildren();
    },
  };

  function readSettings(): {sound: boolean; volume: number; motion: boolean; contrast: boolean} {
    try {
      const value = JSON.parse(localStorage.getItem('snake-garden-settings:' + owner) || 'null');
      if (value && typeof value.sound === 'boolean' && Number.isFinite(value.volume)) {
        return {
          sound: value.sound,
          volume: Math.max(0, Math.min(100, value.volume)),
          motion: value.motion === true,
          contrast: value.contrast === true,
        };
      }
    } catch {}
    return {sound: false, volume: 35, motion: false, contrast: false};
  }
}
