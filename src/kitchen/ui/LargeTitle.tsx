import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Spec ease-out: cubic-bezier(0.22, 1, 0.36, 1). */
const EASE = [0.22, 1, 0.36, 1] as const;

/** Scroll offset past which the compact bar replaces the large title. */
const COMPACT_AFTER = 44;

interface LargeTitleProps {
  title: string;
  /** Icon buttons shown in the frosted top-right pill (no pill when absent). */
  actions?: ReactNode;
}

function useScrolledPast(offset: number): boolean {
  const [past, setPast] = useState(() => typeof window !== "undefined" && window.scrollY > offset);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);
  return past;
}

/** iOS-style large title with a frosted compact bar that fades in on scroll. */
export function LargeTitle({ title, actions }: LargeTitleProps) {
  const compact = useScrolledPast(COMPACT_AFTER);
  const reduceMotion = useReducedMotion();
  return (
    <>
      <motion.div
        data-testid="compact-title"
        data-compact={compact ? "true" : "false"}
        aria-hidden="true"
        initial={false}
        animate={{ opacity: compact ? 1 : 0, scale: compact ? 1 : 0.98 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
        className={`fixed inset-x-0 top-0 z-30 border-b border-brand-line bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-[18px] backdrop-saturate-150 ${
          compact ? "" : "pointer-events-none"
        }`}
      >
        <div className="mx-auto max-w-xl px-4">
          <p className="truncate px-12 py-3 text-center text-[16px] font-bold">{title}</p>
        </div>
      </motion.div>
      <header className="mx-auto flex max-w-xl items-end justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <h1 className="min-w-0 text-[30px] font-extrabold leading-tight tracking-[-0.025em]">{title}</h1>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-brand-line bg-white/80 p-1 shadow-sm backdrop-blur-[18px] backdrop-saturate-150">
            {actions}
          </div>
        ) : null}
      </header>
    </>
  );
}
