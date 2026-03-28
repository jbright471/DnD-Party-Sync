import { useId } from 'react';

interface AnimatedToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

/**
 * AnimatedToggle — a pill-shaped switch with a sliding thumb and gold glow.
 *
 * Accessibility:
 *  - Hidden native <input type="checkbox"> stays in the DOM for form semantics.
 *  - The visible track carries role="switch" + aria-checked for AT tools.
 *  - Keyboard: focus lands on the track; Space/Enter toggle it.
 */
export function AnimatedToggle({ checked, onChange, label }: AnimatedToggleProps) {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      {/* Native checkbox — visually hidden, kept for form/AT fallback */}
      <input
        type="checkbox"
        id={id}
        className="sr-only"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Visual track — this IS the interactive ARIA widget */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full',
          'border-2 border-transparent outline-none',
          'transition-colors duration-300 ease-in-out',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked
            ? 'bg-primary shadow-[0_0_10px_3px_hsl(45_80%_55%/0.35)]'
            : 'bg-slate-700 hover:bg-slate-600',
        ].join(' ')}
      >
        {/* Sliding thumb */}
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full shadow-md ring-0',
            'transition-all duration-300 ease-in-out',
            checked
              ? 'translate-x-[1.125rem] bg-primary-foreground'
              : 'translate-x-[0.125rem] bg-white/90',
          ].join(' ')}
        />
      </button>

      {/* Optional label — clicking it also toggles */}
      {label && (
        <label
          htmlFor={id}
          className="text-[10px] font-bold text-gold uppercase tracking-tighter cursor-pointer select-none"
          onClick={() => onChange(!checked)}
        >
          {label}
        </label>
      )}
    </div>
  );
}
