import type { ReactNode, Ref } from "react";
import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import type { ShellTab } from "./CuisineShell";

/** Spec ease-out: cubic-bezier(0.22, 1, 0.36, 1). */
const EASE = [0.22, 1, 0.36, 1] as const;

const ISLAND =
  "flex items-center gap-1 rounded-full border border-brand-line bg-white/80 p-1.5 shadow-[0_6px_24px_rgba(28,26,23,0.12)] backdrop-blur-[18px] backdrop-saturate-150";
const PRESS = "transition-transform duration-[120ms] active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none";

interface TabBarProps {
  tabs: ShellTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  floatingAction?: ReactNode;
  navLabel: string;
  menuLabel: string;
  menuOpen: boolean;
  onMenuClick: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
}

/** Floating bottom tab bar: icon tabs island, optional action pill, menu island. */
export function TabBar({
  tabs,
  activeTab,
  onTabChange,
  floatingAction,
  navLabel,
  menuLabel,
  menuOpen,
  onMenuClick,
  menuButtonRef,
}: TabBarProps) {
  return (
    <nav
      aria-label={navLabel}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-3 right-3 z-40 flex items-center justify-end gap-2"
    >
      {tabs.length > 0 ? (
        <div className={`${ISLAND} mr-auto flex-1 justify-around`}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                onClick={() => onTabChange?.(tab.key)}
                className={`relative flex h-11 w-11 items-center justify-center rounded-full ${PRESS}`}
              >
                {active ? (
                  <motion.span
                    layoutId="cuisine-tab"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-brand-ink"
                    transition={{ type: "tween", duration: 0.2, ease: EASE }}
                  />
                ) : null}
                <Icon
                  aria-hidden="true"
                  className={`relative h-5 w-5 ${active ? "text-brand-paper" : "text-brand-ink"}`}
                />
              </button>
            );
          })}
        </div>
      ) : null}
      {floatingAction}
      <div className={ISLAND}>
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={menuLabel}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onMenuClick}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-brand-ink ${PRESS}`}
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
    </nav>
  );
}
