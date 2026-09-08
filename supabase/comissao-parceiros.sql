-- ----------------------------------------------------------------------------
-- Sprint 2.6 · Comissão dos parceiros imobiliários
-- ----------------------------------------------------------------------------
-- Quem vende é imobiliária, corretor ou parceiro, e recebe comissão sobre o
-- valor da venda. Esse dinheiro sai da entrada — não do saldo —, e é pago
-- parcelado ao longo da Trilha. Depois da Trilha, no pagamento do saldo, não
-- há mais desconto de comissão.
--
-- A conta, com 6% num imóvel de R$ 500.000 em 24 meses:
--   valor ajustado          552.910,98
--   entrada (20%)           110.582,20
--   comissão (6% do ajustado) 33.174,66   <- sobre o VALOR AJUSTADO, não sobre a entrada
--   incorporadora na Trilha  77.407,54   = entrada - comissão
--   por mês: comprador paga 5.160,50 = incorporadora 3.225,32
--                                     + parceiro      1.382,27
--                                     + gestão Trilha   552,91
--
-- O percentual é um por incorporadora, com padrão de 6%. Não varia por
-- empreendimento.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · O percentual
-- ----------------------------------------------------------------------------

alter table public.incorporadora
  add column if not exists percentual_comissao numeric(5, 2) not null default 6
  check (percentual_comissao >= 0 and percentual_comissao <= 100);

comment on column public.incorporadora.percentual_comissao is
  'Comissão dos parceiros imobiliários, em % do valor ajustado do imóvel. Sai da entrada, parcelada ao longo da Trilha. Padrão 6%.';


-- ----------------------------------------------------------------------------
-- PARTE 2 · A incorporadora precisa poder editar a própria ficha
--
-- BUG ENCONTRADO: a policy dela era só `for select`. O painel dela mandava o
-- update, o Postgres não encontrava nenhuma linha visível para alterar e
-- devolvia "UPDATE 0" — que NÃO é erro. O Supabase respondia sucesso e a tela
-- dizia "salvo" sem ter salvo nada. A tela "Meus dados" nunca funcionou.
--
-- O `with check` impede que ela reatribua a ficha para outra conta.
-- ----------------------------------------------------------------------------

drop policy if exists incorporadora_propria on public.incorporadora;

create policy incorporadora_propria_leitura on public.incorporadora
  for select to authenticated
  using (conta_id = auth.uid());

drop policy if exists incorporadora_propria_edicao on public.incorporadora;

create policy incorporadora_propria_edicao on public.incorporadora
  for update to authenticated
  using (conta_id = auth.uid())
  with check (conta_id = auth.uid());


-- ----------------------------------------------------------------------------
-- PARTE 3 · Salvar comissão e opções na mesma transação
--
-- A comissão é editada na mesma tela das opções, então salva junto: ou as
-- duas coisas valem, ou nenhuma.
--
-- O `if not found` existe por causa do bug da Parte 2: sem ele, uma falha de
-- permissão passaria como sucesso silencioso de novo.
-- ----------------------------------------------------------------------------

drop function if exists public.salvar_opcoes_pagamento(uuid, jsonb, uuid);

create or replace function public.salvar_opcoes_pagamento(
  p_incorporadora  uuid,
  p_opcoes         jsonb,
  p_empreendimento uuid default null,
  p_comissao       numeric default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_comissao is not null then
    update public.incorporadora
       set percentual_comissao = p_comissao
     where id = p_incorporadora;

    if not found then
      raise exception 'sem permissão para alterar a comissão desta incorporadora'
        using errcode = '42501';
    end if;
  end if;

  if p_empreendimento is null then
    delete from public.opcao_pagamento
    where incorporadora_id = p_incorporadora and empreendimento_id is null;
  else
    delete from public.opcao_pagamento
    where empreendimento_id = p_empreendimento;
  end if;

  insert into public.opcao_pagamento
    (incorporadora_id, empreendimento_id, ordem,
     percentual_entrada, percentual_ato, prazo_meses)
  select
    p_incorporadora,
    p_empreendimento,
    t.i::smallint,
    (t.o ->> 'percentual_entrada')::numeric,
    (t.o ->> 'percentual_ato')::numeric,
    (t.o ->> 'prazo_meses')::smallint
  from jsonb_array_elements(coalesce(p_opcoes, '[]'::jsonb)) with ordinality as t(o, i);
end;
$$;

grant execute on function public.salvar_opcoes_pagamento(uuid, jsonb, uuid, numeric) to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'comissão das incorporadoras' as item,
       string_agg(nome || ': ' || percentual_comissao || '%', ' | ' order by nome) as situacao
from public.incorporadora
union all
select 'função de salvar',
       coalesce(string_agg(p.oid::regprocedure::text, ' | '), 'NÃO EXISTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'salvar_opcoes_pagamento'
union all
select 'permissões da incorporadora',
       string_agg(polname || ' (' || case polcmd when 'r' then 'leitura' when 'w' then 'edição' when '*' then 'tudo' else polcmd::text end || ')', ' | ' order by polname)
from pg_policy where polrelid = 'public.incorporadora'::regclass;
