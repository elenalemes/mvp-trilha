-- ----------------------------------------------------------------------------
-- DESFAZER · Asaas Parte 1
-- ----------------------------------------------------------------------------
-- Só rode se precisar voltar atrás de `asaas-1-parcelas-e-repasses.sql`.
-- Devolve o banco ao estado anterior, com UMA diferença: se a migração
-- corrigiu o valor da 1ª parcela de alguma trilha antiga (sobra de centavos),
-- esse valor corrigido fica — ele é o certo, segundo a própria proposta.
--
-- Apaga os repasses e as regras do financeiro. Não toque nisto depois que o
-- Asaas estiver gerando cobranças de verdade.
-- ----------------------------------------------------------------------------

drop trigger if exists parcela_move_repasses on public.parcela;
drop function if exists public.parcela_move_repasses();
drop function if exists public.definir_primeiro_vencimento(uuid, date);
drop function if exists public.ratear_parcela(uuid);

drop table if exists public.repasse;
drop table if exists public.asaas_evento;
drop table if exists public.config_financeiro;
drop type  if exists public.repasse_status;
drop type  if exists public.repasse_beneficiario;

alter table public.parcela drop constraint if exists parcela_rateio_fecha;
drop index if exists public.parcela_asaas_cobranca_unica;
alter table public.parcela
  drop column if exists valor_vendedor,
  drop column if exists valor_corretores,
  drop column if exists valor_trilha,
  drop column if exists asaas_cobranca_id,
  drop column if exists asaas_status,
  drop column if exists asaas_link,
  drop column if exists cobranca_gerada_em,
  drop column if exists cobranca_erro,
  drop column if exists valor_pago;

drop index if exists public.comprador_asaas_cliente_unico;
alter table public.comprador drop column if exists asaas_cliente_id;

-- A função antiga de gerar parcelas, exatamente como em `parcelas-da-trilha.sql`.
create or replace function public.gerar_parcelas(p_negocio uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.parcela (negocio_id, numero, vencimento, valor)
  select n.id,
         g.n,
         (((n.jornada_inicio at time zone 'America/Sao_Paulo')::date
           + (g.n * interval '1 month'))::date),
         p.valor_parcela
    from public.negocio n
    join public.proposta p on p.id = n.proposta_id
   cross join generate_series(1, p.prazo_meses) as g(n)
   where n.id = p_negocio
     and n.jornada_inicio is not null
  on conflict (negocio_id, numero) do nothing;
end;
$$;

drop function if exists public.vencimento_da_parcela(date, integer);
drop function if exists public.primeiro_vencimento_padrao(timestamptz);

alter table public.negocio
  drop column if exists cobranca_automatica,
  drop column if exists primeiro_vencimento;

select 'desfeito' as situacao,
       (select count(*) from information_schema.tables
         where table_schema = 'public' and table_name in ('repasse', 'config_financeiro', 'asaas_evento')) as tabelas_restantes;
