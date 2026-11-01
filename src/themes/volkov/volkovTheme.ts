/**
 * Фирменная тема «Волков» поверх neutral.
 * Палитра снята с volcov.ru: красный словесный знак #E60000, малиновый CTA #E40046,
 * чёрный фон историй, коралловый #FF8562 и тёплый кремовый #F6EDE8.
 * Собирается командой `npm run theme:build` (astryx theme build).
 */
import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const volkovTheme = defineTheme({
  name: 'volkov',
  extends: neutralTheme,
  color: {
    // фирменный красный в обоих режимах; белый текст на нём даёт ≥ 5:1
    accent: ['#D50A2B', '#D50A2B'],
    neutralStyle: 'warm',
    contrast: 'standard',
  },
  typography: {
    scale: {base: 15, ratio: 1.2},
    body: {family: 'Onest Variable', fallbacks: "'Segoe UI', system-ui, sans-serif"},
    heading: {family: 'Onest Variable', fallbacks: "'Segoe UI', system-ui, sans-serif"},
  },
  radius: {base: 6, multiplier: 1.2},
  tokens: {
    '--color-accent': ['#D50A2B', '#D50A2B'],
    '--color-on-accent': ['#FFFFFF', '#FFFFFF'],
    // акцентный текст на тёмном графите — коралл с сайта (#FF8562), на светлом — тёмно-красный
    '--color-text-accent': ['#B5001F', '#FF8562'],
    '--color-icon-accent': ['#B5001F', '#FF8562'],
    '--color-background-body': ['#FBF7F4', '#0B0A0A'],
    '--color-background-surface': ['#FFFFFF', '#141212'],
    '--color-background-card': ['#FFFFFF', '#181515'],
    '--color-background-popover': ['#FFFFFF', '#1C1818'],
    '--color-background-muted': ['#F6EDE8', '#221D1C'],
    '--color-text-primary': ['#1A1414', '#F6EDE8'],
    '--color-text-secondary': ['#5E5250', '#B9AEA9'],
    '--color-border': ['#E8DDD7', '#2E2725'],
  },
});
