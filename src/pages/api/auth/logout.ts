import type { APIRoute } from "astro";
import { sessionCookie } from "@/lib/session";

export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(sessionCookie.name, { path: "/" });
  return redirect("/", 302);
};
