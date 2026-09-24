-- ----------------------------------------------------------------------------
-- Sprint 5.2 · Proprietário PF (banco)
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `parceiro-trilha.sql`.
--
-- O vendedor pessoa física mora na mesma tabela das incorporadoras, com
-- `tipo = 'proprietario_pf'`. Tudo o que pendura em `incorporadora_id`
-- (imóveis, propostas, negócios, permissões, avisos) passa a valer para ele
-- sem regra duplicada. O "empreendimento" do imóvel avulso é o condomínio ou
-- edifício (ou o endereço, se for casa).
--
-- O que muda:
--   1. `incorporadora.tipo`; CNPJ só é obrigatório para incorporadora; CPF
--      único entre proprietários.
--   2. `ficha_vendedor`: dados do vendedor e do cônjuge no fechamento.
--   3. Receita do checklist por tipo de vendedor: etapa "Documentação do
--      vendedor" só para proprietário PF. Os documentos do imóvel valem para
--      os dois.
--   4. Anexos dos documentos do vendedor marcam de quem são (vendedor/cônjuge).
--   5. Os documentos pessoais do vendedor não abrem para o corretor — o mesmo
--      cuidado que a incorporadora já tem com os documentos do comprador.
--   6. `aceitar_proposta` cria o checklist conforme o tipo do vendedor.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · O tipo de vendedor
-- ----------------------------------------------------------------------------

alter table public.incorporadora
  add column if not exists tipo text not null default 'incorporadora';

alter table public.incorporadora drop constraint if exists incorporadora_tipo_valido;
alter table public.incorporadora
  add constraint incorporadora_tipo_valido check (tipo in ('incorporadora', 'proprietario_pf'));

comment on column public.incorporadora.tipo is
  'Quem vende: incorporadora (PJ, com CNPJ) ou proprietário pessoa física. No PF, os dados pessoais ficam em resp_*.';

alter table public.incorporadora alter column cnpj drop not null;

alter table public.incorporadora drop constraint if exists incorporadora_cnpj_obrigatorio;
alter table public.incorporadora
  add constraint incorporadora_cnpj_obrigatorio check (tipo <> 'incorporadora' or cnpj is not null);

create unique index if not exists proprietario_cpf_unico
  on public.incorporadora (resp_cpf)
  where tipo = 'proprietario_pf';

create index if not exists incorporadora_tipo_idx on public.incorporadora (tipo);


-- ----------------------------------------------------------------------------
-- PARTE 2 · Ficha do vendedor (só proprietário PF)
-- ----------------------------------------------------------------------------

create table if not exists public.ficha_vendedor (
  negocio_id          uuid primary key references public.negocio (id) on delete cascade,

  nome                text not null,
  email               text not null,
  telefone            text not null,
  cpf                 text not null,
  rg                  text,
  endereco            text,
  profissao           text,
  estado_civil        text not null
                        check (estado_civil in ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo')),

  conjuge_nome        text,
  conjuge_email       text,
  conjuge_telefone    text,
  conjuge_cpf         text,
  conjuge_rg          text,
  conjuge_endereco    text,
  conjuge_profissao   text,

  banco               text,
  agencia             text,
  conta_numero        text,
  chave_pix           text,

  preenchida_por      uuid references public.conta (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Casado ou em união estável: nome, e-mail, telefone e CPF do cônjuge são
  -- obrigatórios. Nos outros estados civis, não há cônjuge.
  constraint ficha_vendedor_conjuge check (
    case when estado_civil in ('casado', 'uniao_estavel') then
      num_nulls(conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf) = 0
    else
      num_nonnulls(conjuge_nome, conjuge_email, conjuge_telefone, conjuge_cpf,
                   conjuge_rg, conjuge_endereco, conjuge_profissao) = 0
    end
  )
);

comment on table public.ficha_vendedor is
  'Dados do proprietário PF (e do cônjuge) para o contrato. Uma por negócio. O corretor não lê.';

drop trigger if exists ficha_vendedor_touch on public.ficha_vendedor;
create trigger ficha_vendedor_touch before update on public.ficha_vendedor
  for each row execute function public.touch_updated_at();

-- Quem lê: a Trilha e o próprio vendedor. Quem edita: os mesmos, enquanto o
-- negócio não foi cancelado.
create or replace function public.pode_ler_ficha_vendedor(p_negocio uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin_trilha()
      or exists (select 1 from public.negocio n
                 where n.id = p_negocio
                   and n.incorporadora_id = public.minha_incorporadora_id());
$$;

create or replace function public.pode_editar_ficha_vendedor(p_negocio uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.negocio n
    where n.id = p_negocio
      and n.status <> 'cancelado'
      and (public.eh_admin_trilha() or n.incorporadora_id = public.minha_incorporadora_id())
  );
$$;

revoke all on function public.pode_ler_ficha_vendedor(uuid)    from public;
revoke all on function public.pode_editar_ficha_vendedor(uuid) from public;
grant execute on function public.pode_ler_ficha_vendedor(uuid)    to authenticated;
grant execute on function public.pode_editar_ficha_vendedor(uuid) to authenticated;

alter table public.ficha_vendedor enable row level security;

grant select, insert, update on public.ficha_vendedor to authenticated;
grant all                    on public.ficha_vendedor to service_role;

drop policy if exists ficha_vendedor_ler on public.ficha_vendedor;
create policy ficha_vendedor_ler on public.ficha_vendedor
  for select to authenticated
  using (public.pode_ler_ficha_vendedor(negocio_id));

drop policy if exists ficha_vendedor_criar on public.ficha_vendedor;
create policy ficha_vendedor_criar on public.ficha_vendedor
  for insert to authenticated
  with check (public.pode_editar_ficha_vendedor(negocio_id) and preenchida_por = auth.uid());

drop policy if exists ficha_vendedor_editar on public.ficha_vendedor;
create policy ficha_vendedor_editar on public.ficha_vendedor
  for update to authenticated
  using (public.pode_editar_ficha_vendedor(negocio_id))
  with check (public.pode_editar_ficha_vendedor(negocio_id) and preenchida_por = auth.uid());


-- ----------------------------------------------------------------------------
-- PARTE 3 · A receita por tipo de vendedor
-- ----------------------------------------------------------------------------

alter table public.checklist_modelo add column if not exists vendedor text;

alter table public.checklist_modelo drop constraint if exists checklist_modelo_vendedor_valido;
alter table public.checklist_modelo
  add constraint checklist_modelo_vendedor_valido
  check (vendedor is null or vendedor in ('incorporadora', 'proprietario_pf'));

comment on column public.checklist_modelo.vendedor is
  'Nulo = vale para todo negócio. Preenchido = só entra quando o vendedor é desse tipo.';

insert into public.checklist_modelo
  (etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna, pede_conjuge, vendedor, instrucoes)
values
  ('Documentação do vendedor', 1, 1, 'Dados do vendedor',           'incorporadora', 'formulario', false, false, false, 'proprietario_pf',
   'Confira os dados pessoais e bancários do vendedor. Se for casado(a) ou viver em união estável, preencha também os dados do cônjuge.'),
  ('Documentação do vendedor', 1, 2, 'Documento com foto',          'incorporadora', 'documento',  false, false, true,  'proprietario_pf',
   'RG ou CNH. Se houver cônjuge, anexe também o dele(a).'),
  ('Documentação do vendedor', 1, 3, 'Comprovante de endereço',     'incorporadora', 'documento',  false, false, false, 'proprietario_pf',
   null),
  -- A instrução deste muda conforme o estado civil informado nos dados do
  -- vendedor; quem monta o texto é a tela (lib/vendedor.ts).
  ('Documentação do vendedor', 1, 4, 'Comprovante de estado civil', 'incorporadora', 'documento',  false, false, false, 'proprietario_pf',
   null)
on conflict (etapa, titulo) do nothing;


-- ----------------------------------------------------------------------------
-- PARTE 4 · De quem é o anexo, nos documentos do vendedor
-- ----------------------------------------------------------------------------

alter table public.checklist_arquivo drop constraint if exists checklist_arquivo_pessoa_check;
alter table public.checklist_arquivo
  add constraint checklist_arquivo_pessoa_check check (pessoa in ('comprador', 'conjuge', 'vendedor'));

create or replace function public.arquivo_define_pessoa()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ator  public.checklist_ator;
  v_etapa text;
begin
  select ator, etapa into v_ator, v_etapa from public.checklist_item where id = new.checklist_item_id;

  if v_ator = 'parceiro' then
    new.pessoa := case when new.pessoa in ('comprador', 'conjuge') then new.pessoa else 'comprador' end;
  elsif v_etapa = 'Documentação do vendedor' then
    new.pessoa := case when new.pessoa in ('vendedor', 'conjuge') then new.pessoa else 'vendedor' end;
  else
    new.pessoa := null;
  end if;

  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 5 · Documento pessoal do vendedor não abre para o corretor
--
-- Mesma função de antes, com uma exceção no último ramo: quem está do outro
-- lado do negócio vê as tarefas "de fora", mas não os documentos pessoais do
-- vendedor PF. A tarefa continua visível (ele vê que falta), só o arquivo não.
-- ----------------------------------------------------------------------------

create or replace function public.pode_ler_arquivo_tarefa(p_tarefa text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.checklist_item i
    join public.negocio n on n.id = i.negocio_id
    where i.id = public.tarefa_de_texto(p_tarefa)
      and (
        public.eh_admin_trilha()
        or (i.ator = 'parceiro'      and n.parceiro_id      = public.meu_parceiro_id())
        or (i.ator = 'incorporadora' and n.incorporadora_id = public.minha_incorporadora_id())
        or (    not i.interna
            and i.ator <> 'parceiro'
            and i.etapa <> 'Documentação do vendedor'
            and (   n.parceiro_id      = public.meu_parceiro_id()
                 or n.incorporadora_id = public.minha_incorporadora_id()))
      )
  );
$$;


-- ----------------------------------------------------------------------------
-- PARTE 6 · O checklist nasce conforme o vendedor
-- ----------------------------------------------------------------------------

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
  v_vendedor text;
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha aceita proposta.' using errcode = '42501';
  end if;

  select p.imovel_id, p.status, i.tipo into v_imovel, v_status, v_vendedor
  from public.proposta p
  join public.incorporadora i on i.id = p.incorporadora_id
  where p.id = p_proposta
  for update of p;

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

  update public.proposta
     set status = 'invalidada', decidida_em = now(), decidida_por = auth.uid()
   where imovel_id = v_imovel
     and id <> p_proposta
     and status in ('enviada', 'em_analise');

  insert into public.negocio
    (proposta_id, imovel_id, empreendimento_id, incorporadora_id, parceiro_id, comprador_id)
  select p.id, p.imovel_id, p.empreendimento_id, p.incorporadora_id, p.parceiro_id, p.comprador_id
  from public.proposta p
  where p.id = p_proposta
  returning id into v_negocio;

  -- A receita comum + o que é específico deste tipo de vendedor.
  insert into public.checklist_item
    (negocio_id, etapa, etapa_ordem, ordem, titulo, ator, tipo, exige_validade, interna,
     instrucoes, pede_conjuge)
  select v_negocio, m.etapa, m.etapa_ordem, m.ordem, m.titulo, m.ator, m.tipo,
         m.exige_validade, m.interna, m.instrucoes, m.pede_conjuge
  from public.checklist_modelo m
  where m.ativo
    and (m.vendedor is null or m.vendedor = v_vendedor);

  return v_negocio;
end;
$$;

revoke all on function public.aceitar_proposta(uuid, text) from public;
grant execute on function public.aceitar_proposta(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'incorporadora.tipo' as item,
       coalesce((select data_type from information_schema.columns
                  where table_schema = 'public' and table_name = 'incorporadora' and column_name = 'tipo'),
                'NÃO EXISTE') as situacao

union all

select 'CNPJ opcional para PF',
       (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'incorporadora' and column_name = 'cnpj')

union all

select 'tabela ficha_vendedor',
       coalesce(to_regclass('public.ficha_vendedor')::text, 'NÃO EXISTE')

union all

select 'tarefas do vendedor PF na receita',
       (select count(*)::text || ' de 4' from public.checklist_modelo where vendedor = 'proprietario_pf')

union all

select 'aceitar_proposta filtra por vendedor',
       case when pg_get_functiondef('public.aceitar_proposta(uuid, text)'::regprocedure) like '%m.vendedor%'
            then 'ok' else 'NÃO' end;
