-- ============================================================================
-- CORRECAO · permissoes de acesso ao schema public
--
-- Rode este arquivo inteiro. Ele nao apaga nem altera nenhum dado -- so
-- concede as permissoes que faltavam.
--
-- Contexto: RLS e permissao sao camadas diferentes. A permissao responde
-- "esse tipo de usuario pode olhar para esta tabela?" e e avaliada ANTES da
-- policy, que responde "quais linhas ele ve?". Sem a permissao o Postgres
-- barra com "permission denied for schema public" e nem avalia a policy.
--
-- Sao TRES papeis, e esquecer qualquer um quebra uma parte diferente do app:
--   anon           -- visitante nao logado
--   authenticated  -- usuario logado (admin da Trilha ou incorporadora)
--   service_role   -- o servidor do app, usado para criar o login das
--                     incorporadoras. Ignora RLS, mas AINDA precisa de grant.
--
-- ATENCAO (licao aprendida): a primeira versao deste arquivo terminava com um
-- bloco `begin; ... rollback;` para simular a leitura. O SQL Editor do Supabase
-- roda o script inteiro em UMA transacao, entao aquele rollback desfazia os
-- grants concedidos acima. Nunca coloque `rollback` no mesmo script que faz
-- alteracoes de verdade -- rode simulacoes sempre separadas.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Usuario logado: le e grava, sempre limitado pelas policies de RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Servidor do app: acesso total, usado para criar contas de acesso.
grant all on all tables in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Vale tambem para tabelas e funcoes criadas daqui para frente.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;
