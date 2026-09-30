-- ----------------------------------------------------------------------------
-- Sprint 6.3 · O negócio vira trilha quando o fechamento acaba
-- ----------------------------------------------------------------------------
-- Hoje todo negócio fica preso em `em_fechamento` para sempre: a última tarefa
-- é marcada, a tela diz "Tudo feito", e nada acontece. O enum `negocio_status`
-- nasceu na 3.4 já com os cinco estados da vida inteira do negócio
-- (em_fechamento · em_jornada · em_quitacao · quitado · cancelado), e esta
-- migração escreve a primeira passagem entre eles.
--
-- DECIDIDO COM O MATHEUS (30/set):
--
--   * A passagem é AUTOMÁTICA. Quando a última tarefa fecha, o negócio vai
--     para `em_jornada` e a data de início é gravada. A última tarefa da
--     receita é "Liberar entrega de chaves" — marcar isso É o começo da
--     jornada, e pedir um botão depois seria pedir a mesma confirmação duas
--     vezes.
--
--   * E é REVERSÍVEL. Reabrir qualquer tarefa devolve o negócio para
--     `em_fechamento`. Sem isso, um clique errado na última tarefa começaria
--     uma jornada de 24 meses que só o SQL desfaria.
--
--   * `jornada_inicio` é gravada na passagem e NÃO é apagada na volta. Se a
--     tarefa for reaberta e fechada de novo no mesmo dia, a data original é a
--     verdadeira — foi quando o comprador recebeu as chaves. Só um negócio que
--     nunca chegou lá tem a coluna nula.
--
-- O QUE NÃO ESTÁ AQUI: a jornada em si. As parcelas, o aviso do 18º mês e a
-- passagem para `em_quitacao` no 25º são outra conversa; `em_jornada` é o
-- estado, não o motor. O fim previsto é uma conta sobre `jornada_inicio` e o
-- `prazo_meses` da proposta, e por isso não vira coluna.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · Quando a jornada começou
-- ----------------------------------------------------------------------------

alter table public.negocio
  add column if not exists jornada_inicio timestamptz;

comment on column public.negocio.jornada_inicio is
  'Quando o fechamento terminou e a trilha começou. Os 24 meses contam daqui. Nula = nunca chegou lá.';

create index if not exists negocio_jornada_idx
  on public.negocio (jornada_inicio desc)
  where jornada_inicio is not null;


-- ----------------------------------------------------------------------------
-- PARTE 2 · A passagem
--
-- Um gatilho em `checklist_item`, e não em `negocio`: quem sabe que o
-- fechamento acabou é a última tarefa a fechar, e ela não tem como avisar de
-- outro jeito. Roda DEPOIS do update, porque precisa enxergar a linha nova
-- junto das irmãs.
--
-- `nao_se_aplica` conta como fechada aqui pelo mesmo motivo que conta em
-- `estaFechada()` no app: ninguém está esperando por ela. Um negócio cujas
-- pendências foram todas dispensadas terminou de verdade.
-- ----------------------------------------------------------------------------

create or replace function public.negocio_seque_o_checklist()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_falta   boolean;
  v_status  public.negocio_status;
begin
  select status into v_status from public.negocio where id = new.negocio_id;

  -- Cancelado, em quitação ou quitado não voltam a depender de checklist.
  if v_status not in ('em_fechamento', 'em_jornada') then
    return null;
  end if;

  select exists (
    select 1 from public.checklist_item i
    where i.negocio_id = new.negocio_id
      and i.status not in ('concluido', 'nao_se_aplica')
  ) into v_falta;

  if not v_falta and v_status = 'em_fechamento' then
    update public.negocio
       set status = 'em_jornada',
           -- coalesce: quem já esteve em jornada mantém a data original.
           jornada_inicio = coalesce(jornada_inicio, now())
     where id = new.negocio_id;

  elsif v_falta and v_status = 'em_jornada' then
    update public.negocio
       set status = 'em_fechamento'
     where id = new.negocio_id;
  end if;

  return null;
end;
$$;

-- Sem `delete` de propósito: num AFTER DELETE o `new` é nulo, e o único lugar
-- que apaga tarefa é a limpeza de teste, que apaga o negócio junto.
drop trigger if exists checklist_item_fecha_negocio on public.checklist_item;
create trigger checklist_item_fecha_negocio
  after insert or update on public.checklist_item
  for each row execute function public.negocio_seque_o_checklist();


-- ----------------------------------------------------------------------------
-- PARTE 3 · Os negócios que já terminaram e ninguém moveu
--
-- Quem fechou todas as tarefas antes desta migração continua em
-- `em_fechamento`. A data de início aqui é a da última tarefa concluída, que é
-- o mais perto da verdade que este banco tem.
-- ----------------------------------------------------------------------------

update public.negocio n
   set status = 'em_jornada',
       jornada_inicio = coalesce(
         n.jornada_inicio,
         (select max(i.concluido_em) from public.checklist_item i where i.negocio_id = n.id),
         now()
       )
 where n.status = 'em_fechamento'
   and exists (select 1 from public.checklist_item i where i.negocio_id = n.id)
   and not exists (
     select 1 from public.checklist_item i
     where i.negocio_id = n.id
       and i.status not in ('concluido', 'nao_se_aplica')
   );


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'coluna jornada_inicio' as item,
       coalesce(string_agg(data_type, ', '), 'NÃO EXISTE') as situacao
from information_schema.columns
where table_schema = 'public' and table_name = 'negocio' and column_name = 'jornada_inicio'

union all

select 'gatilho da passagem',
       coalesce(string_agg(tgname, ', '), 'NENHUM')
from pg_trigger
where tgrelid = 'public.checklist_item'::regclass
  and tgname = 'checklist_item_fecha_negocio'

union all

select 'negócios por situação',
       coalesce(string_agg(situacao, ' | ' order by situacao), 'NENHUM')
from (
  select status::text || ': ' || count(*)::text as situacao
  from public.negocio group by status
) t;
