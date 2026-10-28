import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.hoisted(() => ({
  supported: true,
  subscribed: false,
  loading: false,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: () => push }));

import NotificationsToggle from "@/kitchen/components/NotificationsToggle";

beforeEach(() => {
  push.supported = true; push.subscribed = false; push.loading = false;
  push.subscribe.mockReset(); push.unsubscribe.mockReset();
});

describe("NotificationsToggle", () => {
  it("turns push on when off", () => {
    render(<NotificationsToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Activer les notifications" }));
    expect(push.subscribe).toHaveBeenCalledTimes(1);
  });
  it("turns push off when on", () => {
    push.subscribed = true;
    render(<NotificationsToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Désactiver les notifications" }));
    expect(push.unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("renders nothing when push is unsupported", () => {
    push.supported = false;
    const { container } = render(<NotificationsToggle />);
    expect(container).toBeEmptyDOMElement();
  });
});
