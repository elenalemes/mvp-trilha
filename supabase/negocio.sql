-- ----------------------------------------------------------------------------
-- Sprint 3.4 · Negócio e checklist de fechamento — versão inicial
-- ----------------------------------------------------------------------------
-- A proposta aceita vira NEGÓCIO, e o negócio nasce com uma lista de tarefas.
--
-- A ideia da feature inteira: juntar as quatro partes num lugar só. A
-- incorporadora, o parceiro e a Trilha cada um faz a sua parte; o comprador —
-- que é o mais ansioso da jogada — acompanha de fora, por um link.
--
-- TRÊS DECISÕES QUE MOLDAM ESTE ARQUIVO:
--
--   1. O negócio NÃO repete os números. Eles já estão congelados na proposta.
--      Copiar de novo criaria uma segunda verdade, e duas verdades sobre
--      dinheiro é uma a mais do que se pode ter.
--
--   2. O checklist é DADO, não código. `checklist_modelo` é a receita;
--      `checklist_item` são as tarefas daquele negócio, copiadas na aceitação.
--      Mudar o processo é editar linhas — e um negócio que já começou continua
--      com o checklist que ele nasceu, que é o que se quer quando o processo
--      muda no meio de dez fechamentos abertos.
--
--   3. As etapas NÃO são uma fila. `etapa_ordem` é o nível de liberação, e
--      duas etapas podem dividir o mesmo nível. Documentação e Vistoria correm
--      juntas desde o dia 1; o Contrato é o gargalo de verdade.
--
--         nível 1 — Documentação (parceiro, incorporadora, Trilha) · Vistoria (Trilha)
--         nível 2 — Contrato        (trava até tudo do nível 1 fechar)
--         nível 3 — Pagamentos      (trava até o contrato)
--         nível 4 — Entrega de chaves (trava até o pagamento)
--
-- O QUE NÃO ESTÁ AQUI: o upload em si (Supabase Storage, item A3 do backlog) e
-- a ação de dispensar tarefa que não se aplica (A7, adiado em 22/set). O valor
-- `nao_se_aplica` já entra no enum mesmo sem uso — o mesmo motivo de
-- `cancelada` na proposta: `alter type` em enum no meio de um ciclo é o tipo
-- de coisa que não se quer fazer com pressa.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · Os tipos
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'negocio_status') then
    create type public.negocio_status as enum (
      'em_fechamento',  -- o checklist está rodando
      'em_jornada',     -- contrato assinado, comprador pagando as parcelas
      'em_quitacao',    -- mês seguinte ao fim da Trilha, financiando o saldo
      'quitado',
      'cancelado'       -- crédito reprovado, distrato, desistência
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'checklist_ator') then
    create type public.checklist_ator as enum ('trilha', 'incorporadora', 'parceiro');
  end if;

  if not exists (select 1 from pg_type where typname = 'checklist_tipo') then
    create type public.checklist_tipo as enum (
      'documento',     -- sobe um arquivo
      'confirmacao',   -- alguém fez algo fora do sistema e marca que fez
      'veredito'       -- tem desfecho, e o desfecho pode derrubar o negócio
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'checklist_status') then
    create type public.checklist_status as enum (
      'pendente',
      'concluido',
      'nao_se_aplica',  -- reservado (A7)
      'reprovado'       -- só para 'veredito'
    );
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- PARTE 2 · O negócio
--
-- `token` é o link do comprador. Aleatório para não ser adivinhável, e
-- PERMANENTE: ele recebe uma vez e volta quantas vezes quiser, até o fim.
-- Não é sessão, não expira.
--
-- As colunas de incorporadora, parceiro e comprador são redundantes em relação
-- à proposta, e de propósito: são o que as policies comparam. Sem elas toda
-- leitura viraria uma junção a mais, em toda tela.
-- ----------------------------------------------------------------------------

create table if not exists public.negocio (
  id                uuid primary key default gen_random_uuid(),

  -- Um negócio por proposta, e a proposta é onde moram os números.
  proposta_id       uuid not null unique references public.proposta (id) on delete restrict,

  imovel_id         uuid not null references public.imovel (id) on delete restrict,
  empreendimento_id uuid not null references public.empreendimento (id) on delete restrict,
  incorporadora_id  uuid not null references public.incorporadora (id) on delete restrict,
  parceiro_id       uuid not null references public.parceiro (id) on delete restrict,
  comprador_id      uuid not null references public.comprador (id) on delete restrict,

  status            public.negocio_status not null default 'em_fechamento',

  token             text not null unique default encode(gen_random_bytes(16), 'hex'),

  cancelado_motivo  text,
  cancelado_em      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.negocio is
  'Proposta aceita em execução. Os números vivem na proposta; aqui vive o andamento.';

comment on column public.negocio.token is
  'Link permanente do comprador. Aleatório, não adivinhável, sem expiração.';

create index if not exists negocio_incorporadora_idx on public.negocio (incorporadora_id);
create index if not exists negocio_parceiro_idx      on public.negocio (parceiro_id);
create index if not exists negocio_status_idx        on public.negocio (status, created_at desc);

drop trigger if exists negocio_touch on public.negocio;
create trigger negocio_touch before update on public.negocio
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 3 · A receita do checklist
--
-- Editar esta tabela muda os PRÓXIMOS negócios. Os que já começaram ficam como
-- nasceram — e é isso que permite mexer no processo sem bagunçar quem está no
-- meio dele.
-- ----------------------------------------------------------------------------

create table if not exists public.checklist_modelo (
  id              uuid primary key default gen_random_uuid(),

  etapa           text not null,
  /** Nível de liberação. Duas etapas podem dividir o mesmo número. */
  etapa_ordem     integer not null,
  ordem           integer not null,

  titulo          text not null,
  ator            public.checklist_ator not null,
  tipo            public.checklist_tipo not null,

  /** Documento com prazo de validade: CND, matrícula. */
  exige_validade  boolean not null default false,
  /** Tarefa que o comprador NÃO vê na página pública dele. */
  interna         boolean not null default false,

  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.checklist_modelo is
  'A receita do fechamento. Copiada para checklist_item quando a proposta é aceita.';

create unique index if not exists checklist_modelo_unico
  on public.checklist_modelo (etapa, titulo);


-- --------------------------------------------------------------- a receita
-- `on conflict do nothing` para o arquivo poder rodar duas vezes sem duplicar.

insert into public.checklist_modelo
  (etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna)
values
  -- Nível 1 · o que o corretor junta do comprador -----------------------------
  ('Documentação do comprador', 1, 1, 'Documento com foto',            'parceiro', 'documento', false, false),
  ('Documentação do comprador', 1, 2, 'Comprovante de endereço',       'parceiro', 'documento', false, false),
  ('Documentação do comprador', 1, 3, 'Ficha de qualificação',         'parceiro', 'documento', false, false),
  ('Documentação do comprador', 1, 4, 'Comprovante de estado civil',   'parceiro', 'documento', false, false),
  ('Documentação do comprador', 1, 5, 'Comprovante de renda',          'parceiro', 'documento', false, false),
  ('Documentação do comprador', 1, 6, 'Extrato do Banco Central',      'parceiro', 'documento', false, false),

  -- Nível 1 · o veredito que pode derrubar o negócio --------------------------
  -- Feita no Asaas. O sistema não interpreta o documento: o admin sobe o PDF.
  -- `interna` porque reprovação de crédito não se conta por página web.
  ('Verificação de crédito', 1, 1, 'Análise de crédito do comprador',  'trilha', 'veredito', false, true),

  -- Nível 1 · o que a incorporadora emite -------------------------------------
  -- Todos com validade: CND e matrícula vencem em ~30 dias, e é por isso que
  -- não se pede no cadastro da unidade.
  ('Documentação do imóvel', 1, 1, 'Matrícula atualizada com negativa de ônus', 'incorporadora', 'documento', true, false),
  ('Documentação do imóvel', 1, 2, 'Negativa de IPTU',                          'incorporadora', 'documento', true, false),
  ('Documentação do imóvel', 1, 3, 'Negativa de Sanep',                         'incorporadora', 'documento', true, false),
  ('Documentação do imóvel', 1, 4, 'Negativa de condomínio',                    'incorporadora', 'documento', true, false),

  -- Nível 1 · corre junto, não espera papel -----------------------------------
  ('Vistoria', 1, 1, 'Solicitar vistoria',  'trilha', 'confirmacao', false, false),
  ('Vistoria', 1, 2, 'Vistoria concluída',  'trilha', 'confirmacao', false, false),

  -- Nível 2 · o gargalo -------------------------------------------------------
  ('Contrato', 2, 1, 'Redigir contrato',                 'trilha', 'confirmacao', false, false),
  ('Contrato', 2, 2, 'Enviar para assinatura',           'trilha', 'confirmacao', false, false),
  ('Contrato', 2, 3, 'Contrato assinado por todos',      'trilha', 'confirmacao', false, false),

  -- Nível 3 · quem paga é o comprador -----------------------------------------
  ('Pagamentos', 3, 1, 'Gerar seguro incêndio',                    'trilha', 'confirmacao', false, false),
  ('Pagamentos', 3, 2, 'Gerar cobrança de vistoria e seguro',      'trilha', 'confirmacao', false, false),
  ('Pagamentos', 3, 3, 'Pagamento identificado',                   'trilha', 'confirmacao', false, false),

  -- Nível 4 --------------------------------------------------------------------
  ('Entrega de chaves', 4, 1, 'Liberar entrega de chaves', 'trilha', 'confirmacao', false, false)

on conflict (etapa, titulo) do nothing;


-- ----------------------------------------------------------------------------
-- PARTE 4 · As tarefas de um negócio
--
-- Cópia do modelo, e não referência a ele: é o que faz o negócio antigo
-- sobreviver a uma mudança de processo.
--
-- `referencia_externa` já existe sem uso automático: número da apólice da Lado
-- Bom, link do Autentique, id da cobrança no Asaas. Hoje colado à mão. Quando
-- as APIs entrarem, o campo já está aqui e o histórico não se perde.
-- ----------------------------------------------------------------------------

create table if not exists public.checklist_item (
  id                  uuid primary key default gen_random_uuid(),
  negocio_id          uuid not null references public.negocio (id) on delete cascade,

  etapa               text not null,
  etapa_ordem         integer not null,
  ordem               integer not null,
  titulo              text not null,
  ator                public.checklist_ator not null,
  tipo                public.checklist_tipo not null,
  exige_validade      boolean not null default false,
  interna             boolean not null default false,

  status              public.checklist_status not null default 'pendente',

  arquivo_path        text,
  referencia_externa  text,
  observacao          text,

  emitido_em          date,
  valido_ate          date,

  concluido_por       uuid references public.conta (id) on delete set null,
  concluido_em        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.checklist_item is
  'As tarefas de um fechamento. Cada ator só escreve nas que são dele.';

create index if not exists checklist_item_negocio_idx
  on public.checklist_item (negocio_id, etapa_ordem, etapa, ordem);

create index if not exists checklist_item_pendente_idx
  on public.checklist_item (negocio_id, ator)
  where status = 'pendente';

-- O que está para vencer. A consulta que faz a CND não morrer esquecida.
create index if not exists checklist_item_validade_idx
  on public.checklist_item (valido_ate)
  where valido_ate is not null and status = 'concluido';

drop trigger if exists checklist_item_touch on public.checklist_item;
create trigger checklist_item_touch before update on public.checklist_item
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 5 · Aceitar a proposta passa a criar o negócio
--
-- Substitui a função da sprint anterior. Agora são CINCO escritas na mesma
-- transação: decidir a proposta, travar o imóvel, invalidar as concorrentes,
-- criar o negócio e gerar o checklist dele.
--
-- Se qualquer uma falhar, nenhuma acontece. É a mesma lição de
-- `aplicar_importacao`: um negócio sem checklist seria pior do que um negócio
-- que não nasceu, porque ninguém repara.
-- ----------------------------------------------------------------------------

-- A versão da sprint anterior devolvia `void`; esta devolve o id do negócio.
-- O Postgres não troca o tipo de retorno com `create or replace`, então a
-- antiga sai antes. Sem esta linha o arquivo falha num banco montado do zero.
drop function if exists public.aceitar_proposta(uuid, text);

create or replace function public.aceitar_proposta(
  p_proposta uuid,
  p_motivo   text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_imovel   uuid;
  v_status   public.proposta_status;
  v_negocio  uuid;
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha aceita proposta.' using errcode = '42501';
  end if;

  select imovel_id, status into v_imovel, v_status
  from public.proposta where id = p_proposta
  for update;

  if v_imovel is null then
    raise exception 'Proposta não encontrada.' using errcode = 'P0002';
  end if;

  if v_status not in ('enviada', 'em_analise') then
    raise exception 'Esta proposta está como %, não dá para aceitar.', v_status
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.imovel where id = v_imovel and status = 'disponivel'
  ) then
    raise exception 'Esta unidade não está mais disponível.' using errcode = '22023';
  end if;

  update public.proposta
     set status = 'aceita', motivo_decisao = p_motivo,
         decidida_em = now(), decidida_por = auth.uid()
   where id = p_proposta;

  update public.imovel
     set status = 'em_negociacao'
   where id = v_imovel;

  -- As outras saem de cena. `invalidada`, não `recusada`: ninguém julgou o
  -- mérito delas, a unidade é que foi embora.
  update public.proposta
     set status = 'invalidada', decidida_em = now(), decidida_por = auth.uid()
   where imovel_id = v_imovel
     and id <> p_proposta
     and status in ('enviada', 'em_analise');

  -- O negócio, com os vínculos copiados da proposta.
  insert into public.negocio
    (proposta_id, imovel_id, empreendimento_id, incorporadora_id, parceiro_id, comprador_id)
  select p.id, p.imovel_id, p.empreendimento_id, p.incorporadora_id, p.parceiro_id, p.comprador_id
  from public.proposta p
  where p.id = p_proposta
  returning id into v_negocio;

  -- E o checklist dele, a partir da receita.
  insert into public.checklist_item
    (negocio_id, etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna)
  select v_negocio, m.etapa, m.etapa_ordem, m.ordem, m.titulo, m.ator, m.tipo,
         m.exige_validade, m.interna
  from public.checklist_modelo m
  where m.ativo;

  return v_negocio;
end;
$$;

revoke all on function public.aceitar_proposta(uuid, text) from public;
grant execute on function public.aceitar_proposta(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- PARTE 6 · Quem lê e quem escreve
--
-- A regra é uma frase: **cada ator LÊ o fechamento inteiro e ESCREVE só nas
-- tarefas que são dele.** Ver o que o outro está devendo é metade do valor da
-- tela — é o que transforma "cadê a matrícula?" numa linha que a pessoa vê
-- sozinha. Poder mexer é que não.
--
-- O arquivo em si não é protegido aqui: `arquivo_path` é só um caminho, e sem
-- permissão no bucket ele não abre nada. A trava de verdade dos documentos do
-- comprador é a policy do Storage — item A3, ainda por fazer.
-- ----------------------------------------------------------------------------

alter table public.negocio          enable row level security;
alter table public.checklist_modelo enable row level security;
alter table public.checklist_item   enable row level security;

grant select, insert, update, delete on public.negocio          to authenticated;
grant select                         on public.checklist_modelo to authenticated;
grant select, insert, update, delete on public.checklist_item   to authenticated;
grant all on public.negocio          to service_role;
grant all on public.checklist_modelo to service_role;
grant all on public.checklist_item   to service_role;

-- ------------------------------------------------------------------ negócio

drop policy if exists negocio_admin on public.negocio;
create policy negocio_admin on public.negocio
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

drop policy if exists negocio_incorporadora on public.negocio;
create policy negocio_incorporadora on public.negocio
  for select to authenticated
  using (incorporadora_id = public.minha_incorporadora_id());

drop policy if exists negocio_parceiro on public.negocio;
create policy negocio_parceiro on public.negocio
  for select to authenticated
  using (parceiro_id = public.meu_parceiro_id());

-- ------------------------------------------------------------------ receita
-- Todo mundo lê a receita; só a Trilha muda, e por enquanto só pelo SQL.

drop policy if exists checklist_modelo_leitura on public.checklist_modelo;
create policy checklist_modelo_leitura on public.checklist_modelo
  for select to authenticated using (true);

-- ------------------------------------------------------------------ tarefas

drop policy if exists checklist_admin on public.checklist_item;
create policy checklist_admin on public.checklist_item
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

-- A incorporadora lê o fechamento inteiro dos negócios dela...
drop policy if exists checklist_incorporadora_leitura on public.checklist_item;
create policy checklist_incorporadora_leitura on public.checklist_item
  for select to authenticated
  using (exists (
    select 1 from public.negocio n
    where n.id = checklist_item.negocio_id
      and n.incorporadora_id = public.minha_incorporadora_id()
  ));

-- ...e escreve só nas tarefas dela.
drop policy if exists checklist_incorporadora_escrita on public.checklist_item;
create policy checklist_incorporadora_escrita on public.checklist_item
  for update to authenticated
  using (
    ator = 'incorporadora'
    and exists (
      select 1 from public.negocio n
      where n.id = checklist_item.negocio_id
        and n.incorporadora_id = public.minha_incorporadora_id()
    )
  )
  with check (
    ator = 'incorporadora'
    and exists (
      select 1 from public.negocio n
      where n.id = checklist_item.negocio_id
        and n.incorporadora_id = public.minha_incorporadora_id()
    )
  );

-- O mesmo para o parceiro.
drop policy if exists checklist_parceiro_leitura on public.checklist_item;
create policy checklist_parceiro_leitura on public.checklist_item
  for select to authenticated
  using (exists (
    select 1 from public.negocio n
    where n.id = checklist_item.negocio_id
      and n.parceiro_id = public.meu_parceiro_id()
  ));

drop policy if exists checklist_parceiro_escrita on public.checklist_item;
create policy checklist_parceiro_escrita on public.checklist_item
  for update to authenticated
  using (
    ator = 'parceiro'
    and exists (
      select 1 from public.negocio n
      where n.id = checklist_item.negocio_id
        and n.parceiro_id = public.meu_parceiro_id()
    )
  )
  with check (
    ator = 'parceiro'
    and exists (
      select 1 from public.negocio n
      where n.id = checklist_item.negocio_id
        and n.parceiro_id = public.meu_parceiro_id()
    )
  );


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'tipos novos' as item,
       coalesce(string_agg(distinct t.typname, ' | '), 'NENHUM') as situacao
from pg_type t
where t.typname in ('negocio_status', 'checklist_ator', 'checklist_tipo', 'checklist_status')

union all

select 'tabela negocio',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'negocio'

union all

select 'tabela checklist_item',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'checklist_item'

union all

select 'receita do checklist',
       coalesce(string_agg(etapa || ' (' || total || ')', ' | ' order by etapa_ordem, etapa), 'VAZIA')
from (
  select etapa, etapa_ordem, count(*)::text as total
  from public.checklist_modelo where ativo
  group by etapa, etapa_ordem
) t

union all

select 'tarefas por ator',
       coalesce(string_agg(ator || ': ' || total, ' | ' order by ator), 'VAZIA')
from (
  select ator::text as ator, count(*)::text as total
  from public.checklist_modelo where ativo group by ator
) t

union all

select 'aceitar_proposta devolve',
       coalesce(string_agg(pg_get_function_result(p.oid), ' | '), 'NÃO EXISTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'aceitar_proposta'

union all

select 'policies do fechamento',
       coalesce(string_agg(polrelid::regclass::text || '.' || polname, ' | '
                order by polrelid::regclass::text, polname), 'NENHUMA')
from pg_policy
where polrelid in ('public.negocio'::regclass, 'public.checklist_item'::regclass);
