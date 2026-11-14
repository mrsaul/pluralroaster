import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClientSyncCard } from "@/components/ClientSyncCard";

function renderCard(overrides: Partial<React.ComponentProps<typeof ClientSyncCard>> = {}) {
  const props = {
    syncing: false,
    importing: false,
    importId: "",
    onImportIdChange: vi.fn(),
    onAddClient: vi.fn(),
    onSyncAll: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  };
  render(<ClientSyncCard {...props} />);
  return props;
}

describe("Sellsy client sync card on phones", () => {
  it("lets the long sync button wrap instead of pushing the page sideways", () => {
    renderCard();
    const sync = screen.getByRole("button", { name: /Synchroniser les clients depuis Sellsy/ });
    // A nowrap button wider than the phone made the whole Clients page scroll sideways.
    expect(sync.className).toMatch(/\bwhitespace-normal\b/);
    expect(sync.className).toMatch(/\bw-full\b/);
    expect(sync.parentElement!.className).toMatch(/\bflex-wrap\b|\bflex-col\b/);
  });

  it("speaks French on the add button", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /Nouveau client/ })).toBeInTheDocument();
    expect(screen.queryByText(/Add New Client/)).not.toBeInTheDocument();
  });

  it("imports one client by Sellsy ID with the button or the Enter key", () => {
    const props = renderCard({ importId: "46" });
    fireEvent.click(screen.getByRole("button", { name: /Importer le client/ }));
    fireEvent.keyDown(screen.getByPlaceholderText("ID client Sellsy (ex. 46)"), { key: "Enter" });
    expect(props.onImport).toHaveBeenCalledTimes(2);
  });

  it("disables import until an ID is typed", () => {
    renderCard({ importId: "  " });
    expect(screen.getByRole("button", { name: /Importer le client/ })).toBeDisabled();
  });
});
