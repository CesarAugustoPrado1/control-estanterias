import palabras from "../datos/palabras.json";
import type { Arido, Cemento } from "./db/schema";

/**
 * Tarjetas de tanda y placas de grupo. Modulo PURO: lo usan la app (servidor y
 * cliente) y los scripts. Ver ARQUITECTURA.md §10.
 */

export const TZ = "America/Argentina/Buenos_Aires";

export const LETRAS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type Letra = (typeof LETRAS)[number];

type DiaJson = { letra: string; dia: string; color: string; colorHex: string };

/**
 * Nombre y color de cada letra. Salen de `datos/palabras.json`, que es la fuente
 * de verdad de las tarjetas: si se cambia un color, cambia en la app y en las
 * etiquetas impresas a la vez.
 */
export const DIA_DE_LETRA: Record<Letra, { dia: string; color: string; hex: string }> =
  Object.fromEntries(
    (palabras.dias as DiaJson[]).map((d) => [
      d.letra,
      { dia: d.dia, color: d.color, hex: d.colorHex },
    ]),
  ) as Record<Letra, { dia: string; color: string; hex: string }>;

const LETRA_POR_DIA_SEMANA: Record<string, Letra> = {
  Mon: "A",
  Tue: "B",
  Wed: "C",
  Thu: "D",
  Fri: "E",
  Sat: "F",
  Sun: "G",
};

/**
 * Letra del dia de llenado, en hora argentina.
 *
 * Va con zona horaria explicita y no con `getDay()`: el servidor de Vercel corre
 * en UTC, y un llenado de las 21:30 de un lunes en planta es martes en UTC. La
 * tarjeta tiene que decir lunes, porque es lo que va a ver el que la lee.
 */
export function letraDelDia(fecha: Date): Letra {
  const dia = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(fecha);
  return LETRA_POR_DIA_SEMANA[dia] ?? "A";
}

/** Cuantas tarjetas se asumen fabricadas si no hay dato en `config`. */
export const FABRICADAS_POR_DEFECTO: Record<Letra, number> = {
  A: 30,
  B: 30,
  C: 30,
  D: 30,
  E: 30,
  F: 15,
  G: 15,
};

export const claveFabricadas = (l: Letra) => `tarjetas_fabricadas_${l}`;

/**
 * Lo que dice la placa: "UHMA · BEIGE · 03", y "UHMA · BEIGE · 03 · BLANCO"
 * para las de cemento blanco.
 *
 * Las de cemento blanco son grupos de moldes distintos: llevan los laterales
 * pintados de blanco y su propio cartel. Por eso el numero es unico dentro de
 * modelo + familia + cemento, y puede haber una LISTON · BIEGES · 01 gris y
 * otra blanca. El cemento tiene que figurar en la etiqueta para que no se
 * confundan en pantalla.
 */
export function etiquetaPlaca(
  modelo: string,
  familia: string,
  numero: number | null,
  cemento: Cemento,
): string {
  const n = numero === null ? "??" : String(numero).padStart(2, "0");
  const sufijo = cemento === "blanco" ? " · BLANCO" : "";
  return `${modelo.toUpperCase()} · ${familia.toUpperCase()} · ${n}${sufijo}`;
}

/**
 * Codigo interno de una estanteria cuando no se carga uno: KAM-GRI-03, y
 * KAM-GRI-BL-03 si es de cemento blanco. El numero queda al final a proposito
 * (la migracion 0001 lo lee de ahi).
 *
 * Es el primero de `codigosEstanteria`: el corto, que alcanza casi siempre.
 */
export function codigoEstanteria(
  modelo: string,
  familia: string,
  numero: number,
  cemento: Cemento,
): string {
  return codigosEstanteria(modelo, familia, numero, cemento)[0];
}

/**
 * Codigos candidatos, del mas corto al mas largo, para elegir el primero libre.
 *
 * Con 3 letras por nombre, dos modelos que empiezan igual ("Re Deck" y "Red
 * Deck", "Kamba" y "Kambara") darian el mismo codigo y la segunda estanteria no
 * se podria guardar. Los siguientes candidatos usan las iniciales de cada
 * palabra y despues los nombres enteros; el ultimo recurso numera.
 */
export function codigosEstanteria(
  modelo: string,
  familia: string,
  numero: number,
  cemento: Cemento,
): string[] {
  const palabras = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter(Boolean);
  const corto = (s: string) => palabras(s).join("").slice(0, 3);
  const porPalabra = (s: string) => palabras(s).map((w) => w.slice(0, 3)).join("");
  const entero = (s: string) => palabras(s).join("");
  const bl = cemento === "blanco" ? "BL-" : "";
  const n = String(numero).padStart(2, "0");
  const armar = (m: string, f: string, extra = "") => `${m}-${f}-${bl}${extra}${n}`;

  const lista = [
    armar(corto(modelo), corto(familia)),
    armar(porPalabra(modelo), corto(familia)),
    armar(porPalabra(modelo), porPalabra(familia)),
    armar(entero(modelo), entero(familia)),
  ];
  for (let i = 2; i <= 9; i++) lista.push(armar(entero(modelo), entero(familia), `${i}-`));
  return [...new Set(lista)];
}

export const ETIQUETA_CEMENTO: Record<Cemento, string> = {
  gris: "cemento gris",
  blanco: "cemento blanco",
};

export const ETIQUETA_ARIDO: Record<Arido, string> = {
  alivianado: "alivianado",
  hormigon: "hormigón",
};

/** Como se nombra una tanda en el piso: la palabra si tiene, si no el codigo. */
export function nombreTanda(t: { codigo: string; tarjetaPalabra: string | null }): string {
  return t.tarjetaPalabra ? t.tarjetaPalabra.toUpperCase() : t.codigo;
}

/**
 * Horas a partir de las cuales una tanda en ese estado casi seguro tiene un
 * movimiento sin registrar. El ciclo normal completo son ~72 h; estos umbrales
 * no son metas, son "esto ya no es una demora, es un dato que falta".
 */
export const HORAS_SOSPECHOSAS = {
  patio: 96,
  horno: 36,
  a_desmoldar: 48,
  a_empaquetar: 72,
} as const;
