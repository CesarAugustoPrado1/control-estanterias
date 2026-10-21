-- 0017 · Trompos fuera de servicio.
--
-- Un trompo puede quedar fuera de servicio por un tiempo (rotura,
-- mantenimiento). Cada fila es un periodo: desde un dia y, si se sabe, hasta
-- otro (sin "hasta": hasta que se vuelva a poner en servicio). El programa
-- cuenta los lavados con los trompos disponibles cada dia: lo que iba al
-- trompo parado pasa al otro.

CREATE TABLE IF NOT EXISTS estanterias.trompos_fuera (
  id serial PRIMARY KEY,
  trompo estanterias.trompo NOT NULL,
  desde date NOT NULL,
  hasta date,
  motivo text,
  creado_por text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta IS NULL OR hasta >= desde)
);
