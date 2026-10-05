-- ----------------------------------------------------------------------------
-- Asaas · Parte 1 · Parcelas prontas para cobrança, e os repasses
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `parcelas-da-trilha.sql`. Rodar inteiro no SQL Editor.
--
-- É ADITIVO: não apaga nada, não muda valor de parcela que já existe e não
-- fala com o Asaas. Só prepara o banco. A cobrança de verdade começa nas
-- partes seguintes, e mesmo assim só para a trilha que for LIGADA à mão
-- (`negocio.cobranca_automatica`), e só com o interruptor geral ligado
-- (`config_financeiro.cobranca_ligada`). Os dois nascem DESLIGADOS.
--
-- DECIDIDO COM O MATHEUS (5/out):
--
--   * Cobrança gerada no dia 1, vencimento no dia 10, só Pix.
--   * Atraso: multa de 10% + juros de 1% ao mês. Multa e juros ficam com a
--     Trilha. A taxa do Asaas sai da gestão.
--   * A primeira parcela é maleável: às vezes vence no próprio fechamento
--     (paga no ato), às vezes no próximo dia 10. Da segunda em diante, sempre
--     dia 10 do mês seguinte à anterior.
--   * Repasse entre os dias 14 e 15, SÓ do que foi pago. Pagou atrasado, o
--     repasse sai na janela seguinte.
--   * O repasse vai por Pix para o vendedor e para cada corretor. O sistema só
--     GERA; quem aprova é uma pessoa, dentro do Asaas, com o código no celular.
--
-- A DIVISÃO FICA CONGELADA NA PARCELA. No momento em que a parcela nasce, o
-- banco grava quanto dela é do vendedor, de cada corretor e da Trilha — e cria
-- as linhas de repasse já com esses valores, esperando o pagamento. No dia 14
-- ninguém refaz conta: se a comissão de uma incorporadora for editada depois,
-- o dinheiro de uma parcela já gerada não muda.
--
-- Como a divisão é feita (a mesma de `lib/pagamento.ts`):
--
--   parcela  = vendedor + comissão + gestão
--   comissão = corretor 1 + corretor 2 + … + sobra que fica com a Trilha
--   Trilha   = gestão + sobra da comissão
--
--   A sobra de centavos das divisões (parcela e comissão) vai toda na
--   PRIMEIRA parcela — igual à conta da proposta. Assim a soma das 24 bate
--   exatamente com o total, sem centavo perdido.
--
--   Sem divisão cadastrada (`proposta_corretor` vazio), o corretor da
--   proposta leva a comissão inteira. Venda direta (sem corretor): a comissão
--   inteira fica com a Trilha.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · As regras do financeiro, num lugar só
--
-- Uma linha só (a chave é sempre `true`). Os números ficam aqui, e não no
-- código, para que ajustar a multa — por exemplo, depois de falar com o
-- jurídico — seja editar uma linha, não fazer deploy.
-- ----------------------------------------------------------------------------

create table if not exists public.config_financeiro (
  id                  boolean primary key default true check (id),

  dia_geracao         integer not null default 1  check (dia_geracao between 1 and 28),
  dia_vencimento      integer not null default 10 check (dia_vencimento between 1 and 28),
  dia_repasse_inicio  integer not null default 14 check (dia_repasse_inicio between 1 and 28),
  dia_repasse_fim     integer not null default 15 check (dia_repasse_fim between 1 and 28),

  multa_percentual    numeric(5,2) not null default 10 check (multa_percentual >= 0),
  juros_mensal        numeric(5,2) not null default 1  check (juros_mensal >= 0),

  -- 'sandbox' é a conta de teste do Asaas; 'producao' é a conta real.
  asaas_ambiente      text not null default 'sandbox' check (asaas_ambiente in ('sandbox', 'producao')),

  -- Interruptores gerais. Desligados, nenhuma rotina fala com o Asaas.
  cobranca_ligada     boolean not null default false,
  repasse_ligado      boolean not null default false,

  updated_at          timestamptz not null default now(),
  constraint config_financeiro_janela check (dia_repasse_fim >= dia_repasse_inicio)
);

insert into public.config_financeiro (id) values (true) on conflict (id) do nothing;

comment on table public.config_financeiro is
  'Regras de cobrança e repasse (dias, multa, juros, ambiente do Asaas) e os interruptores gerais. Uma linha só.';

drop trigger if exists config_financeiro_touch on public.config_financeiro;
create trigger config_financeiro_touch before update on public.config_financeiro
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 2 · O que a trilha e o comprador precisam guardar
-- ----------------------------------------------------------------------------

alter table public.negocio
  add column if not exists cobranca_automatica  boolean not null default false,
  add column if not exists primeiro_vencimento  date;

comment on column public.negocio.cobranca_automatica is
  'Ligada = o sistema gera as cobranças desta trilha no Asaas. Nasce desligada: cada trilha entra na cobrança automática por decisão da Trilha.';
comment on column public.negocio.primeiro_vencimento is
  'Vencimento da 1ª parcela. As seguintes vencem no dia 10 dos meses seguintes.';

alter table public.comprador
  add column if not exists asaas_cliente_id text;

create unique index if not exists comprador_asaas_cliente_unico
  on public.comprador (asaas_cliente_id) where asaas_cliente_id is not null;

comment on column public.comprador.asaas_cliente_id is
  'Id do cliente no Asaas (cus_...). Criado uma vez, reaproveitado em todas as cobranças.';


-- ----------------------------------------------------------------------------
-- PARTE 3 · A parcela ganha a divisão congelada e os campos do Asaas
-- ----------------------------------------------------------------------------

alter table public.parcela
  add column if not exists valor_vendedor      numeric(14,2),
  add column if not exists valor_corretores    numeric(14,2),
  add column if not exists valor_trilha        numeric(14,2),

  add column if not exists asaas_cobranca_id   text,
  add column if not exists asaas_status        text,
  add column if not exists asaas_link          text,
  add column if not exists cobranca_gerada_em  timestamptz,
  add column if not exists cobranca_erro       text,
  -- O que entrou de fato: com multa e juros, pode passar de `valor`.
  add column if not exists valor_pago          numeric(14,2);

-- Uma cobrança do Asaas pertence a uma parcela só. É a trava que impede a
-- mesma parcela de ser cobrada duas vezes.
create unique index if not exists parcela_asaas_cobranca_unica
  on public.parcela (asaas_cobranca_id) where asaas_cobranca_id is not null;

alter table public.parcela drop constraint if exists parcela_rateio_fecha;
alter table public.parcela add constraint parcela_rateio_fecha check (
  valor_vendedor is null
  or valor_vendedor + valor_corretores + valor_trilha = valor
);

comment on column public.parcela.valor_vendedor is
  'Parte do vendedor nesta parcela, congelada quando a parcela nasceu.';
comment on column public.parcela.valor_corretores is
  'Soma da comissão dos corretores nesta parcela. O detalhe por corretor está em `repasse`.';
comment on column public.parcela.valor_trilha is
  'Gestão + sobra da comissão. Fica com a Trilha; não gera repasse.';


-- ----------------------------------------------------------------------------
-- PARTE 4 · Os repasses
--
-- Uma linha por beneficiário por parcela. Nasce junto com a parcela, esperando
-- o pagamento, e anda assim:
--
--   aguardando_pagamento → pronto → enviado → concluido
--                                      ↘ falhou → (corrige a chave) → enviado
--
--   aguardando_pagamento  a parcela ainda não foi paga
--   pronto                paga; entra na próxima janela de repasse
--   enviado               transferência criada no Asaas, esperando a
--                         aprovação com o código no celular
--   concluido             o Asaas confirmou que o dinheiro saiu
--   falhou                o Asaas recusou (quase sempre: chave Pix)
--   cancelado             a trilha foi cancelada antes de repassar
--
-- A chave Pix é copiada para cá no momento do envio, e não antes: se o
-- vendedor trocar de chave no meio da trilha, vale a de agora. E fica
-- registrada a chave que foi usada em cada transferência.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'repasse_status') then
    create type public.repasse_status as enum
      ('aguardando_pagamento', 'pronto', 'enviado', 'concluido', 'falhou', 'cancelado');
  end if;
  if not exists (select 1 from pg_type where typname = 'repasse_beneficiario') then
    create type public.repasse_beneficiario as enum ('vendedor', 'corretor');
  end if;
end $$;

create table if not exists public.repasse (
  id                      uuid primary key default gen_random_uuid(),
  parcela_id              uuid not null references public.parcela (id) on delete cascade,
  negocio_id              uuid not null references public.negocio (id) on delete cascade,

  beneficiario            public.repasse_beneficiario not null,
  -- Preenchido só quando o beneficiário é corretor.
  parceiro_id             uuid references public.parceiro (id) on delete restrict,

  valor                   numeric(14,2) not null check (valor >= 0),
  status                  public.repasse_status not null default 'aguardando_pagamento',

  -- Copiados no envio (ver acima).
  chave_pix               text,
  chave_pix_tipo          text,

  asaas_transferencia_id  text,
  asaas_status            text,
  erro                    text,
  tentativas              integer not null default 0,

  enviado_em              timestamptz,
  concluido_em            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint repasse_quem check (
    (beneficiario = 'corretor') = (parceiro_id is not null)
  )
);

comment on table public.repasse is
  'O que sai para o vendedor e para cada corretor, por parcela. Valores congelados quando a parcela nasce.';

-- Um repasse por beneficiário por parcela. NULLS NOT DISTINCT faz o vendedor
-- (parceiro_id nulo) também contar como um só.
create unique index if not exists repasse_um_por_beneficiario
  on public.repasse (parcela_id, beneficiario, parceiro_id) nulls not distinct;

create unique index if not exists repasse_asaas_transferencia_unica
  on public.repasse (asaas_transferencia_id) where asaas_transferencia_id is not null;

create index if not exists repasse_status_idx  on public.repasse (status);
create index if not exists repasse_negocio_idx on public.repasse (negocio_id);

drop trigger if exists repasse_touch on public.repasse;
create trigger repasse_touch before update on public.repasse
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 5 · Os avisos do Asaas
--
-- Cada aviso (webhook) é gravado antes de ser processado. O Asaas pode mandar
-- o mesmo aviso mais de uma vez; o id dele é a chave, então o segundo é
-- ignorado. E fica o histórico para conferir qualquer divergência.
-- ----------------------------------------------------------------------------

create table if not exists public.asaas_evento (
  id            text primary key,
  evento        text not null,
  payload       jsonb not null,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  erro          text
);

comment on table public.asaas_evento is
  'Avisos (webhooks) recebidos do Asaas. O id do evento é a chave: aviso repetido não é processado duas vezes.';


-- ----------------------------------------------------------------------------
-- PARTE 6 · A data de cada parcela
--
-- 1ª parcela: a data escolhida. Se ninguém escolheu, dia 10 do mês seguinte
-- ao início da trilha.
-- Da 2ª em diante: dia 10 do mês seguinte à anterior. Funciona para os dois
-- jeitos de fechar:
--   1ª em 20/out (paga no ato)  → 2ª em 10/nov, 3ª em 10/dez …
--   1ª em 10/nov                → 2ª em 10/dez, 3ª em 10/jan …
-- ----------------------------------------------------------------------------

create or replace function public.vencimento_da_parcela(p_primeiro date, p_numero integer)
returns date
language sql stable set search_path = public as $$
  select case
    when p_numero = 1 then p_primeiro
    else (date_trunc('month', p_primeiro)
          + make_interval(months => p_numero - 1)
          + make_interval(days => (select dia_vencimento from public.config_financeiro) - 1))::date
  end;
$$;

create or replace function public.primeiro_vencimento_padrao(p_inicio timestamptz)
returns date
language sql stable set search_path = public as $$
  select (date_trunc('month', (p_inicio at time zone 'America/Sao_Paulo'))
          + interval '1 month'
          + make_interval(days => (select dia_vencimento from public.config_financeiro) - 1))::date;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 7 · Dividir uma parcela
--
-- Idempotente: parcela já dividida não é tocada. Se a conta não fechar (o que
-- só aconteceria com proposta inconsistente), a parcela fica SEM divisão e sem
-- repasse — e o repasse dela nunca sai sozinho, porque não existe. Melhor
-- parar do que mandar dinheiro errado.
-- ----------------------------------------------------------------------------

create or replace function public.ratear_parcela(p_parcela uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_parcela        public.parcela%rowtype;
  v_negocio        public.negocio%rowtype;
  v_proposta       public.proposta%rowtype;
  v_prazo          integer;
  v_gestao         bigint;
  v_com_mensal     bigint;
  v_com_total      bigint;
  v_com_parcela    bigint;
  v_corretores     bigint := 0;
  v_vendedor       bigint;
  v_valor          bigint;
  r                record;
begin
  select * into v_parcela from public.parcela where id = p_parcela;
  if not found or v_parcela.valor_vendedor is not null then
    return;
  end if;

  select * into v_negocio  from public.negocio  where id = v_parcela.negocio_id;
  select * into v_proposta from public.proposta where id = v_negocio.proposta_id;

  -- Tudo em centavos, como em lib/pagamento.ts.
  v_prazo      := v_proposta.prazo_meses;
  v_valor      := round(v_parcela.valor * 100);
  v_gestao     := round(coalesce((v_proposta.condicao ->> 'gestao')::numeric, 0) * 100);
  v_com_mensal := round(coalesce((v_proposta.condicao ->> 'comissaoMensal')::numeric, 0) * 100);
  v_com_total  := round(coalesce((v_proposta.condicao ->> 'comissaoTotal')::numeric, 0) * 100);

  -- A sobra da divisão da comissão vai na primeira parcela.
  v_com_parcela := v_com_mensal
    + case when v_parcela.numero = 1 then v_com_total - v_com_mensal * v_prazo else 0 end;

  v_vendedor := v_valor - v_gestao - v_com_parcela;

  if v_vendedor < 0 or v_com_parcela < 0 then
    raise warning 'parcela % (negócio %): divisão não fecha (vendedor %, comissão %). Ficou sem divisão.',
      v_parcela.numero, v_negocio.id, v_vendedor, v_com_parcela;
    return;
  end if;

  -- Corretores: pela divisão congelada da proposta, se houver.
  if exists (select 1 from public.proposta_corretor where proposta_id = v_proposta.id) then
    for r in
      select parceiro_id,
             round(valor_mensal * 100)::bigint
               + case when v_parcela.numero = 1
                      then round(valor_total * 100)::bigint - round(valor_mensal * 100)::bigint * v_prazo
                      else 0 end as centavos
        from public.proposta_corretor
       where proposta_id = v_proposta.id
    loop
      insert into public.repasse (parcela_id, negocio_id, beneficiario, parceiro_id, valor)
      values (v_parcela.id, v_negocio.id, 'corretor', r.parceiro_id, r.centavos / 100.0)
      on conflict do nothing;
      v_corretores := v_corretores + r.centavos;
    end loop;

  -- Um corretor só, sem divisão: leva a comissão inteira.
  elsif v_proposta.parceiro_id is not null and v_com_parcela > 0 then
    insert into public.repasse (parcela_id, negocio_id, beneficiario, parceiro_id, valor)
    values (v_parcela.id, v_negocio.id, 'corretor', v_proposta.parceiro_id, v_com_parcela / 100.0)
    on conflict do nothing;
    v_corretores := v_com_parcela;
  end if;
  -- Venda direta: não entra em nenhum dos dois; a comissão fica com a Trilha.

  if v_corretores > v_com_parcela then
    -- Corretores somando mais que a comissão: não manda nada.
    delete from public.repasse where parcela_id = v_parcela.id;
    raise warning 'parcela % (negócio %): corretores (%) passam da comissão (%). Ficou sem divisão.',
      v_parcela.numero, v_negocio.id, v_corretores, v_com_parcela;
    return;
  end if;

  insert into public.repasse (parcela_id, negocio_id, beneficiario, valor)
  values (v_parcela.id, v_negocio.id, 'vendedor', v_vendedor / 100.0)
  on conflict do nothing;

  update public.parcela
     set valor_vendedor   = v_vendedor / 100.0,
         valor_corretores = v_corretores / 100.0,
         valor_trilha     = (v_valor - v_vendedor - v_corretores) / 100.0
   where id = v_parcela.id;

  -- Parcela que já estava paga (trilhas anteriores a esta migração): os
  -- repasses nascem prontos.
  if v_parcela.status = 'paga' then
    update public.repasse set status = 'pronto'
     where parcela_id = v_parcela.id and status = 'aguardando_pagamento';
  end if;
end;
$$;

revoke all on function public.ratear_parcela(uuid) from public;


-- ----------------------------------------------------------------------------
-- PARTE 8 · Gerar as parcelas, agora com a regra do dia 10 e a divisão
--
-- Mesma função de `parcelas-da-trilha.sql`, com três mudanças:
--   1. Vencimento pela regra da PARTE 6, e não mais "um mês após o início".
--   2. A 1ª parcela leva a sobra de centavos (`primeiraParcela` da proposta),
--      como a conta da proposta sempre previu.
--   3. Cada parcela sai dividida, com os repasses esperando o pagamento.
-- Continua idempotente: parcela que já existe não é tocada.
-- ----------------------------------------------------------------------------

create or replace function public.gerar_parcelas(p_negocio uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_primeiro date;
  v_id       uuid;
begin
  select coalesce(n.primeiro_vencimento, public.primeiro_vencimento_padrao(n.jornada_inicio))
    into v_primeiro
    from public.negocio n
   where n.id = p_negocio and n.jornada_inicio is not null;

  if v_primeiro is null then
    return;
  end if;

  update public.negocio
     set primeiro_vencimento = v_primeiro
   where id = p_negocio and primeiro_vencimento is null;

  insert into public.parcela (negocio_id, numero, vencimento, valor)
  select n.id,
         g.n,
         public.vencimento_da_parcela(v_primeiro, g.n),
         case when g.n = 1
              then coalesce((p.condicao ->> 'primeiraParcela')::numeric, p.valor_parcela)
              else p.valor_parcela end
    from public.negocio n
    join public.proposta p on p.id = n.proposta_id
   cross join generate_series(1, p.prazo_meses) as g(n)
   where n.id = p_negocio
  on conflict (negocio_id, numero) do nothing;

  for v_id in select id from public.parcela where negocio_id = p_negocio loop
    perform public.ratear_parcela(v_id);
  end loop;
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 9 · Escolher o vencimento da 1ª parcela
--
-- Para o caso "paga no ato" ou "vence no próximo dia 10". Refaz as datas de
-- TODAS as parcelas, por isso só é permitido enquanto nenhuma foi cobrada no
-- Asaas: depois disso, a data está no boleto do cliente.
-- ----------------------------------------------------------------------------

create or replace function public.definir_primeiro_vencimento(p_negocio uuid, p_data date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha define o vencimento das parcelas.' using errcode = '42501';
  end if;

  if p_data is null then
    raise exception 'Informe a data do primeiro vencimento.' using errcode = '22023';
  end if;

  if exists (select 1 from public.parcela
              where negocio_id = p_negocio
                and (asaas_cobranca_id is not null or status = 'paga')) then
    raise exception 'Há parcela já cobrada ou paga nesta trilha: as datas não podem mais mudar.'
      using errcode = '22023';
  end if;

  update public.negocio set primeiro_vencimento = p_data where id = p_negocio;

  update public.parcela
     set vencimento = public.vencimento_da_parcela(p_data, numero)
   where negocio_id = p_negocio;
end;
$$;

revoke all on function public.definir_primeiro_vencimento(uuid, date) from public;
grant execute on function public.definir_primeiro_vencimento(uuid, date) to authenticated;


-- ----------------------------------------------------------------------------
-- PARTE 10 · Pagou → o repasse fica pronto. Desmarcou → volta a esperar.
--
-- Vale para os dois jeitos de marcar: à mão no painel e, depois, pelo aviso do
-- Asaas. Repasse já enviado não volta atrás por aqui — dinheiro que saiu se
-- resolve olhando, não por gatilho.
-- ----------------------------------------------------------------------------

create or replace function public.parcela_move_repasses()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paga' and old.status <> 'paga' then
    update public.repasse set status = 'pronto'
     where parcela_id = new.id and status = 'aguardando_pagamento';
  elsif new.status <> 'paga' and old.status = 'paga' then
    update public.repasse set status = 'aguardando_pagamento'
     where parcela_id = new.id and status = 'pronto';
  end if;
  return null;
end;
$$;

drop trigger if exists parcela_move_repasses on public.parcela;
create trigger parcela_move_repasses after update of status on public.parcela
  for each row execute function public.parcela_move_repasses();


-- ----------------------------------------------------------------------------
-- PARTE 11 · Quem vê o quê
--
-- Admin: tudo. Incorporadora: os repasses dela (é o dinheiro dela).
-- Corretor: os dele. Regras do financeiro e avisos do Asaas: só a Trilha lê,
-- e só o servidor escreve nos avisos.
-- ----------------------------------------------------------------------------

alter table public.config_financeiro enable row level security;
alter table public.repasse           enable row level security;
alter table public.asaas_evento      enable row level security;

grant select, update on public.config_financeiro to authenticated;
grant select, insert, update, delete on public.repasse to authenticated;
grant select on public.asaas_evento to authenticated;
grant all on public.config_financeiro, public.repasse, public.asaas_evento to service_role;

drop policy if exists config_financeiro_admin on public.config_financeiro;
create policy config_financeiro_admin on public.config_financeiro
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

drop policy if exists repasse_admin on public.repasse;
create policy repasse_admin on public.repasse
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

drop policy if exists repasse_incorporadora on public.repasse;
create policy repasse_incorporadora on public.repasse
  for select to authenticated
  using (beneficiario = 'vendedor' and exists (
    select 1 from public.negocio n
     where n.id = repasse.negocio_id
       and n.incorporadora_id = public.minha_incorporadora_id()
  ));

drop policy if exists repasse_parceiro on public.repasse;
create policy repasse_parceiro on public.repasse
  for select to authenticated
  using (parceiro_id = public.meu_parceiro_id());

drop policy if exists asaas_evento_admin on public.asaas_evento;
create policy asaas_evento_admin on public.asaas_evento
  for select to authenticated
  using (public.eh_admin_trilha());


-- ----------------------------------------------------------------------------
-- PARTE 12 · As trilhas que já existem
--
-- As datas das parcelas que já existem NÃO mudam: só se registra a data da 1ª
-- como `primeiro_vencimento`, e cada parcela ganha a divisão e os repasses.
-- Para trocar as datas para a regra do dia 10, use a escolha da PARTE 9 na
-- tela da trilha (enquanto nada foi cobrado).
-- ----------------------------------------------------------------------------

update public.negocio n
   set primeiro_vencimento = p.vencimento
  from public.parcela p
 where p.negocio_id = n.id and p.numero = 1
   and n.primeiro_vencimento is null;

-- A função antiga punha na 1ª parcela o mesmo valor das outras, perdendo a
-- sobra de centavos que a proposta previa. Corrige onde ainda dá: 1ª parcela
-- em aberto, nunca cobrada e ainda sem divisão. Paga ou cobrada fica como
-- está — o vendedor absorve os centavos.
update public.parcela pa
   set valor = (p.condicao ->> 'primeiraParcela')::numeric
  from public.negocio n
  join public.proposta p on p.id = n.proposta_id
 where pa.negocio_id = n.id
   and pa.numero = 1
   and pa.status = 'aberta'
   and pa.asaas_cobranca_id is null
   and pa.valor_vendedor is null
   and p.condicao ? 'primeiraParcela'
   and pa.valor <> (p.condicao ->> 'primeiraParcela')::numeric;

do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.parcela where valor_vendedor is null loop
    perform public.ratear_parcela(v_id);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'regras do financeiro' as item,
       format('gera dia %s · vence dia %s · repasse %s a %s · multa %s%% · juros %s%% a.m. · %s · cobrança %s · repasse %s',
              dia_geracao, dia_vencimento, dia_repasse_inicio, dia_repasse_fim,
              multa_percentual, juros_mensal, asaas_ambiente,
              case when cobranca_ligada then 'LIGADA' else 'desligada' end,
              case when repasse_ligado  then 'LIGADO' else 'desligado' end) as situacao
  from public.config_financeiro

union all

select 'parcelas com divisão',
       format('%s de %s', count(*) filter (where valor_vendedor is not null), count(*))
  from public.parcela

union all

select 'parcelas SEM divisão (conferir)',
       coalesce(string_agg(format('negócio %s, parcela %s', negocio_id, numero), ' | '), 'nenhuma')
  from public.parcela where valor_vendedor is null

union all

select 'repasses criados',
       coalesce(string_agg(format('%s: %s', status, n), ' | '), 'nenhum')
  from (select status, count(*) as n from public.repasse group by status) t

union all

select 'trilhas com cobrança automática ligada',
       count(*)::text
  from public.negocio where cobranca_automatica;
