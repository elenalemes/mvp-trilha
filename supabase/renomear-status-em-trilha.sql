-- ============================================================================
-- Renomear o status "vendido" para "em_trilha"
--
-- Por que: no modelo da Trilha a unidade nao esta vendida quando entra no
-- negocio -- a quitacao acontece no 25o mes. "Em Trilha" descreve o estado
-- real: a unidade saiu do estoque e entrou na jornada.
--
-- Este comando renomeia o RÓTULO do valor no enum. As linhas existentes
-- continuam apontando para ele, entao nenhum imovel muda de status nem
-- precisa ser atualizado. E uma operacao instantanea e reversivel.
--
-- Rode este arquivo inteiro.
-- ============================================================================

alter type public.imovel_status rename value 'vendido' to 'em_trilha';

-- Conferencia: deve listar disponivel | reservado | em_negociacao | em_trilha | indisponivel
select string_agg(e.enumlabel, ' | ' order by e.enumsortorder) as valores
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname = 'imovel_status';
