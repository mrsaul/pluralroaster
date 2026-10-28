import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useCuisineTheme } from "@/kitchen/ui/useCuisineTheme";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

function Probe() {
  useCuisineTheme();
  return null;
}

describe("useCuisineTheme", () => {
  it("adds theme-cuisine to <html> while mounted and removes it after", () => {
    const { unmount } = render(<Probe />);
    expect(document.documentElement).toHaveClass("theme-cuisine");
    unmount();
    expect(document.documentElement).not.toHaveClass("theme-cuisine");
  });

  it("keeps the class until the last user unmounts", () => {
    const a = render(<Probe />);
    const b = render(<Probe />);
    a.unmount();
    expect(document.documentElement).toHaveClass("theme-cuisine");
    b.unmount();
    expect(document.documentElement).not.toHaveClass("theme-cuisine");
  });
});

describe("shared shadcn components under cuisine:", () => {
  it("button gets pill classes only under the cuisine variant", () => {
    const cls = buttonVariants({});
    expect(cls).toContain("cuisine:rounded-full");
    expect(cls).toContain("rounded-md"); // coffee/admin unchanged
  });

  it("bottom sheet shows a grabber", () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>T</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(document.querySelector("[data-grabber]")).not.toBeNull();
  });
});
