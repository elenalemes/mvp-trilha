-- ----------------------------------------------------------------------------
-- Sprint 3.1 · Parceiro imobiliário — cadastro e acesso de leitura
-- ----------------------------------------------------------------------------
-- Quem vende é imobiliária ou corretor. Até aqui ele não existia no sistema:
-- a comissão dele era calculada, mas não havia a quem mostrá-la. Agora ele
-- entra na plataforma e enxerga o estoque da incorporadora a que está ligado.
--
-- REGRAS (definidas em 4/set):
--
--   * um parceiro pertence a UMA incorporadora. Se um dia precisar de várias,
--     `incorporadora_id` vira tabela de ligação — migração pequena, e por isso
--     não vale pagar a complexidade agora.
--   * o admin da Trilha cadastra parceiros de qualquer incorporadora; a
--     incorporadora cadastra, edita e remove os dela.
--   * o parceiro NÃO escreve nada. Nem imóvel, nem empreendimento, nem opção
--     de pagamento. Só lê.
--   * ele enxerga apenas unidades com status `disponivel`. Reservada, em
--     negociação ou em Trilha não aparecem — ele não vende o que não está à
--     venda, e o desempenho de vendas da incorporadora não é assunto dele.
--
-- O recorte de leitura mora nas policies, não na tela: mesmo que uma página
-- esqueça de filtrar, o banco não devolve a linha.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · O terceiro tipo de conta
--
-- ATENÇÃO: o SQL Editor roda este arquivo inteiro numa transação só, e o
-- Postgres proíbe USAR um valor de enum recém-criado dentro da mesma
-- transação que o criou. Por isso nenhuma linha daqui para baixo escreve
-- 'parceiro' como literal do tipo conta_tipo — as regras de acesso se apoiam
-- na tabela `parceiro`, não no enum. Se um dia alguém precisar comparar
-- `conta.tipo = 'parceiro'` numa migração, tem que ser em OUTRO arquivo.
-- ----------------------------------------------------------------------------

alter type public.conta_tipo add value if not exists 'parceiro';


-- ----------------------------------------------------------------------------
-- PARTE 2 · A tabela
--
-- `documento` guarda CPF ou CNPJ só com dígitos, igual ao resto do sistema:
-- a máscara é coisa de tela. O parceiro pode ser pessoa física (corretor) ou
-- jurídica (imobiliária), então uma coluna só atende os dois.
--
-- `ativo` existe para desligar o acesso sem apagar o histórico. Apagar de
-- verdade também é permitido — mas quem apaga a ficha precisa apagar o
-- usuário do Auth junto, senão sobra um login órfão que entra e não vê nada.
-- Isso é responsabilidade da server action, não do banco.
-- ----------------------------------------------------------------------------

create table if not exists public.parceiro (
  id                uuid primary key default gen_random_uuid(),

  -- Nulo enquanto o acesso ainda não foi criado. `set null` para que apagar a
  -- conta não leve a ficha do parceiro junto.
  conta_id          uuid unique references public.conta (id) on delete set null,

  incorporadora_id  uuid not null references public.incorporadora (id) on delete cascade,

  nome              text not null,
  documento         text,
  creci             text,
  email             text not null,
  telefone          text not null,
  endereco          text,

  -- Para onde vai a comissao. Mesmos campos da incorporadora, de proposito:
  -- o repasse e o mesmo tipo de operacao, e um dia os dois viram uma rotina so.
  banco             text,
  agencia           text,
  conta_numero      text,
  chave_pix         text,
  chave_pix_tipo    public.chave_pix_tipo,

  ativo             boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Se a tabela ja existia de uma rodada anterior deste arquivo, as colunas
-- bancarias entram aqui. Rodar duas vezes nao quebra nem apaga nada.
alter table public.parceiro
  add column if not exists endereco       text,
  add column if not exists banco          text,
  add column if not exists agencia        text,
  add column if not exists conta_numero   text,
  add column if not exists chave_pix      text,
  add column if not exists chave_pix_tipo public.chave_pix_tipo;

comment on table public.parceiro is
  'Imobiliária ou corretor que vende o estoque de uma incorporadora. Acesso somente-leitura ao que é dela.';

create index if not exists parceiro_incorporadora_idx on public.parceiro (incorporadora_id);
create index if not exists parceiro_nome_idx          on public.parceiro (nome);

-- O mesmo parceiro não entra duas vezes na mesma incorporadora. Fica livre
-- para aparecer em outra — é o que permitirá o vínculo múltiplo mais tarde
-- sem mexer nesta trava.
create unique index if not exists parceiro_documento_unico
  on public.parceiro (incorporadora_id, documento)
  where documento is not null;

drop trigger if exists parceiro_touch on public.parceiro;
create trigger parceiro_touch before update on public.parceiro
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 3 · Quem é o parceiro logado
--
-- Irmã de `minha_incorporadora_id()`. Devolve nulo para quem não é parceiro —
-- e é isso que faz as policies abaixo não valerem para mais ninguém, já que
-- nenhuma coluna casa com nulo.
--
-- Parceiro inativo devolve nulo também: desligar o acesso é uma edição de
-- cadastro, não uma ida ao Supabase Auth.
-- ----------------------------------------------------------------------------

create or replace function public.minha_incorporadora_como_parceiro()
returns uuid
language sql stable security definer set search_path = public as $$
  select incorporadora_id
  from public.parceiro
  where conta_id = auth.uid() and ativo;
$$;

grant execute on function public.minha_incorporadora_como_parceiro() to authenticated;


-- ----------------------------------------------------------------------------
-- PARTE 4 · Quem mexe na ficha do parceiro
--
-- Três policies, avaliadas com "ou": basta uma liberar. As que já existiam
-- nas outras tabelas não mudam nem uma linha.
-- ----------------------------------------------------------------------------

alter table public.parceiro enable row level security;

grant select, insert, update, delete on public.parceiro to authenticated;
grant all on public.parceiro to service_role;

-- O admin da Trilha faz tudo, em qualquer incorporadora.
drop policy if exists parceiro_admin on public.parceiro;
create policy parceiro_admin on public.parceiro
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

-- A incorporadora cadastra, edita e remove os parceiros dela. O `with check`
-- impede que ela crie um parceiro apontando para outra incorporadora.
drop policy if exists parceiro_da_incorporadora on public.parceiro;
create policy parceiro_da_incorporadora on public.parceiro
  for all to authenticated
  using (incorporadora_id = public.minha_incorporadora_id())
  with check (incorporadora_id = public.minha_incorporadora_id());

-- O parceiro lê a própria ficha, e nada mais. Não edita: dado cadastral dele
-- é responsabilidade de quem o cadastrou.
drop policy if exists parceiro_proprio on public.parceiro;
create policy parceiro_proprio on public.parceiro
  for select to authenticated
  using (conta_id = auth.uid());


-- ----------------------------------------------------------------------------
-- PARTE 5 · O que o parceiro enxerga
--
-- Todas `for select`. Não existe nenhuma policy de escrita para ele em lugar
-- nenhum — é essa ausência que garante que ele não altera nada, mesmo que
-- alguém chame a API direto.
-- ----------------------------------------------------------------------------

-- A incorporadora a que ele pertence. Precisa dela para o nome nos cabeçalhos
-- e para `percentual_comissao`, que é o número dele.
drop policy if exists incorporadora_parceiro on public.incorporadora;
create policy incorporadora_parceiro on public.incorporadora
  for select to authenticated
  using (id = public.minha_incorporadora_como_parceiro());

-- Os empreendimentos dela.
drop policy if exists empreendimento_parceiro on public.empreendimento;
create policy empreendimento_parceiro on public.empreendimento
  for select to authenticated
  using (incorporadora_id = public.minha_incorporadora_como_parceiro());

-- As unidades — só as disponíveis. O filtro está aqui, e não na consulta da
-- tela, de propósito: assim uma página nova nasce correta sem precisar
-- lembrar da regra.
drop policy if exists imovel_parceiro on public.imovel;
create policy imovel_parceiro on public.imovel
  for select to authenticated
  using (
    status = 'disponivel'
    and exists (
      select 1 from public.empreendimento e
      where e.id = imovel.empreendimento_id
        and e.incorporadora_id = public.minha_incorporadora_como_parceiro()
    )
  );

-- As condições de pagamento, tanto o padrão da incorporadora quanto as
-- próprias de cada empreendimento. Sem elas a ficha da unidade fica sem os
-- cards, que é justamente o que ele precisa mostrar ao cliente.
drop policy if exists opcao_pagamento_parceiro on public.opcao_pagamento;
create policy opcao_pagamento_parceiro on public.opcao_pagamento
  for select to authenticated
  using (incorporadora_id = public.minha_incorporadora_como_parceiro());


-- ----------------------------------------------------------------------------
-- Conferência
--
-- Nenhum destes selects usa o literal 'parceiro' como valor do enum — só como
-- texto, comparado com o rótulo em pg_enum. É o que permite conferir na mesma
-- transação que criou o valor.
-- ----------------------------------------------------------------------------

select 'tipos de conta' as item,
       string_agg(e.enumlabel::text, ' | ' order by e.enumsortorder) as situacao
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = 'conta_tipo'

union all

select 'tabela parceiro',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'parceiro'

union all

select 'função do parceiro',
       coalesce(string_agg(p.oid::regprocedure::text, ' | '), 'NÃO EXISTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'minha_incorporadora_como_parceiro'

union all

select 'policies criadas para o parceiro',
       coalesce(string_agg(
         polrelid::regclass::text || '.' || polname ||
         ' (' || case polcmd when 'r' then 'leitura'
                             when 'w' then 'edição'
                             when 'a' then 'inserção'
                             when 'd' then 'exclusão'
                             when '*' then 'tudo'
                             else polcmd::text end || ')',
         ' | ' order by polrelid::regclass::text, polname), 'NENHUMA')
from pg_policy
where polname like '%parceiro%';
