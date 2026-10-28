import { useT } from "@/i18n";
import { canSwitchSpaces, type AppRole, type KitchenAccess, type Space } from "@/lib/landing";

export function SpaceSwitch({ current, onChange }: { current: Space; onChange: (s: Space) => void }) {
  const t = useT();
  const options: { value: Space; label: string }[] = [
    { value: "coffee", label: t.space.coffee },
    { value: "kitchen", label: t.space.kitchen },
  ];
  return (
    <div
      role="group"
      className="inline-flex rounded-full border border-border bg-background/95 p-0.5 shadow-sm backdrop-blur text-xs font-medium"
    >
      {options.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => { if (!active) onChange(o.value); }}
            className={
              "rounded-full px-3 py-1.5 transition-colors " +
              (active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Renders the switch only for users allowed to switch; null otherwise (coffee-only users see nothing). */
export function renderSpaceSwitchIfAllowed(
  coffeeRole: AppRole | null,
  kitchen: KitchenAccess | null,
  current: Space,
  onChange: (s: Space) => void,
): JSX.Element | null {
  if (!canSwitchSpaces(coffeeRole, kitchen)) return null;
  return <SpaceSwitch current={current} onChange={onChange} />;
}
