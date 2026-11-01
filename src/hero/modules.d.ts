// Модули 3D-сцены написаны на JS (перенесены из первой версии hero); здесь — их внешние контракты.
declare module '@/hero/scene.js' {
  import type {PerspectiveCamera} from 'three';
  export interface SceneApi {
    camera: PerspectiveCamera;
    model: unknown;
    state: {reducedMotion: boolean; focusModule: string | null; onPulse: ((k: number) => void) | null};
    resize(): void;
    load(onProgress: (p: number) => void): Promise<unknown>;
    warmup(): void;
    update(dt: number): void;
    render(): void;
    reportFrame(dt: number): void;
    setFrameShift(x: number, y: number): void;
    dispose?(): void;
  }
  export function createScene(canvas: HTMLCanvasElement, opts: {reducedMotion: boolean; isMobile: boolean}): SceneApi;
}
declare module '@/hero/director.js' {
  import type {PerspectiveCamera} from 'three';
  export interface TransitionInfo {from: number; to: number; duration: number; reduced: boolean}
  export interface Director {
    readonly stage: number;
    readonly busy: boolean;
    stops: Array<{module?: string}>;
    step(dir: number): boolean;
    goTo(stage: number): void;
    update(dt: number): void;
    setAspect(a: number): void;
    setReduced(r: boolean): void;
    setPointer(x: number, y: number): void;
  }
  export function createDirector(
    camera: PerspectiveCamera,
    model: unknown,
    opts: {
      setFrameShift: (x: number, y: number) => void;
      onStart: (t: TransitionInfo) => void;
      onArrive: (stage: number, chained: boolean) => void;
    },
  ): Director;
}
declare module '@/hero/input.js' {
  export function createInput(
    target: HTMLElement,
    opts: {canStep: () => boolean; step: (dir: number) => boolean; onActivity?: () => void},
  ): {arrived(): void; dispose(): void};
}
declare module '@/hero/audio.js' {
  export interface AudioApi {
    readonly enabled: boolean;
    enable(): Promise<void>;
    disable(): void;
    setHidden(h: boolean): void;
    whoosh(duration: number, dir: number): void;
    arrive(focus: boolean): void;
    pulse(k: number): void;
  }
  export function createAudio(): AudioApi;
}
