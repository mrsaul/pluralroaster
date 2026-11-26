/**
 * Staff (admin, roaster, packaging) invited by email, or signing in with an
 * email code, have no password yet. They are asked to choose one once, then
 * land on their dashboard; afterwards they sign in with email + password.
 *
 * A failed check never blocks login: it answers "no need".
 */
type RpcClient = {
  rpc: (fn: "current_user_has_password") => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function staffMustSetPassword(client: RpcClient, otpFlag: string | null): Promise<boolean> {
  if (otpFlag === "1") return true;
  try {
    const { data, error } = await client.rpc("current_user_has_password");
    if (error) return false;
    return data === false;
  } catch {
    return false;
  }
}
