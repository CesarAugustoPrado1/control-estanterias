/**
 * Escala de colores para ubicarse en pantallas largas: cada caja (o seccion)
 * lleva una franja de color a la izquierda, de frio arriba a calido abajo.
 * La de mas arriba es siempre violeta y la de mas abajo siempre naranja; las
 * del medio se reparten segun cuantas haya.
 *
 * Rojo queda afuera a proposito: es el color de los avisos ("Ojo", "programa
 * incompleto") y no tiene que confundirse con una caja comun.
 *
 * Las clases van escritas enteras para que Tailwind las encuentre.
 */
export type Tono = {
  /** Franja izquierda de la caja. */
  franja: string;
  /** Fondo suave del titulo. */
  fondo: string;
};

const ESCALA: Tono[] = [
  { franja: "border-l-violet-500", fondo: "bg-violet-50" },
  { franja: "border-l-indigo-500", fondo: "bg-indigo-50" },
  { franja: "border-l-blue-500", fondo: "bg-blue-50" },
  { franja: "border-l-sky-500", fondo: "bg-sky-50" },
  { franja: "border-l-cyan-500", fondo: "bg-cyan-50" },
  { franja: "border-l-teal-500", fondo: "bg-teal-50" },
  { franja: "border-l-emerald-500", fondo: "bg-emerald-50" },
  { franja: "border-l-lime-500", fondo: "bg-lime-50" },
  { franja: "border-l-yellow-500", fondo: "bg-yellow-50" },
  { franja: "border-l-amber-500", fondo: "bg-amber-50" },
  { franja: "border-l-orange-500", fondo: "bg-orange-50" },
];

/** `n` tonos repartidos de frio a calido. Uno solo: el del medio. */
export function escala(n: number): Tono[] {
  if (n <= 0) return [];
  if (n === 1) return [ESCALA[5]];
  const ultimo = ESCALA.length - 1;
  return Array.from({ length: n }, (_, i) => ESCALA[Math.round((i * ultimo) / (n - 1))]);
}

/** Lo mismo, pero se pide por nombre: `const t = tonos(["fecha", "llenado"]); t.fecha`. */
export function tonos<K extends string>(claves: readonly K[]): Record<K, Tono> {
  const e = escala(claves.length);
  return Object.fromEntries(claves.map((k, i) => [k, e[i]])) as Record<K, Tono>;
}

/**
 * Para pantallas con muchas secciones en fila: `const tono = secuencia(8)` y
 * cada seccion, de arriba hacia abajo, pide `tono()`. Una que no se muestra
 * no gasta color.
 */
export function secuencia(n: number): () => Tono | undefined {
  const e = escala(n);
  let i = 0;
  return () => e[i++];
}
