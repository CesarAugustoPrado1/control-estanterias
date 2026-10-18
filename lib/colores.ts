/**
 * Color de un producto para mostrarlo al lado del nombre y evitar confusiones
 * al elegir ("Ekos Gris" contra "Ekos Beige"). Modulo puro: lo usan servidor y
 * cliente.
 *
 * Sale de las palabras del nombre del producto y, si ahi no hay ninguna, de la
 * familia. Es una muestra orientativa del tono, no el color exacto de la pieza.
 */

export type ColorProducto = { hex: string; nombre: string; claro: boolean };

/**
 * Palabra -> color. El orden importa: gana la primera que aparece en el texto,
 * y las palabras mas especificas ("terracota") van antes que las generales.
 */
const PALETA: { palabras: string[]; color: ColorProducto }[] = [
  {
    palabras: ["terracota", "terracotta", "ladrillo"],
    color: { hex: "#c0603a", nombre: "terracota", claro: false },
  },
  { palabras: ["habano", "tabaco"], color: { hex: "#9a6438", nombre: "habano", claro: false } },
  { palabras: ["marron", "chocolate", "cafe"], color: { hex: "#6e4329", nombre: "marrón", claro: false } },
  { palabras: ["rojo", "colorado"], color: { hex: "#a83a2c", nombre: "rojo", claro: false } },
  { palabras: ["ocre", "amarillo", "mostaza"], color: { hex: "#cf9f35", nombre: "ocre", claro: false } },
  { palabras: ["verde", "musgo"], color: { hex: "#5f7d4a", nombre: "verde", claro: false } },
  { palabras: ["negro", "grafito", "antracita"], color: { hex: "#2e2e30", nombre: "negro", claro: false } },
  { palabras: ["gris", "plomo"], color: { hex: "#8b8f94", nombre: "gris", claro: false } },
  {
    palabras: ["beige", "bige", "bieges", "arena", "crema", "hueso"],
    color: { hex: "#d8c09a", nombre: "beige", claro: true },
  },
  { palabras: ["blanco", "blanca", "marfil"], color: { hex: "#f4f1ea", nombre: "blanco", claro: true } },
  { palabras: ["natural"], color: { hex: "#c9bda6", nombre: "natural", claro: true } },
];

const SIN_COLOR: ColorProducto = { hex: "#e2e8f0", nombre: "sin color", claro: true };

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function buscar(texto: string): ColorProducto | null {
  const palabras = normalizar(texto).split(/[^a-z]+/);
  for (const { palabras: claves, color } of PALETA) {
    if (claves.some((c) => palabras.includes(c))) return color;
  }
  return null;
}

export function colorDeProducto(nombre: string, familia?: string | null): ColorProducto {
  return buscar(nombre) ?? (familia ? buscar(familia) : null) ?? SIN_COLOR;
}
