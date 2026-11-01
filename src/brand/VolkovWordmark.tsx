import {cn} from '@/lib/utils';

// Словесный знак в духе логотипа «волков групп» с volcov.ru: строчное «волков» фирменным красным
// и «групп» под ним. Набран шрифтом, а не скопирован из файла логотипа — для прототипа.
export function VolkovWordmark({size = 'md'}: {size?: 'md' | 'lg'}) {
  return (
    <span aria-hidden="true" className={cn('inline-flex flex-col items-center leading-none select-none', size === 'lg' ? 'gap-1' : 'gap-0.5')}>
      <span className={cn('font-heading font-extrabold tracking-tight text-brand-mark lowercase', size === 'lg' ? 'text-5xl' : 'text-2xl')}>волков</span>
      <span className={cn('font-heading font-medium text-foreground lowercase', size === 'lg' ? 'text-lg tracking-[0.3em]' : 'text-[0.6875rem] tracking-[0.28em]')}>групп</span>
    </span>
  );
}
