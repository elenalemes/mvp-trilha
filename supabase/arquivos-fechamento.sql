-- ----------------------------------------------------------------------------
-- Sprint 4.1 · Arquivos do fechamento (item A3)
-- ----------------------------------------------------------------------------
-- As tarefas do tipo `documento` passam a receber arquivo de verdade. O arquivo
-- vai do navegador direto para o Supabase Storage — não passa pela Vercel, que
-- corta requisições acima de 4,5 MB.
--
-- REGRAS (decididas com a Elena em 22/set):
--
--   * Recebem arquivo as tarefas de DOCUMENTO e de VEREDITO — no veredito é o
--     laudo que sustenta a decisão (a análise de crédito do Asaas), opcional.
--
--   * VÁRIOS arquivos por tarefa: três holerites, frente e verso do RG. Por
--     isso existe a tabela `checklist_arquivo`, e a coluna antiga
--     `checklist_item.arquivo_path` fica sem uso.
--   * Documento só conclui com PELO MENOS UM arquivo. Quem garante é o banco,
--     num trigger — não a tela.
--   * QUEM ABRE CADA ARQUIVO depende do tipo de tarefa:
--       documentos do comprador (tarefa do parceiro) → Trilha e corretor.
--         A incorporadora nunca vê CPF nem renda do comprador; o arquivo é o
--         mesmo dado, então segue a mesma regra.
--       tarefas internas (análise de crédito)        → só a Trilha.
--       o resto (imóvel, contrato)                   → todos do negócio.
--     Quem não pode abrir continua vendo que a tarefa foi feita.
--   * "Contrato assinado por todos" vira documento: o PDF assinado fica no
--     negócio. Vale para a receita e para os negócios abertos em que essa
--     tarefa ainda está pendente.
--
-- O CAMINHO DO ARQUIVO no bucket é   <negocio_id>/<tarefa_id>/<aleatório>-<nome>
-- As regras do Storage leem a tarefa pelo segundo pedaço do caminho. É por
-- isso que o caminho não é livre: um arquivo fora desse formato não passa em
-- regra nenhuma, então não sobe e não abre.
--
-- ESCREVER só enquanto a tarefa está PENDENTE e o negócio não foi cancelado.
-- Concluiu, congelou: para trocar um arquivo, desfaz a tarefa primeiro. É o
-- que impede um documento de mudar depois que alguém conferiu.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · O bucket
--
-- Privado: nenhum arquivo tem link público. Abrir é sempre por link assinado,
-- de validade curta, gerado para quem passou na regra.
--
-- 10 MB por arquivo. Foto de celular é comprimida no navegador antes de subir
-- (fica em ~0,5 MB); o limite existe para PDF escaneado, que não se comprime.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fechamento', 'fechamento', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ----------------------------------------------------------------------------
-- PARTE 2 · O registro de cada arquivo
--
-- O Storage guarda o conteúdo; esta tabela guarda o que a tela precisa mostrar
-- (nome original, tamanho, quem mandou) sem abrir o bucket.
--
-- `negocio_id` é redundante em relação à tarefa, pelo motivo de sempre: é o
-- que a leitura da tela filtra, sem junção.
-- ----------------------------------------------------------------------------

create table if not exists public.checklist_arquivo (
  id                 uuid primary key default gen_random_uuid(),

  checklist_item_id  uuid not null references public.checklist_item (id) on delete cascade,
  negocio_id         uuid not null references public.negocio (id) on delete cascade,

  -- Caminho no bucket `fechamento`. Único: um objeto, um registro.
  caminho            text not null unique,
  nome_original      text not null,
  tipo_mime          text,
  tamanho_bytes      bigint,

  enviado_por        uuid references public.conta (id) on delete set null,
  created_at         timestamptz not null default now()
);

comment on table public.checklist_arquivo is
  'Arquivos anexados às tarefas do fechamento. O conteúdo mora no bucket fechamento.';

create index if not exists checklist_arquivo_item_idx
  on public.checklist_arquivo (checklist_item_id, created_at);
create index if not exists checklist_arquivo_negocio_idx
  on public.checklist_arquivo (negocio_id);

comment on column public.checklist_item.arquivo_path is
  'SEM USO desde a sprint 4.1. Os arquivos moram em checklist_arquivo.';


-- ----------------------------------------------------------------------------
-- PARTE 3 · As duas perguntas
--
-- Toda regra desta migração — as do bucket e as da tabela — se resume a duas
-- perguntas sobre uma tarefa. Respondê-las em UMA função cada uma garante que
-- o bucket e a tabela nunca discordem.
--
-- Recebem texto, e não uuid, porque do lado do Storage o id sai de dentro do
-- caminho do arquivo — e um caminho malformado não pode derrubar a consulta
-- com erro de conversão. Não é uuid? Resposta: não.
--
-- `security definer` porque leem negócio e tarefa sem depender das policies
-- dessas tabelas — as funções já SÃO a policy.
-- ----------------------------------------------------------------------------

create or replace function public.tarefa_de_texto(p_tarefa text)
returns uuid
language sql immutable as $$
  select case
    when p_tarefa ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then p_tarefa::uuid
  end;
$$;

-- Quem ABRE os arquivos desta tarefa.
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
        -- quem é responsável pela tarefa sempre abre o que mandou
        or (i.ator = 'parceiro'      and n.parceiro_id      = public.meu_parceiro_id())
        or (i.ator = 'incorporadora' and n.incorporadora_id = public.minha_incorporadora_id())
        -- o resto do negócio abre o que não é do comprador nem interno
        or (    not i.interna
            and i.ator <> 'parceiro'
            and (   n.parceiro_id      = public.meu_parceiro_id()
                 or n.incorporadora_id = public.minha_incorporadora_id()))
      )
  );
$$;

-- Quem MANDA e REMOVE arquivos desta tarefa.
create or replace function public.pode_escrever_arquivo_tarefa(p_tarefa text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.checklist_item i
    join public.negocio n on n.id = i.negocio_id
    where i.id = public.tarefa_de_texto(p_tarefa)
      -- documento: o papel é a tarefa. veredito: o laudo que sustenta a
      -- decisão (a análise de crédito do Asaas). Confirmação não leva anexo.
      and i.tipo  in ('documento', 'veredito')
      and i.status = 'pendente'
      and n.status <> 'cancelado'
      and (
        public.eh_admin_trilha()
        or (i.ator = 'parceiro'      and n.parceiro_id      = public.meu_parceiro_id())
        or (i.ator = 'incorporadora' and n.incorporadora_id = public.minha_incorporadora_id())
      )
  );
$$;

revoke all on function public.pode_ler_arquivo_tarefa(text)      from public;
revoke all on function public.pode_escrever_arquivo_tarefa(text) from public;
grant execute on function public.tarefa_de_texto(text)              to authenticated;
grant execute on function public.pode_ler_arquivo_tarefa(text)      to authenticated;
grant execute on function public.pode_escrever_arquivo_tarefa(text) to authenticated;


-- ----------------------------------------------------------------------------
-- PARTE 4 · As regras do bucket
--
-- `storage.foldername(name)` quebra o caminho em pastas:
--   '<negocio>/<tarefa>/x.pdf'  →  {<negocio>, <tarefa>}
-- O segundo pedaço é a tarefa. O primeiro é conferido contra o negócio DELA —
-- sem isso, alguém poderia pendurar o arquivo de uma tarefa sua numa pasta de
-- outro negócio.
--
-- Não existe regra de UPDATE: arquivo não se sobrescreve. Trocar é remover e
-- mandar outro, e as duas coisas deixam rastro na tabela.
-- ----------------------------------------------------------------------------

create or replace function public.caminho_confere(p_caminho text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.checklist_item i
    where i.id = public.tarefa_de_texto((storage.foldername(p_caminho))[2])
      and i.negocio_id::text = (storage.foldername(p_caminho))[1]
      and array_length(storage.foldername(p_caminho), 1) = 2
  );
$$;

grant execute on function public.caminho_confere(text) to authenticated;

drop policy if exists fechamento_ler on storage.objects;
create policy fechamento_ler on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fechamento'
    and public.pode_ler_arquivo_tarefa((storage.foldername(name))[2])
  );

drop policy if exists fechamento_enviar on storage.objects;
create policy fechamento_enviar on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fechamento'
    and public.caminho_confere(name)
    and public.pode_escrever_arquivo_tarefa((storage.foldername(name))[2])
  );

drop policy if exists fechamento_remover on storage.objects;
create policy fechamento_remover on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fechamento'
    and public.pode_escrever_arquivo_tarefa((storage.foldername(name))[2])
  );


-- ----------------------------------------------------------------------------
-- PARTE 5 · As regras da tabela
--
-- As mesmas duas perguntas. Quem não pode abrir o arquivo também não enxerga a
-- linha dele — para a incorporadora, a tarefa do comprador aparece concluída e
-- sem anexos, que é exatamente o que ela deve ver.
-- ----------------------------------------------------------------------------

alter table public.checklist_arquivo enable row level security;

grant select, insert, delete on public.checklist_arquivo to authenticated;
grant all                    on public.checklist_arquivo to service_role;

drop policy if exists checklist_arquivo_ler on public.checklist_arquivo;
create policy checklist_arquivo_ler on public.checklist_arquivo
  for select to authenticated
  using (public.pode_ler_arquivo_tarefa(checklist_item_id::text));

drop policy if exists checklist_arquivo_registrar on public.checklist_arquivo;
create policy checklist_arquivo_registrar on public.checklist_arquivo
  for insert to authenticated
  with check (
    enviado_por = auth.uid()
    and public.pode_escrever_arquivo_tarefa(checklist_item_id::text)
    and public.caminho_confere(caminho)
    and (storage.foldername(caminho))[2] = checklist_item_id::text
    and exists (
      select 1 from public.checklist_item i
      where i.id = checklist_item_id and i.negocio_id = checklist_arquivo.negocio_id
    )
  );

drop policy if exists checklist_arquivo_remover on public.checklist_arquivo;
create policy checklist_arquivo_remover on public.checklist_arquivo
  for delete to authenticated
  using (public.pode_escrever_arquivo_tarefa(checklist_item_id::text));


-- ----------------------------------------------------------------------------
-- PARTE 6 · Documento sem arquivo não conclui
--
-- Só na PASSAGEM para concluído: os documentos que já foram concluídos antes
-- desta sprint, com um link colado, continuam valendo como estão.
-- ----------------------------------------------------------------------------

create or replace function public.documento_exige_arquivo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'documento'
     and new.status = 'concluido'
     and old.status is distinct from 'concluido'
     and not exists (select 1 from public.checklist_arquivo a where a.checklist_item_id = new.id)
  then
    raise exception 'Anexe pelo menos um arquivo antes de concluir "%".', new.titulo
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists checklist_item_documento_exige_arquivo on public.checklist_item;
create trigger checklist_item_documento_exige_arquivo
  before update of status on public.checklist_item
  for each row execute function public.documento_exige_arquivo();


-- ----------------------------------------------------------------------------
-- PARTE 7 · O contrato assinado vira documento
-- ----------------------------------------------------------------------------

update public.checklist_modelo
   set tipo = 'documento'
 where etapa = 'Contrato' and titulo = 'Contrato assinado por todos';

update public.checklist_item
   set tipo = 'documento'
 where etapa = 'Contrato' and titulo = 'Contrato assinado por todos'
   and status = 'pendente';


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'bucket fechamento' as item,
       coalesce((select 'privado=' || (not public)::text || ' · limite ' ||
                        (file_size_limit / 1048576)::text || ' MB'
                 from storage.buckets where id = 'fechamento'), 'NÃO EXISTE') as situacao

union all

select 'tabela checklist_arquivo',
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'checklist_arquivo'

union all

select 'regras do bucket',
       coalesce(string_agg(policyname, ' | ' order by policyname), 'NENHUMA')
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'fechamento_%'

union all

select 'regras da tabela',
       coalesce(string_agg(policyname, ' | ' order by policyname), 'NENHUMA')
from pg_policies
where schemaname = 'public' and tablename = 'checklist_arquivo'

union all

select 'trigger do documento',
       coalesce((select tgname from pg_trigger
                 where tgname = 'checklist_item_documento_exige_arquivo'), 'NÃO EXISTE')

union all

select 'contrato assinado na receita',
       coalesce((select tipo::text from public.checklist_modelo
                 where etapa = 'Contrato' and titulo = 'Contrato assinado por todos'), 'NÃO ACHEI');
