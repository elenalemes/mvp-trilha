-- ----------------------------------------------------------------------------
-- Sprint 3.4 · Cancelar negócio (item A6)
-- ----------------------------------------------------------------------------
-- Negócio cai. Crédito reprovado, comprador desiste, incorporadora tira a
-- unidade do estoque — os três acontecem, e até aqui o sistema não tinha o que
-- fazer com eles: a proposta ficava "aceita" para sempre e a unidade presa em
-- `em_negociacao`.
--
-- NÃO se apaga nada. A proposta, o negócio e o checklist continuam existindo,
-- marcados como cancelados, com motivo e data. Apagar faria sumir o registro
-- de que aquela unidade esteve vendida, de quem vendeu e por quanto — e essa
-- é exatamente a pergunta que alguém faz três meses depois.
--
-- A UNIDADE É UMA ESCOLHA, não uma consequência automática:
--
--   disponivel   — o negócio caiu, o imóvel volta para a prateleira.
--   indisponivel — o imóvel saiu do estoque e não é para vender de novo.
--
-- Tratar os dois como a mesma coisa devolveria ao simulador uma unidade que a
-- incorporadora acabou de retirar.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------

create or replace function public.cancelar_negocio(
  p_negocio  uuid,
  p_motivo   text,
  p_destino  text default 'disponivel'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_imovel   uuid;
  v_proposta uuid;
  v_status   public.negocio_status;
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha cancela negócio.' using errcode = '42501';
  end if;

  if p_destino not in ('disponivel', 'indisponivel') then
    raise exception 'Destino inválido para a unidade: %.', p_destino using errcode = '22023';
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'O motivo do cancelamento é obrigatório.' using errcode = '22023';
  end if;

  select imovel_id, proposta_id, status
    into v_imovel, v_proposta, v_status
  from public.negocio where id = p_negocio
  for update;

  if v_imovel is null then
    raise exception 'Negócio não encontrado.' using errcode = 'P0002';
  end if;

  if v_status = 'cancelado' then
    raise exception 'Este negócio já está cancelado.' using errcode = '22023';
  end if;

  if v_status = 'quitado' then
    raise exception 'Negócio quitado não se cancela.' using errcode = '22023';
  end if;

  update public.negocio
     set status = 'cancelado', cancelado_motivo = p_motivo, cancelado_em = now()
   where id = p_negocio;

  -- A proposta acompanha: ela não foi recusada nem invalidada, ela era um
  -- negócio que caiu. `cancelada` já existia no enum desde o `proposta.sql`,
  -- reservada para este momento.
  update public.proposta
     set status = 'cancelada',
         motivo_decisao = p_motivo,
         decidida_em = now(),
         decidida_por = auth.uid()
   where id = v_proposta;

  update public.imovel
     set status = p_destino::public.imovel_status
   where id = v_imovel;
end;
$$;

revoke all on function public.cancelar_negocio(uuid, text, text) from public;
grant execute on function public.cancelar_negocio(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'função criada' as item,
       coalesce(string_agg(p.oid::regprocedure::text, ' | '), 'NÃO EXISTE') as situacao
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'cancelar_negocio'

union all

select 'negócios por situação',
       coalesce(string_agg(status || ': ' || total, ' | ' order by status), 'nenhum negócio')
from (select status::text as status, count(*)::text as total
      from public.negocio group by status) t;
