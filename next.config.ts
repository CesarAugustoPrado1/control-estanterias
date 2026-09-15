import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El driver de Neon usa `ws`, que es un paquete de Node y no se puede
  // empaquetar para el bundle del server: hay que dejarlo externo.
  serverExternalPackages: ["@neondatabase/serverless", "ws"],
};

export default nextConfig;
