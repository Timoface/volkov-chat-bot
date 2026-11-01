import {lazy, Suspense, useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';

import {themes, defaultThemeSlug} from './astryx-themes';
import {Hero} from '@/hero/Hero';

// чат (Astryx Chat + Markdown) грузится при первом открытии, чтобы не задерживать 3D-hero
const NavigatorChat = lazy(() => import('@/navigator/NavigatorChat').then((m) => ({default: m.NavigatorChat})));

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const openChat = () => {
    setChatMounted(true);
    setChatOpen(true);
  };
  return (
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <Hero chatOpen={chatOpen} onOpenChat={openChat} />
      {chatMounted && (
        <Suspense>
          <NavigatorChat open={chatOpen} onOpenChange={setChatOpen} />
        </Suspense>
      )}
    </Theme>
  );
}
