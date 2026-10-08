import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "attendly_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret() {
  const configured = process.env.SESSION_SECRET;
  if (configured) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
  return new TextEncoder().encode("attendly-local-development-secret-change-me");
}

export async function createSession(teacherId: string) {
  const token = await new SignJWT({ teacherId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getTeacherId() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.teacherId === "string" ? payload.teacherId : null;
  } catch {
    return null;
  }
}

export async function requireTeacherId() {
  const teacherId = await getTeacherId();
  if (!teacherId) throw new Error("UNAUTHENTICATED");
  return teacherId;
}
