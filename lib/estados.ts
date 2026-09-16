import type { Estado, MotivoFraguado, TipoMovimiento, Trompo } from "./db/schema";

/** Modulo sin dependencias de servidor: lo usan las paginas y el cliente. */

export const ORDEN_ESTADOS: Estado[] = [
  "patio",
  "horno",
  "a_desmoldar",
  "a_empaquetar",
  "listo",
];

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  patio: "en patio",
  horno: "en horno",
  a_desmoldar: "a desmoldar",
  a_empaquetar: "a empaquetar",
  listo: "listo",
};

/** Version en titulo, para encabezados y contadores. */
export const TITULO_ESTADO: Record<Estado, string> = {
  patio: "En patio",
  horno: "En horno",
  a_desmoldar: "A desmoldar",
  a_empaquetar: "A empaquetar",
  listo: "Listas",
};

/**
 * Que esta esperando una tanda en cada estado. Va abajo del contador en el
 * tablero: el nombre del estado dice donde esta, esto dice de quien depende.
 */
export const ESPERA_ESTADO: Record<Estado, string> = {
  patio: "fraguando, esperando horno",
  horno: "adentro del horno",
  a_desmoldar: "salio del horno, espera desmolde",
  a_empaquetar: "desmoldada, espera empaque",
  listo: "terminada",
};

export const COLOR_ESTADO: Record<
  Estado,
  { chip: string; borde: string; punto: string; fondo: string; barra: string }
> = {
  patio: {
    chip: "bg-sky-100 text-sky-900",
    borde: "ring-sky-200",
    punto: "bg-sky-500",
    fondo: "bg-sky-50",
    barra: "bg-sky-500",
  },
  horno: {
    chip: "bg-orange-100 text-orange-900",
    borde: "ring-orange-200",
    punto: "bg-orange-500",
    fondo: "bg-orange-50",
    barra: "bg-orange-500",
  },
  a_desmoldar: {
    chip: "bg-amber-100 text-amber-900",
    borde: "ring-amber-200",
    punto: "bg-amber-500",
    fondo: "bg-amber-50",
    barra: "bg-amber-500",
  },
  a_empaquetar: {
    chip: "bg-violet-100 text-violet-900",
    borde: "ring-violet-200",
    punto: "bg-violet-500",
    fondo: "bg-violet-50",
    barra: "bg-violet-500",
  },
  listo: {
    chip: "bg-emerald-100 text-emerald-900",
    borde: "ring-emerald-200",
    punto: "bg-emerald-500",
    fondo: "bg-emerald-50",
    barra: "bg-emerald-500",
  },
};

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  llenado: "Llenado",
  entrada_horno: "Entrada al horno",
  salida_horno: "Salida del horno",
  fraguado_natural: "Fraguado natural",
  devolucion_horno: "Devolución al horno",
  desmolde: "Desmolde",
  empaquetado: "Empaque",
  correccion: "Corrección",
  cambio_tarjeta: "Cambio de tarjeta",
};

export const ETIQUETA_MOTIVO_FRAGUADO: Record<MotivoFraguado, string> = {
  horno_lleno: "Horno lleno",
  clima: "Clima favorable",
  otro: "Otro",
};

export const ETIQUETA_TROMPO: Record<Trompo, string> = { a: "Trompo A", b: "Trompo B" };

/**
 * Cuanto dura el estado ANTERIOR a cada movimiento. Es lo que hace legible la
 * columna de duracion en el historial sin tener que explicarla cada vez.
 */
export const QUE_MIDE_LA_DURACION: Partial<Record<TipoMovimiento, string>> = {
  entrada_horno: "espera en patio",
  salida_horno: "tiempo de horno",
  fraguado_natural: "fraguado en patio",
  desmolde: "espera para desmoldar",
  empaquetado: "espera para empacar",
};

/**
 * Conversion molde -> pieza -> paquete.
 *
 * Es UNA sola funcion y se usa en todos lados a proposito: si cada pantalla
 * hiciera su propia cuenta, alcanzaria con que una redondeara distinto para que
 * dos numeros de la misma tanda no coincidan.
 */
export function convertir(
  moldes: number,
  piezasPorMolde: number,
  piezasPorPaquete: number,
): { piezas: number; paquetes: number; sueltas: number } {
  const piezas = moldes * piezasPorMolde;
  const paquetes = Math.floor(piezas / piezasPorPaquete);
  // Con 2 piezas por paquete y una cantidad impar queda una sin par. No se
  // redondea en silencio: es una pieza que despues alguien busca en el piso.
  const sueltas = piezas - paquetes * piezasPorPaquete;
  return { piezas, paquetes, sueltas };
}

/** Paquetes que deberian salir de una tanda, segun lo que se lleno. */
export function paquetesEsperados(t: {
  moldesLlenados: number;
  piezasPorMolde: number;
  piezasPorPaquete: number;
}): number {
  return convertir(t.moldesLlenados, t.piezasPorMolde, t.piezasPorPaquete).paquetes;
}

/**
 * Rotura de una tanda cerrada. `null` mientras no se conto: una tanda sin
 * contar no es una tanda con cero rotura.
 */
export function rotura(t: {
  moldesLlenados: number;
  piezasPorMolde: number;
  piezasPorPaquete: number;
  paquetes: number | null;
}): number | null {
  if (t.paquetes === null) return null;
  return Math.max(0, paquetesEsperados(t) - t.paquetes);
}
