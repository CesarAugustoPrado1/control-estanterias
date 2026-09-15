import type { MetadataRoute } from "next";

/**
 * Para que se pueda "agregar a pantalla de inicio" en los celulares de planta y
 * abra sin barra de navegador: un toque menos por cada uso.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Control de Estanterías",
    short_name: "Estanterías",
    description: "Seguimiento de estanterías de revestimientos cementicios",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#1e3a8a",
    icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
