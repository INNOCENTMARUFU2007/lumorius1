import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The one Lumorius logo used outside the app shell: the brand symbol plus a
 * text wordmark that follows the theme (the SVG wordmark is white-only).
 */
export function BrandMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const icon = size === 'lg' ? 40 : size === 'sm' ? 24 : 32;
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image src="/favicon.svg" alt="" width={icon} height={icon} priority style={{ width: icon, height: icon }} />
      <span className={cn('font-semibold tracking-tight text-foreground', size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl')}>
        Lumorius
      </span>
      <span className="sr-only">Lumorius AI</span>
    </span>
  );
}
