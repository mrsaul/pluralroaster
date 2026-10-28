import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Coffee, LogOut, X } from "lucide-react";
import { BrandShape } from "./BrandShape";
import type { MenuStrings, ShellTab } from "./CuisineShell";

/** Spec ease-out: cubic-bezier(0.22, 1, 0.36, 1). */
const EASE = [0.22, 1, 0.36, 1] as const;

const ROW =
  "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-transform duration-[120ms] active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none";

/** Re-skins slotted buttons (e.g. the ghost NotificationsToggle) for the black menu: paper text, night-2 hover/focus. */
const ON_NIGHT_BUTTONS =
  "[&_button]:text-brand-paper [&_button:hover]:bg-brand-night-2 [&_button:hover]:text-brand-paper [&_button:focus-visible]:bg-brand-night-2 [&_button:focus-visible]:text-brand-paper";

interface PrivateMenuProps {
  open: boolean;
  onClose: () => void;
  roleLabel: string;
  cafeName?: string | null;
  tabs: ShellTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  notifications?: ReactNode;
  onSwitchToCoffee?: () => void;
  onLogout: () => void;
  strings: MenuStrings;
}

/** Full-screen black "espace privé" menu. */
export function PrivateMenu({ open, ...panel }: PrivateMenuProps) {
  return <AnimatePresence>{open ? <MenuPanel key="cuisine-menu" {...panel} /> : null}</AnimatePresence>;
}

function MenuPanel({
  onClose,
  roleLabel,
  cafeName,
  tabs,
  activeTab,
  onTabChange,
  notifications,
  onSwitchToCoffee,
  onLogout,
  strings,
}: Omit<PrivateMenuProps, "open">) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Focus the first row on open.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  // Escape closes, unless a higher overlay already handled it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep Tab inside the dialog.
  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])");
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={strings.menu}
      onKeyDown={trapTab}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 12 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE }}
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain bg-brand-night text-brand-paper"
    >
      <BrandShape kind="semi" color="coral" size={220} className="pointer-events-none absolute -right-20 -top-14" />
      <div className="relative mx-auto flex max-w-lg flex-col gap-8 px-5 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-[calc(env(safe-area-inset-top)+40px)]">
        {/* pr-28 keeps paper text clear of the coral shape (contrast). */}
        <div className="pr-28">
          <p className="text-[30px] font-extrabold leading-tight tracking-[-0.025em]">{roleLabel}</p>
          {cafeName ? <p className="mt-1 text-[15px] text-brand-paper/70">{cafeName}</p> : null}
        </div>

        {tabs.length > 0 ? (
          <div className="flex flex-col gap-1">
            {tabs.map((tab) => {
              const active = tab.key === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    onTabChange?.(tab.key);
                    onClose();
                  }}
                  className={`${ROW} text-[22px] font-bold ${active ? "bg-brand-night-2" : ""}`}
                >
                  <Icon aria-hidden="true" className="h-6 w-6 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <section className="flex flex-col gap-1">
          <h2 className="px-4 pb-1 text-[13px] font-semibold uppercase tracking-wide text-brand-paper/70">
            {strings.account}
          </h2>
          {notifications ? (
            <div data-testid="menu-notifications" className={`px-4 py-2 ${ON_NIGHT_BUTTONS}`}>
              {notifications}
            </div>
          ) : null}
          {onSwitchToCoffee ? (
            <button
              type="button"
              onClick={() => {
                onSwitchToCoffee();
                onClose();
              }}
              className={`${ROW} text-[17px] font-semibold`}
            >
              <Coffee aria-hidden="true" className="h-5 w-5 shrink-0" />
              {strings.backToCoffee}
            </button>
          ) : null}
          <button type="button" onClick={onLogout} className={`${ROW} text-[17px] font-semibold`}>
            <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
            {strings.logout}
          </button>
        </section>
      </div>

      <button
        type="button"
        aria-label={strings.closeMenu}
        onClick={onClose}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-brand-paper text-brand-ink shadow-lg transition-transform duration-[120ms] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <X aria-hidden="true" className="h-6 w-6" />
      </button>
    </motion.div>
  );
}
