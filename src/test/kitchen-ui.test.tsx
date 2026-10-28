import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useCuisineTheme } from "@/kitchen/ui/useCuisineTheme";

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
