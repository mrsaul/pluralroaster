import { describe, it, expect } from "vitest";
import html from "../../index.html?raw";
import manifest from "../../public/manifest.json";

describe("PWA meta", () => {
  it("uses the standard iOS status bar", () => {
    expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style" content="default"/);
  });

  it("uses paper as the browser and splash colour", () => {
    expect(html).toMatch(/name="theme-color" content="#FBF8F1"/);
    expect(manifest.theme_color).toBe("#FBF8F1");
    expect(manifest.background_color).toBe("#FBF8F1");
  });

  it("keeps viewport-fit=cover", () => {
    expect(html).toMatch(/viewport-fit=cover/);
  });
});
