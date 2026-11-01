// первым: объявляет порядок каскадных слоёв для Astryx, Tailwind и shadcn
import './styles/globals.css';
// шрифт темы volkov (Onest Variable, кириллица) — локально, без внешних CDN
import '@fontsource-variable/onest';

import {createRoot} from 'react-dom/client';
import App from './App';

// Без StrictMode: двойной монтаж в dev пересоздавал бы WebGL-контекст сцены на том же canvas.
createRoot(document.getElementById('root')!).render(<App />);
