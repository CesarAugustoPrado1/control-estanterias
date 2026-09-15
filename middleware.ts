import { NextResponse, type NextRequest } from "next/server";
import { INICIO_POR_ROL, puedeVer } from "./lib/permisos";
import { COOKIE, verificar } from "./lib/session";

/**
 * Control de NAVEGACION, no frontera de seguridad.
 *
 * Corre en el runtime edge, asi que no puede tocar la base: valida la firma del
 * token y nada mas. La revalidacion real -que el usuario siga activo, que el rol
 * no haya cambiado- la hace cada page y cada action contra la base. Ver auth.ts.
 */

const PUBLICAS = ["/login", "/sin-permiso"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get(COOKIE)?.value;
  const sesion = token ? await verificar(token) : null;

  if (PUBLICAS.some((p) => pathname.startsWith(p))) {
    // Ya logueado entrando al login: mandarlo a su puesto.
    if (sesion && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL(INICIO_POR_ROL[sesion.rol], req.url));
    }
    return NextResponse.next();
  }

  if (!sesion) {
    const url = new URL("/login", req.url);
    // Para volver a donde iba despues de entrar.
    if (pathname !== "/") url.searchParams.set("volver", pathname);
    return NextResponse.redirect(url);
  }

  // La raiz no tiene pantalla propia: cada rol cae en su puesto.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(INICIO_POR_ROL[sesion.rol], req.url));
  }

  if (!puedeVer(sesion.rol, pathname)) {
    return NextResponse.redirect(new URL("/sin-permiso", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icono.svg|manifest.webmanifest).*)"],
};
