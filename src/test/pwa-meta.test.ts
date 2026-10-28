import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Vitest runs from the repo root, so resolve project files from cwd.
const html = readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
const manifest = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "public/manifest.json"), "utf8"),
);

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
