import "server-only";
import { ZodError } from "zod";
import {
  ErrorDeAutorizacion,
  ErrorDeConfiguracion,
  ErrorDeNegocio,
} from "../errores";

// Se reexportan para que las acciones importen todo de un solo lugar.
export { ErrorDeAutorizacion, ErrorDeConfiguracion, ErrorDeNegocio, fallar } from "../errores";

/**
 * Resultado uniforme de toda server action.
 *
 * Es un valor de retorno y no una excepcion a proposito: del lado del cliente,
 * `{ ok: false }` es un RECHAZO DE NEGOCIO -el estado cambio, falta un dato- y
 * reintentarlo daria siempre lo mismo. Un throw, en cambio, llega al cliente
 * como fallo de red y si se reintenta. Esa distincion es la que permite
 * reintentar solo lo que tiene sentido reintentar (ver components/usar-accion).
 */
export type Resultado<T = void> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

/**
 * Envuelve una action: traduce lo esperable a mensaje y loguea lo inesperado.
 */
export async function ejecutar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, datos: await fn() };
  } catch (e) {
    if (e instanceof ErrorDeNegocio || e instanceof ErrorDeAutorizacion) {
      return { ok: false, error: e.message };
    }
    if (e instanceof ErrorDeConfiguracion) {
      console.error("[config]", e.message);
      return { ok: false, error: e.message };
    }
    const choque = mensajeDeChoque(e);
    if (choque) return { ok: false, error: choque };
    if (e instanceof ZodError) {
      const primero = e.errors[0];
      return { ok: false, error: primero?.message ?? "Datos inválidos." };
    }
    console.error("[accion] error inesperado:", e);
    return {
      ok: false,
      error:
        "Hubo un problema al guardar. Si vuelve a pasar, avisá al administrador.",
    };
  }
}

/** Ids que llegan de un formulario. */
export function ids(valor: unknown): number[] {
  if (!Array.isArray(valor)) return [];
  const limpio = valor
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(limpio)];
}

/**
 * Convierte texto de formulario a numero. Devuelve `null` si viene vacio.
 *
 * NUNCA usar `Number("")` directo: da 0, y en este sistema `null` significa
 * "no se cargo" mientras que 0 significa "se cargo cero". Son cosas distintas y
 * la diferencia se lee en las estadisticas.
 */
export function numeroOpcional(valor: FormDataEntryValue | null): number | null {
  if (valor === null) return null;
  const s = String(valor).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Traduce los rechazos de los indices unicos que protegen las reglas fisicas
 * del circuito (ver `tandas` en el esquema).
 *
 * En condiciones normales el motor valida antes y nunca llega aca. Pero si dos
 * operarios chocan en el mismo instante, o una correccion arma un estado
 * imposible, quien frena es la base, y el mensaje tiene que decir que paso en
 * idioma de planta y no "duplicate key value".
 */
function mensajeDeChoque(e: unknown): string | null {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = err?.code ?? err?.cause?.code;
  const constraint = err?.constraint ?? err?.cause?.constraint ?? "";
  if (code !== "23505") return null;
  if (constraint.includes("tandas_estanteria_retenida")) {
    return "Esa estantería ya tiene una tanda sin desmoldar. Actualizá la pantalla y elegí otra.";
  }
  if (constraint.includes("tandas_tarjeta_en_uso")) {
    return "Esa tarjeta ya está colgada en otra tanda que no se empaquetó. Actualizá la pantalla.";
  }
  if (constraint.includes("estanterias_placa")) {
    return "Ya hay una estantería con ese modelo, familia y número de placa.";
  }
  return null;
}
