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
            "group toast group-[.toaster]:bg-brand-ink group-[.toaster]:text-brand-paper group-[.toaster]:rounded-[22px] group-[.toaster]:border-0 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-brand-paper/75",
          actionButton: "group-[.toast]:bg-brand-paper group-[.toast]:text-brand-ink",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
