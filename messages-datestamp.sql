-- Kreyptedd — Patch additif — corrige le calcul des rounds à la lecture
alter table messages add column if not exists date_stamp bigint;
