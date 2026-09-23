-- ----------------------------------------------------------------------------
-- Sprint 4.1b · PARTE 1 de 2 — o tipo de tarefa "formulário"
-- ----------------------------------------------------------------------------
-- RODE ESTE ARQUIVO SOZINHO, ANTES do `ficha-qualificacao-2.sql`.
--
-- Por que separado: o Postgres deixa criar um valor novo num enum, mas não
-- deixa USAR esse valor na mesma transação. E o SQL Editor do Supabase roda o
-- script inteiro numa transação só. Se as duas partes estivessem juntas, a
-- segunda falharia com "unsafe use of new value".
--
-- `formulario` é a tarefa em que alguém PREENCHE dados em vez de anexar um
-- papel — hoje, a ficha de qualificação do comprador.
-- ----------------------------------------------------------------------------

alter type public.checklist_tipo add value if not exists 'formulario';

-- Conferência pelo catálogo: `enum_range` já contaria como uso do valor novo.
select 'tipos de tarefa' as item,
       string_agg(e.enumlabel, ', ' order by e.enumsortorder) as situacao
from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'checklist_tipo';
