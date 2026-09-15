/** Modulo puro: lo usan servidor y cliente. */

const TZ = "America/Argentina/Buenos_Aires";

export function fechaHora(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const f = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(f);
}

export function fechaCompleta(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const f = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(f);
}

export function soloFecha(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const f = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(f);
}

/**
 * Duracion en lenguaje de planta. Nadie dice "1.847 minutos": dice "1 d 6 h".
 */
export function duracion(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return "recién";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) {
    const ent = Math.floor(h);
    const m = Math.round(min - ent * 60);
    return m >= 5 ? `${ent} h ${m} min` : `${ent} h`;
  }
  const d = Math.floor(h / 24);
  const hr = Math.round(h - d * 24);
  return hr >= 1 ? `${d} d ${hr} h` : `${d} d`;
}

/** Minutos transcurridos desde un momento. */
export function desde(d: Date | string): number {
  const f = typeof d === "string" ? new Date(d) : d;
  return (Date.now() - f.getTime()) / 60000;
}

export function haceCuanto(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return `hace ${duracion(desde(d))}`;
}

export function numero(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/**
 * m2 con un decimal. Recibe string porque la base guarda `numeric` y drizzle lo
 * devuelve como string: convertirlo a number antes de sumar es justamente lo
 * que se quiso evitar al elegir `numeric`.
 */
export function m2(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  return `${numero(n, 1)} m²`;
}

export function porcentaje(n: number | null | undefined, decimales = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${numero(n, decimales)} %`;
}

/** Suma m2 sin pasar por float hasta el final. */
export function sumarM2(
  filas: { paquetes: number | null; m2PorPaquete: string | null }[],
): number {
  let total = 0;
  for (const f of filas) {
    if (f.paquetes === null || !f.m2PorPaquete) continue;
    total += f.paquetes * Number(f.m2PorPaquete);
  }
  return total;
}
