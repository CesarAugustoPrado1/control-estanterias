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
  { href: "/trompo", etiqueta: "Trompo", roles: ["admin", "trompo"] },
  { href: "/horno", etiqueta: "Horno", roles: ["admin", "horno"] },
  { href: "/desmolde", etiqueta: "Desmolde", roles: ["admin", "desmolde"] },
  { href: "/empaque", etiqueta: "Empaque", roles: ["admin", "empaque"] },
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

export function navegacionDe(rol: Rol): Entrada[] {
  return NAVEGACION.filter((e) => e.roles.includes(rol));
}

export function puedeVer(rol: Rol, ruta: string): boolean {
  if (rol === "admin") return true;
  const entrada = NAVEGACION.filter((e) => ruta === e.href || ruta.startsWith(e.href + "/"))
    // La ruta mas especifica gana: /admin/productos antes que /admin.
    .sort((a, b) => b.href.length - a.href.length)[0];
  return entrada ? entrada.roles.includes(rol) : false;
}
