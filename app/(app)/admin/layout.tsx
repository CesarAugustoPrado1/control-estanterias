import { requerirRol } from "@/lib/auth";
import { Tabs } from "./tabs";

export default async function LayoutAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  await requerirRol();
  return (
    <>
      <Tabs />
      {children}
    </>
  );
}
