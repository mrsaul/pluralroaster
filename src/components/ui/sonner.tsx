import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg cuisine:group-[.toaster]:bg-brand-ink cuisine:group-[.toaster]:text-brand-paper cuisine:group-[.toaster]:rounded-[22px] cuisine:group-[.toaster]:border-0",
          description: "group-[.toast]:text-muted-foreground cuisine:group-[.toast]:text-brand-paper/75",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground cuisine:group-[.toast]:bg-brand-paper cuisine:group-[.toast]:text-brand-ink",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
