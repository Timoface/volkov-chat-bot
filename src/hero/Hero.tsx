import {useEffect, useRef, useState} from 'react';
import {ArrowDownIcon, MessageCircleIcon, Volume2Icon, VolumeXIcon, WindIcon} from 'lucide-react';

import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import {createScene, type SceneApi} from '@/hero/scene.js';
import {createDirector, type Director, type TransitionInfo} from '@/hero/director.js';
import {createInput} from '@/hero/input.js';
import {createAudio, type AudioApi} from '@/hero/audio.js';
import {useMediaQuery} from '@/hooks/useMediaQuery';
import {VolkovWordmark} from '@/brand/VolkovWordmark';

const STAGES = [
  {label: 'Карта', kicker: '01 · Карта служб', text: 'Одна точка входа ко всем службам компании'},
  {label: 'Кадры', kicker: '02 · Кадры', text: 'Отпуск, справки, график — ответ за секунды, без очереди в кабинет'},
  {label: 'Юристы', kicker: '03 · Юристы', text: 'Подскажет, к какому специалисту идти с вашим вопросом'},
  {label: 'Кабинеты', kicker: '04 · Кабинеты и сервис', text: 'Нужный человек, кабинет и этаж — без лишних поисков'},
  {label: 'Доступ', kicker: '05 · Права доступа', text: 'Только актуальная информация — в рамках ваших прав'},
];

type Phase = 'loading' | 'ready' | 'error';

export function Hero({chatOpen, onOpenChat}: {chatOpen: boolean; onOpenChat: () => void}) {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directorRef = useRef<Director | null>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const audioRef = useRef<AudioApi | null>(null);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0); // куда едет или где стоит камера
  const [settled, setSettled] = useState(true);
  const [sound, setSound] = useState(false);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [reducedPref, setReducedPref] = useState<boolean | null>(null);
  const reduced = reducedPref ?? systemReduced;
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const hero = heroRef.current!;
    const isMobile = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
    let disposed = false;
    let sceneApi: SceneApi;
    try {
      sceneApi = createScene(canvas, {reducedMotion: reduced, isMobile});
    } catch (err) {
      console.error(err);
      setPhase('error');
      return;
    }
    sceneRef.current = sceneApi;
    const audio = createAudio();
    audioRef.current = audio;
    sceneApi.resize();

    let director: Director | null = null;
    let input: ReturnType<typeof createInput> | null = null;
    let raf = 0;
    let last = 0;

    const onResize = () => {
      sceneApi.resize();
      director?.setAspect(sceneApi.camera.aspect);
    };
    window.addEventListener('resize', onResize);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      sceneApi.update(dt);
      director!.update(dt);
      sceneApi.render();
      sceneApi.reportFrame(dt);
    };
    const start = () => {
      if (raf || disposed) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        audio.setHidden(true);
      } else if (director) {
        start();
        audio.setHidden(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      director?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    window.addEventListener('pointermove', onPointer, {passive: true});

    Promise.all([sceneApi.load((p) => setProgress(p * 0.86)), document.fonts?.ready]).then(
      () => {
        if (disposed) return;
        director = createDirector(sceneApi.camera, sceneApi.model, {
          setFrameShift: sceneApi.setFrameShift,
          onStart: (t: TransitionInfo) => {
            setSettled(false);
            setStage(t.to);
            sceneApi.state.focusModule = null;
            audio.whoosh(t.reduced ? 0.6 : t.duration, t.to > t.from ? 1 : -1);
            if (t.reduced) {
              setFade(true);
              setTimeout(() => setFade(false), t.duration * 450);
            }
          },
          onArrive: (s: number, chained: boolean) => {
            input?.arrived();
            sceneApi.state.focusModule = director!.stops[s].module ?? null;
            if (chained) return;
            audio.arrive(!!director!.stops[s].module);
            setStage(s);
            setSettled(true);
          },
        });
        directorRef.current = director;
        director.setAspect(sceneApi.camera.aspect);
        director.setReduced(sceneApi.state.reducedMotion);
        director.update(0);
        setProgress(0.94);
        // компилируем шейдеры до показа, чтобы первый переход не дёргался
        setTimeout(() => {
          if (disposed) return;
          sceneApi.warmup();
          setProgress(1);
          input = createInput(hero, {
            canStep: () => !chatOpenRef.current && !!director && !director.busy,
            step: (dir) => director!.step(dir),
          });
          sceneApi.state.onPulse = (k) => audio.pulse(k);
          if (new URLSearchParams(location.search).has('debug')) {
            Object.assign(window, {
              __volkov: {
                get stage() {
                  return director!.stage;
                },
                get busy() {
                  return director!.busy;
                },
                tick(dt = 1 / 60) {
                  sceneApi.update(dt);
                  director!.update(dt);
                },
              },
            });
          }
          setTimeout(() => {
            if (disposed) return;
            setPhase('ready');
            if (!document.hidden) start();
          }, 450);
        }, 30);
      },
      (err) => {
        console.error(err);
        if (!disposed) setPhase('error');
      },
    );

    return () => {
      disposed = true;
      stop();
      input?.dispose();
      audio.disable();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      sceneApi.dispose?.();
      directorRef.current = null;
      sceneRef.current = null;
    };
    // сцена создаётся один раз; смена reduced-motion применяется отдельным эффектом ниже
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.state.reducedMotion = reduced;
    directorRef.current?.setReduced(reduced);
  }, [reduced]);

  const toggleSound = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.enabled) {
      audio.disable();
      setSound(false);
    } else {
      await audio.enable();
      setSound(true);
    }
  };

  const goTo = (s: number) => {
    const d = directorRef.current;
    if (d && !d.busy) d.goTo(s);
  };
  const explore = () => directorRef.current?.stage === 0 && directorRef.current.step(1);

  const showIntro = stage === 0 && settled;
  const caption = stage > 0 && settled ? STAGES[stage - 1] : null;
  const ready = phase === 'ready';

  return (
    <main ref={heroRef} aria-label="Навигатор компании" className="fixed inset-0 h-dvh touch-none overflow-hidden select-none">
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block size-full" />
      <span aria-hidden="true" className="hero-veil pointer-events-none absolute inset-0" />
      <span
        aria-hidden="true"
        className={cn('pointer-events-none absolute inset-0 bg-background opacity-0 transition-opacity duration-300', fade && 'opacity-100')}
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-6 px-[var(--hero-gutter)] pt-5">
        <a href="#" aria-label="Волков групп — Навигатор компании" className="flex items-center gap-3">
          <VolkovWordmark />
          <span className="hidden flex-col border-l border-border pl-3 text-xs leading-tight tracking-[0.16em] text-muted-foreground uppercase sm:flex">
            <span>Навигатор</span>
            <span>компании</span>
          </span>
        </a>
        <nav aria-label="Разделы" className="hidden items-center gap-1 lg:flex">
          {[
            ['Как это работает', 1],
            ['Службы', 2],
            ['Безопасность', 5],
          ].map(([label, s]) => (
            <Button key={label} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => goTo(s as number)}>
              {label}
            </Button>
          ))}
        </nav>
        <span className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={reduced}
            title="Меньше движения: камера переключается мягкой сменой кадра"
            onClick={() => setReducedPref(!reduced)}
            className={cn('text-muted-foreground', reduced && 'text-foreground')}>
            <WindIcon data-icon="inline-start" />
            <span className="hidden sm:inline">{reduced ? 'Движение: мягко' : 'Движение'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={sound}
            aria-label={sound ? 'Выключить звук' : 'Включить звук'}
            onClick={toggleSound}
            className={cn('text-muted-foreground', sound && 'text-foreground')}>
            {sound ? <Volume2Icon data-icon="inline-start" /> : <VolumeXIcon data-icon="inline-start" />}
            <span className="hidden sm:inline">Звук</span>
          </Button>
          <Button size="sm" onClick={onOpenChat} className="ml-1">
            <MessageCircleIcon data-icon="inline-start" />
            Спросить
          </Button>
        </span>
      </header>

      <section
        aria-labelledby="hero-title"
        className={cn(
          'hero-copy absolute z-10 flex max-w-xl flex-col gap-5 transition-[opacity,translate] duration-700',
          showIntro && ready ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        )}>
        <p className="text-xs font-medium tracking-[0.22em] text-brand-text uppercase">Волков групп · внутренний помощник</p>
        <h1 id="hero-title" className="hero-title font-heading font-semibold text-balance">
          Навигатор компании
        </h1>
        <p className="max-w-md text-lg text-pretty text-muted-foreground">
          Спросите — и получите ответ или нужного специалиста за минуту. Кадры, юристы, техподдержка и кабинеты в одном окне.
        </p>
        <span className="flex flex-wrap gap-3">
          <Button size="lg" onClick={explore}>
            Исследовать навигатор
            <ArrowDownIcon data-icon="inline-end" />
          </Button>
          <Button size="lg" variant="outline" onClick={onOpenChat}>
            Задать вопрос
          </Button>
        </span>
      </section>

      <section
        aria-live="polite"
        className={cn(
          'hero-caption absolute z-10 flex max-w-sm flex-col gap-3 transition-[opacity,translate] duration-500',
          caption ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}>
        {caption && (
          <>
            <p className="text-xs font-medium tracking-[0.2em] text-brand-text uppercase">{caption.kicker}</p>
            <p className="font-heading text-2xl leading-snug font-medium text-balance sm:text-3xl">{caption.text}</p>
            {stage === 5 && (
              <Button className="self-start" onClick={onOpenChat}>
                <MessageCircleIcon data-icon="inline-start" />
                Задать вопрос навигатору
              </Button>
            )}
          </>
        )}
      </section>

      <nav aria-label="Этапы обзора" className="hero-progress absolute z-10">
        <ol className="flex gap-1">
          {STAGES.map((s, i) => {
            const n = i + 1;
            return (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => goTo(n)}
                  aria-current={stage === n ? 'step' : undefined}
                  aria-label={`Этап ${n}: ${s.label}`}
                  className="group flex min-h-11 min-w-11 flex-col items-center justify-center gap-1.5 px-1">
                  <span
                    className={cn(
                      'h-0.5 w-7 rounded-full bg-foreground/25 transition-colors duration-500',
                      n < stage && 'bg-foreground/60',
                      n === stage && 'bg-brand',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[0.6875rem] tracking-wide text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
                      n === stage && 'text-foreground opacity-100',
                    )}>
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <p
        aria-hidden="true"
        className={cn(
          'absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground uppercase transition-opacity duration-500 md:flex',
          showIntro && ready ? 'opacity-100' : 'opacity-0',
        )}>
        <span className="hero-mouse" />
        Прокрутите, чтобы продолжить
      </p>

      <Loader phase={phase} progress={progress} />
    </main>
  );
}

function Loader({phase, progress}: {phase: Phase; progress: number}) {
  const pct = Math.round(progress * 100);
  return (
    <section
      role="progressbar"
      aria-label="Загрузка навигатора"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn(
        'absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-background transition-opacity duration-700',
        phase === 'ready' && 'pointer-events-none opacity-0',
      )}>
      <VolkovWordmark size="lg" />
      <span className="h-px w-48 overflow-hidden bg-border">
        <span className="block h-full origin-left bg-brand transition-transform duration-300" style={{transform: `scaleX(${progress})`}} />
      </span>
      <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase tabular-nums">
        {phase === 'error' ? 'Не удалось запустить 3D — обновите страницу' : `Прокладываем маршрут · ${pct}%`}
      </p>
    </section>
  );
}

