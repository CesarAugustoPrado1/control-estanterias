import type { Rol } from "./db/schema";

/**
 * Modulo puro: lo importa el middleware (runtime edge), las paginas y el
 * cliente. No puede tocar la base ni node: apenas nombres y rutas.
 */

export type Entrada = { href: string; etiqueta: string; roles: Rol[] };

/**
 * Navegacion, en orden del circuito. El orden no es estetico: es el que hace
 * que alguien que mira la barra entienda por donde pasa el material.
 */
export const NAVEGACION: Entrada[] = [
  { href: "/tablero", etiqueta: "Tablero", roles: ["admin", "trompo", "horno", "desmolde", "empaque", "oficina", "auditor"] },
  { href: "/programa", etiqueta: "Programa", roles: ["admin", "oficina", "auditor"] },
  { href: "/trompo", etiqueta: "Trompo", roles: ["admin", "trompo"] },
  { href: "/horno", etiqueta: "Horno", roles: ["admin", "horno"] },
  { href: "/desmolde", etiqueta: "Desmolde", roles: ["admin", "desmolde"] },
  { href: "/empaque", etiqueta: "Empaque", roles: ["admin", "empaque"] },
  { href: "/produccion", etiqueta: "Producción", roles: ["admin", "oficina", "auditor", "trompo"] },
  { href: "/recorrida", etiqueta: "Recorrida", roles: ["admin", "oficina", "auditor"] },
  { href: "/movimientos", etiqueta: "Movimientos", roles: ["admin", "oficina", "auditor"] },
  { href: "/estadisticas", etiqueta: "Estadísticas", roles: ["admin", "oficina", "auditor"] },
  { href: "/admin", etiqueta: "Admin", roles: ["admin"] },
];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administrador",
  trompo: "Trompo",
  horno: "Horno",
  desmolde: "Desmolde",
  empaque: "Empaque",
  oficina: "Oficina",
  auditor: "Auditoría",
};

/** Adonde cae cada rol al entrar: su puesto, no una portada generica. */
export const INICIO_POR_ROL: Record<Rol, string> = {
  admin: "/tablero",
  trompo: "/trompo",
  horno: "/horno",
  desmolde: "/desmolde",
  empaque: "/empaque",
  oficina: "/tablero",
  auditor: "/tablero",
};

/**
 * Prioridad para elegir el rol principal de alguien con varios: el admin
 * primero, despues los puestos en orden del circuito, y al final los que solo
 * miran. Decide donde cae al entrar.
 */
export const ORDEN_ROLES: Rol[] = ["admin", "trompo", "horno", "desmolde", "empaque", "oficina", "auditor"];

/** Sin repetidos y en el orden de ORDEN_ROLES. */
export function ordenarRoles(roles: readonly Rol[]): Rol[] {
  return ORDEN_ROLES.filter((r) => roles.includes(r));
}

export function rolPrincipal(roles: readonly Rol[]): Rol {
  return ordenarRoles(roles)[0] ?? "oficina";
}

export function inicioDe(roles: readonly Rol[]): string {
  return INICIO_POR_ROL[rolPrincipal(roles)];
}

/** "Trompo · Horno". */
export function etiquetaRoles(roles: readonly Rol[]): string {
  return ordenarRoles(roles)
    .map((r) => ETIQUETA_ROL[r])
    .join(" · ");
}

/**
 * Los usuarios anteriores a la migracion 0008 tienen la lista vacia y solo el
 * rol de siempre. No deberia quedar ninguno, pero si quedara, que no pierda el
 * acceso.
 */
export function rolesDe(u: { rol: Rol; roles: readonly Rol[] | null }): Rol[] {
  return u.roles?.length ? ordenarRoles(u.roles) : [u.rol];
}

/** El admin pasa siempre; si no, alcanza con tener uno de los roles pedidos. */
export function tieneAlguno(roles: readonly Rol[], pedidos: readonly Rol[]): boolean {
  return roles.includes("admin") || pedidos.some((r) => roles.includes(r));
}

export function navegacionDe(roles: readonly Rol[]): Entrada[] {
  return NAVEGACION.filter((e) => e.roles.some((r) => roles.includes(r)));
}

/**
 * Rutas que no estan en la barra pero igual tienen permiso propio.
 *
 * El detalle de una tanda se llega desde el historial o escaneando su codigo,
 * no desde un menu: seria una entrada que nunca se toca. Pero sigue
 * necesitando control de acceso, asi que vive aca y no en NAVEGACION.
 */
export const RUTAS_EXTRA: Entrada[] = [
  {
    href: "/tanda",
    etiqueta: "Detalle de maquinada",
    roles: ["admin", "oficina", "auditor", "trompo", "horno", "desmolde", "empaque"],
  },
];

export function puedeVer(roles: readonly Rol[], ruta: string): boolean {
  if (roles.includes("admin")) return true;
  const entrada = [...NAVEGACION, ...RUTAS_EXTRA]
    .filter((e) => ruta === e.href || ruta.startsWith(e.href + "/"))
    // La ruta mas especifica gana: /admin/productos antes que /admin.
    .sort((a, b) => b.href.length - a.href.length)[0];
  return entrada ? entrada.roles.some((r) => roles.includes(r)) : false;
}
