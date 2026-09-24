-- ----------------------------------------------------------------------------
-- Sprint 5.1 · Parceiro Trilha
-- ----------------------------------------------------------------------------
-- Corretor independente, sem vínculo com nenhuma incorporadora. É um parceiro
-- com `incorporadora_id` NULO — não existe "incorporadora Trilha" de mentira.
--
-- O que muda:
--   1. `parceiro.incorporadora_id` passa a aceitar nulo (= Parceiro Trilha).
--   2. O mesmo CPF/CNPJ não se repete entre os Parceiros Trilha.
--   3. A incorporadora enxerga a ficha dos corretores que estão em propostas
--      e negócios DELA — inclusive Parceiro Trilha. Na lista de parceiros
--      dela ele não aparece: a tela filtra por incorporadora_id.
--   4. Todo corretor enxerga unidade, empreendimento e incorporadora das
--      propostas em que participa, mesmo depois que a unidade sai do estoque.
--      Sem isso o Parceiro Trilha veria as próprias propostas sem nome de
--      unidade (ele não tem "incorporadora dele" para as policies antigas).
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- 1. Parceiro sem incorporadora -----------------------------------------------

alter table public.parceiro alter column incorporadora_id drop not null;

comment on column public.parceiro.incorporadora_id is
  'Incorporadora a que o corretor é vinculado. NULO = Parceiro Trilha (independente, vende qualquer unidade).';


-- 2. Documento único entre os Parceiros Trilha --------------------------------
-- O índice antigo (incorporadora_id, documento) não pega esse caso: no
-- Postgres, dois nulos nunca são iguais.

create unique index if not exists parceiro_trilha_documento_unico
  on public.parceiro (documento)
  where incorporadora_id is null and documento is not null;


-- 3. A incorporadora lê os corretores dos negócios dela -----------------------
-- Função security definer para a policy não depender das policies de
-- proposta (evita recursão e mantém a regra num lugar só).

create or replace function public.parceiro_atende_minha_incorporadora(p_parceiro uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.minha_incorporadora_id() is not null
     and exists (
       select 1 from public.proposta p
       where p.incorporadora_id = public.minha_incorporadora_id()
         and (
           p.parceiro_id = p_parceiro
           or exists (
             select 1 from public.proposta_corretor pc
             where pc.proposta_id = p.id and pc.parceiro_id = p_parceiro
           )
         )
     );
$$;

grant execute on function public.parceiro_atende_minha_incorporadora(uuid) to authenticated;

drop policy if exists parceiro_dos_meus_negocios on public.parceiro;
create policy parceiro_dos_meus_negocios on public.parceiro
  for select to authenticated
  using (public.parceiro_atende_minha_incorporadora(id));


-- 4. O corretor lê o que está nas propostas dele ------------------------------

create or replace function public.participo_de(
  p_incorporadora  uuid default null,
  p_empreendimento uuid default null,
  p_imovel         uuid default null
)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_parceiro_id() is not null
     and exists (
       select 1 from public.proposta p
       where (p_incorporadora  is null or p.incorporadora_id  = p_incorporadora)
         and (p_empreendimento is null or p.empreendimento_id = p_empreendimento)
         and (p_imovel         is null or p.imovel_id         = p_imovel)
         and (
           p.parceiro_id = public.meu_parceiro_id()
           or exists (
             select 1 from public.proposta_corretor pc
             where pc.proposta_id = p.id and pc.parceiro_id = public.meu_parceiro_id()
           )
         )
     );
$$;

grant execute on function public.participo_de(uuid, uuid, uuid) to authenticated;

drop policy if exists incorporadora_das_minhas_propostas on public.incorporadora;
create policy incorporadora_das_minhas_propostas on public.incorporadora
  for select to authenticated
  using (public.participo_de(p_incorporadora => id));

drop policy if exists empreendimento_das_minhas_propostas on public.empreendimento;
create policy empreendimento_das_minhas_propostas on public.empreendimento
  for select to authenticated
  using (public.participo_de(p_empreendimento => id));

drop policy if exists imovel_das_minhas_propostas on public.imovel;
create policy imovel_das_minhas_propostas on public.imovel
  for select to authenticated
  using (public.participo_de(p_imovel => id));


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'parceiro.incorporadora_id aceita nulo' as item,
       (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'parceiro'
           and column_name = 'incorporadora_id') as situacao

union all

select 'índice de documento dos Parceiros Trilha',
       coalesce((select 'ok' from pg_indexes
                  where schemaname = 'public' and indexname = 'parceiro_trilha_documento_unico'), 'NÃO EXISTE')

union all

select 'policies novas',
       (select count(*)::text || ' de 4' from pg_policies
         where schemaname = 'public'
           and policyname in ('parceiro_dos_meus_negocios', 'incorporadora_das_minhas_propostas',
                              'empreendimento_das_minhas_propostas', 'imovel_das_minhas_propostas'))

union all

select 'Parceiros Trilha cadastrados',
       (select count(*)::text from public.parceiro where incorporadora_id is null);
