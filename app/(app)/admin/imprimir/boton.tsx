"use client";

import { Boton } from "@/components/ui";

export function BotonImprimir() {
  return (
    <Boton type="button" tono="neutro" className="no-imprimir" onClick={() => window.print()}>
      Imprimir
    </Boton>
  );
}
