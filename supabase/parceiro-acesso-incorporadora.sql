-- ----------------------------------------------------------------------------
-- Sprint 3.2 · A incorporadora enxerga o acesso dos parceiros dela
-- ----------------------------------------------------------------------------
-- Agora a incorporadora cadastra e gerencia os próprios parceiros. Faltava uma
-- peça: a policy `conta_leitura` só deixa cada um ler a própria linha (ou o
-- admin ler todas), então a incorporadora não conseguia ler a `conta` do
-- parceiro dela.
--
-- O sintoma não era um erro — era pior: a coluna "Acesso" da lista mostraria
-- "sem acesso criado" para parceiros que têm acesso, e a tela de trocar senha
-- abriria com o campo de e-mail em branco. Consulta que não devolve linha não
-- levanta erro nenhum.
--
-- O recorte é estreito de propósito: ela lê a conta de quem é parceiro DELA, e
-- de mais ninguém. Não alcança a conta de outra incorporadora, nem do admin,
-- nem de parceiro de terceiros.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — só cria uma policy.
-- ----------------------------------------------------------------------------

drop policy if exists conta_do_meu_parceiro on public.conta;

create policy conta_do_meu_parceiro on public.conta
  for select to authenticated
  using (
    exists (
      select 1
      from public.parceiro p
      where p.conta_id = conta.id
        and p.incorporadora_id = public.minha_incorporadora_id()
    )
  );

comment on policy conta_do_meu_parceiro on public.conta is
  'A incorporadora lê a conta de acesso dos parceiros dela — só para exibir e trocar o e-mail de login. Não alcança nenhuma outra conta.';


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'policies de leitura em conta' as item,
       string_agg(
         polname || ' (' || case polcmd when 'r' then 'leitura'
                                        when '*' then 'tudo'
                                        else polcmd::text end || ')',
         ' | ' order by polname) as situacao
from pg_policy
where polrelid = 'public.conta'::regclass;
