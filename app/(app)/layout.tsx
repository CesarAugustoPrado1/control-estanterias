import { Navegacion } from "@/components/navegacion";
import { requerirSesion } from "@/lib/auth";

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await requerirSesion();
  return (
    <>
      <Navegacion rol={sesion.rol} nombre={sesion.nombre} />
      <main>{children}</main>
    </>
  );
}
