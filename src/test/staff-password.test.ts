import { describe, it, expect, vi } from "vitest";
import { staffMustSetPassword } from "@/lib/staffPassword";

const client = (result: { data: unknown; error: unknown }) => ({ rpc: vi.fn().mockResolvedValue(result) });

describe("staffMustSetPassword", () => {
  it("asks for a password right after an email-code login", async () => {
    const c = client({ data: true, error: null });
    expect(await staffMustSetPassword(c, "1")).toBe(true);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("asks for a password when the account has none (invited by email)", async () => {
    const c = client({ data: false, error: null });
    expect(await staffMustSetPassword(c, null)).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("current_user_has_password");
  });

  it("goes straight in when the account already has a password", async () => {
    expect(await staffMustSetPassword(client({ data: true, error: null }), null)).toBe(false);
  });

  it("never blocks login when the check fails", async () => {
    expect(await staffMustSetPassword(client({ data: null, error: { message: "boom" } }), null)).toBe(false);
    const throwing = { rpc: vi.fn().mockRejectedValue(new Error("offline")) };
    expect(await staffMustSetPassword(throwing, null)).toBe(false);
  });
});
