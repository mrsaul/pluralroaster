import { useCallback, useRef, useState, type ReactNode } from "react";
import { MotionConfig, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useCuisineTheme } from "./useCuisineTheme";
import { LargeTitle } from "./LargeTitle";
import { TabBar } from "./TabBar";
import { PrivateMenu } from "./PrivateMenu";

export type ShellTab = { key: string; label: string; icon: LucideIcon };
export type MenuStrings = { menu: string; closeMenu: string; account: string; nav: string; backToCoffee: string; logout: string };

type CuisineShellProps = {
  title: string;                         // large title, also the compact bar title
  tabs: ShellTab[];                      // may be empty (stores manager)
  activeTab?: string;
  onTabChange?: (key: string) => void;
  topActions?: ReactNode;                // icon buttons inside the frosted top-right pill
  floatingAction?: ReactNode;            // pill shown left of the menu island (stores "Nouvelle commande urgente")
  roleLabel: string;                     // e.g. "Responsable cuisine"
  cafeName?: string | null;
  notifications?: ReactNode;             // existing <NotificationsToggle />
  onSwitchToCoffee?: () => void;         // "Retour au café" shown only if set
  onLogout: () => void;
  strings: MenuStrings;
  children: ReactNode;
};

/** iOS-style Cuisine shell: large title, floating tab bar and the black private menu. */
export default function CuisineShell({
  title,
  tabs,
  activeTab,
  onTabChange,
  topActions,
  floatingAction,
  roleLabel,
  cafeName,
  notifications,
  onSwitchToCoffee,
  onLogout,
  strings,
  children,
}: CuisineShellProps) {
  useCuisineTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background text-foreground">
        <LargeTitle title={title} actions={topActions} />
        <motion.div
          key={activeTab ?? "single"}
          data-testid="cuisine-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)]"
        >
          {children}
        </motion.div>
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          floatingAction={floatingAction}
          navLabel={strings.nav}
          menuLabel={strings.menu}
          menuOpen={menuOpen}
          onMenuClick={() => setMenuOpen(true)}
          menuButtonRef={menuButtonRef}
        />
        <PrivateMenu
          open={menuOpen}
          onClose={closeMenu}
          roleLabel={roleLabel}
          cafeName={cafeName}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          notifications={notifications}
          onSwitchToCoffee={onSwitchToCoffee}
          onLogout={onLogout}
          strings={strings}
        />
      </div>
    </MotionConfig>
  );
}
