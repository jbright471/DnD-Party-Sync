/**
 * HelpButton — small contextual help icon that shows a styled popover
 * with a title and explanation content on click.
 *
 * Usage:
 *   <HelpButton title="Initiative" content="Roll d20 + DEX modifier..." />
 */

import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface HelpButtonProps {
  title: string;
  content: string;
  /** Optional extra className on trigger */
  className?: string;
  /** Which side the popover opens on (default: top) */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Align the popover (default: center) */
  align?: 'start' | 'center' | 'end';
}

export function HelpButton({ title, content, className, side = 'top', align = 'center' }: HelpButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center rounded-full',
            'h-4 w-4 text-muted-foreground/40 hover:text-primary/70',
            'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className,
          )}
          aria-label={`Help: ${title}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-72 border-primary/20 bg-card/95 backdrop-blur-sm shadow-lg shadow-black/40"
      >
        <div className="space-y-1.5">
          <h4 className="font-display text-sm font-semibold text-primary tracking-wide">
            {title}
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {content}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
