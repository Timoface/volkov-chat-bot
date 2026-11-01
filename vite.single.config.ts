// Сборка «всё в одном HTML»: скрипты, стили, шрифт и 3D-модель встраиваются в один файл,
// который открывается двойным щелчком без сервера. Чат без сервера отвечает по встроенной базе знаний.
import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {alias: {'@': path.resolve(import.meta.dirname, 'src')}},
  build: {target: 'es2022', outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 10_000},
});
