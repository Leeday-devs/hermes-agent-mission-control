import { auth } from "@/lib/auth";

export type SessionGetter = () => Promise<unknown | null>;

export type AuthorizationOptions = {
  isDevelopment?: boolean;
  internalSecret?: string;
  getSession?: SessionGetter;
};

// Defense-in-depth check for mutating Route Handlers, mirroring the policy
// middleware.ts already enforces for every /api/* request (dev bypass,
// x-internal-secret for the hermes-bridge, else a live Auth.js session).
// Route Handlers should not rely solely on middleware for authorization
// (see Next.js's authentication guide), so side-effecting routes call this
// directly as a second, independent gate.
export async function isAuthorizedRequest(req: Request, opts: AuthorizationOptions = {}): Promise<boolean> {
  const isDevelopment = opts.isDevelopment ?? process.env.NODE_ENV === "development";
  if (isDevelopment) return true;

  const expected = opts.internalSecret ?? process.env.INTERNAL_API_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (provided && expected && provided === expected) return true;

  const getSession = opts.getSession ?? (async () => auth());
  const session = await getSession();
  return Boolean(session);
}
