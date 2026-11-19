-- =====================================================================
-- OperacionalOS — HZK Dock v3: skills, conectores, porteiro, rotinas (ADR 0023, proposta)
-- Especificação: nota 42 do vault (F5). Testada no Postgres de teste (src/lib/server/dock.rls.test.ts).
-- Rodar depois do 0026 no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- Primeira leva (decisão do Gabriel, 14/11/2026): só os níveis 0 e 1; programas ACP e skills com
-- script ficam desligados até a área isolada do Windows (ver private.office_limit).
--
-- Duas famílias de tabela, com regras de leitura diferentes:
--   office_*  = do escritório de UMA pessoa. Só o dono lê (ADR 0022). Exceção única e explícita:
--               aprovação que exige founder (dinheiro) também aparece para os founders.
--   dock_*    = da empresa (catálogos e registro). Leitura por área (0025) ou por cargo.
-- O navegador não escreve direto em nenhuma delas: só pelas funções abaixo.
-- O motor (Ponte HZK) nunca usa a sessão da pessoa: chama as funções marcadas "servidor",
-- liberadas só para service_role, por trás de /api/workers (token oos_ do PC).
-- Nenhuma coluna guarda chave, token ou senha. Nenhum dado existente é alterado.
-- =====================================================================

-- ---------- 0. regras com nome ----------
-- Limites num lugar só (números conservadores; ajustar com uso real, nota 26 decisão 3).
create or replace function private.office_limit(p_name text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_name
    when 'skills_por_bot' then 30
    when 'conectores_por_bot' then 20
    when 'skills_pessoais' then 50
    when 'rotinas' then 20
    when 'aprendizados' then 200
    when 'aprovacoes_pendentes_por_bot' then 20
    when 'acoes_por_minuto' then 60
    when 'recusas_em_10_min' then 5
    when 'bots_modelo_por_area' then 6
    when 'pedidos_abertos' then 10
    -- primeira leva: nível máximo 1; ACP e skill com script desligados (1 = liberado)
    when 'nivel_maximo' then 1
    when 'acp_liberado' then 0
    when 'scripts_liberados' then 0
    else 0 end;
$$;

-- Responsável da área: founder, quem tem "gerir" na área, ou o dono cadastrado na área.
create or replace function private.dock_is_area_lead(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_area is not null and (
    private.is_at_least('owner')
    or coalesce(private.area_level(p_area) = 'gerir', false)
    -- dono cadastrado na área só vale se ele também alcança a área (revisão de segurança A1)
    or (exists (select 1 from public.areas a where a.id = p_area and a.data -> 'owner' ->> 'memberId' = private.my_team_id())
        and private.area_rank(private.area_level(p_area)) >= private.area_rank('operar'))
  ), false);
$$;

-- Trocar o dono cadastrado de uma área restrita é ato de founder (senão um admin vira "responsável").
create or replace function private.dock_guard_area_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (coalesce((old.data ->> 'restricted')::boolean, false) or coalesce((new.data ->> 'restricted')::boolean, false))
     and (old.data -> 'owner') is distinct from (new.data -> 'owner')
     and auth.jwt() ->> 'email' is not null and not private.is_at_least('owner') then
    raise exception 'dock_area_owner_founder_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_area_owner on public.areas;
create trigger guard_area_owner before update of data on public.areas
  for each row execute function private.dock_guard_area_owner();

-- Nível de UMA PESSOA numa área, sem depender da sessão (o motor não tem a sessão da pessoa).
-- Mesma regra de private.area_level (0025); se uma mudar, a outra muda junto.
create or replace function private.area_level_of(p_member text, p_area text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select m.team_id, m.role_level from public.members m where m.team_id = p_member and m.active = true limit 1
  ), g as (
    select aa.level from public.area_access aa, me
    where aa.member_id = me.team_id and aa.area_id = p_area and (aa.expires_at is null or aa.expires_at > now())
  )
  select case
    when me.role_level = 'owner' then 'gerir'
    when private.area_restricted(p_area) then coalesce((select level from g), 'vitrine')
    else (
      select case when private.area_rank(base) >= private.area_rank(coalesce((select level from g), 'vitrine'))
                  then base else (select level from g) end
      from (select case me.role_level when 'admin' then 'aprovar' when 'operator' then 'operar' else 'ver' end as base) b
    )
  end
  from me;
$$;

-- Tabelas só de acréscimo: nem o servidor altera ou apaga.
create or replace function private.dock_forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'dock_immutable' using errcode = '42501';
end;
$$;

-- ---------- 1. provedores: o que cada um faz com os dados (decisão de founder, com fonte) ----------
create table if not exists public.dock_provider_policies (
  provider    text primary key check (provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  data_class  text not null check (data_class in ('local', 'padrao', 'conferir', 'treina')),
  note        text not null default '' check (char_length(note) <= 300),
  source_url  text check (source_url is null or (char_length(source_url) <= 300 and source_url ~ '^https://')),
  checked_on  date,
  set_by      text not null,
  set_at      timestamptz not null default now()
);
-- endereços (host) do provedor: o personalizado que aponta para eles herda a classificação
alter table public.dock_provider_policies add column if not exists hosts text[] not null default '{}';
insert into public.dock_provider_policies (provider, data_class, note, source_url, checked_on, set_by) values
  ('ollama',   'local',  'Roda no PC; nada sai.', 'https://docs.ollama.com/api/openai-compatibility', '2026-11-12', 'sistema'),
  ('lmstudio', 'local',  'Roda no PC; nada sai.', 'https://lmstudio.ai/docs/developer/openai-compat', '2026-11-12', 'sistema'),
  ('gemini',   'treina', 'No plano grátis o Google usa o conteúdo para melhorar os produtos.', 'https://aistudio.google.com/docs/pricing', '2026-11-12', 'sistema')
on conflict (provider) do nothing;
update public.dock_provider_policies set hosts = array['generativelanguage.googleapis.com', 'aistudio.google.com']
where provider = 'gemini' and hosts = '{}';

-- Sem linha na tabela = "conferir".
--  local: só vale "local" se a política também disser local (nome de provedor de nuvem não vira local);
--  compatível: herda a classificação do provedor dono do host do endereço (o pior, se houver mais de um);
--  ACP: sempre "conferir" (o Dock não sabe quem está do outro lado).
create or replace function private.office_data_class(p_kind text, p_provider text, p_endpoint text default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_kind = 'local' then
      case when exists (select 1 from public.dock_provider_policies pp where pp.provider = p_provider and pp.data_class = 'local') then 'local' else 'conferir' end
    when p_kind = 'compativel' then coalesce((
      select pp.data_class from public.dock_provider_policies pp
      where p_endpoint is not null and substring(lower(p_endpoint) from '^https?://([^/:]+)') = any (pp.hosts)
      order by case pp.data_class when 'treina' then 0 when 'conferir' then 1 else 2 end limit 1), 'conferir')
    when p_kind = 'acp' then 'conferir'
    else coalesce((select pp.data_class from public.dock_provider_policies pp where pp.provider = p_provider), 'conferir')
  end;
$$;

-- ---------- 2. conexões: ACP, compatível e endereço (nunca segredo) ----------
alter table public.office_connections drop constraint if exists office_connections_kind_check;
alter table public.office_connections add constraint office_connections_kind_check
  check (kind in ('local', 'chave', 'assinatura', 'acp', 'compativel'));
-- Endereço do provedor personalizado. Sem usuário:senha, sem "?" (onde chaves costumam vazar).
-- http só para o próprio PC; fora dele, https.
alter table public.office_connections add column if not exists endpoint text
  check (endpoint is null or (char_length(endpoint) <= 300
    and endpoint ~ '^https?://[a-z0-9.-]{1,200}(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]{0,200})?$'
    and (endpoint ~ '^https://' or endpoint ~ '^http://(localhost|127[.]0[.]0[.]1)(:|/|$)')));
-- Qual programa de agente (ACP). É um NOME do catálogo do motor, não um comando: o comando fica no PC.
alter table public.office_connections add column if not exists acp_agent text
  check (acp_agent is null or acp_agent ~ '^[a-z][a-z0-9_]{1,30}$');
alter table public.office_connections add column if not exists terms_version text check (terms_version is null or char_length(terms_version) <= 40);
alter table public.office_connections add column if not exists terms_ack_at timestamptz;
alter table public.office_connections drop constraint if exists office_connections_shape_check;
alter table public.office_connections add constraint office_connections_shape_check
  check ((kind = 'compativel') = (endpoint is not null) and (kind = 'acp') = (acp_agent is not null));

-- ---------- 3. skills ----------
-- Uma tabela para as da área e as pessoais; o check impede linha "meio a meio".
create table if not exists public.dock_skills (
  id              text primary key check (id ~ '^skl_[0-9A-HJKMNP-TV-Z]{26}$'),
  scope           text not null check (scope in ('area', 'pessoal')),
  area_id         text references public.areas(id),
  owner_team_id   text references public.office(owner_team_id),
  name            text not null check (char_length(name) between 1 and 80),
  description     text not null default '' check (char_length(description) <= 400),
  in_kit          boolean not null default false,                  -- entra no Kit da área
  current_version int not null default 1 check (current_version >= 1),
  archived        boolean not null default false,
  created_by      text not null,                                   -- autor
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((scope = 'area' and area_id is not null and owner_team_id is null)
      or (scope = 'pessoal' and area_id is null and owner_team_id is not null and not in_kit))
);
create index if not exists dock_skills_area_idx on public.dock_skills (area_id) where scope = 'area';
create index if not exists dock_skills_owner_idx on public.dock_skills (owner_team_id) where scope = 'pessoal';
create unique index if not exists dock_skills_area_name_idx on public.dock_skills (area_id, lower(name)) where scope = 'area';

-- Versões: só acréscimo. O pacote que o motor recebe é body (SKILL.md) + files.
create table if not exists public.dock_skill_versions (
  skill_id            text not null references public.dock_skills(id),
  version             int not null check (version >= 1),
  label               text not null check (label ~ '^[0-9]{1,3}[.][0-9]{1,3}([.][0-9]{1,3})?$'),
  what_changed        text not null check (char_length(what_changed) between 1 and 600),
  body                text not null check (char_length(body) between 1 and 60000),
  files               jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 20 and pg_column_size(files) < 400000),
  examples            jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array' and jsonb_array_length(examples) <= 8 and pg_column_size(examples) < 4000),
  min_level           smallint not null default 0 check (min_level between 0 and 3),
  required_connectors text[] not null default '{}' check (cardinality(required_connectors) <= 10),
  has_scripts         boolean not null default false,
  content_sha256      text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  published_by        text not null,
  approved_by         text,                                        -- responsável da área (null nas pessoais)
  proposal_id         text,
  published_at        timestamptz not null default now(),
  primary key (skill_id, version),
  check (not has_scripts or min_level >= 2)                        -- script roda programa: pede nível 2
);
drop trigger if exists forbid_change on public.dock_skill_versions;
create trigger forbid_change before update or delete on public.dock_skill_versions
  for each row execute function private.dock_forbid_change();

-- Aprendizado candidato: PESSOAL. A evidência nunca sai daqui.
create table if not exists public.office_skill_learnings (
  id            text primary key check (id ~ '^lrn_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id text not null references public.office(owner_team_id),
  agent_id      text not null references public.office_agents(id),
  skill_id      text not null references public.dock_skills(id),
  version       int not null,
  kind          text not null check (kind in ('acerto', 'erro')),
  pattern       text not null check (char_length(pattern) between 10 and 600),   -- o padrão, sem nomes nem trechos
  evidence      text not null default '' check (char_length(evidence) <= 1000), -- só o dono vê
  job_public_id text,
  status        text not null default 'candidato' check (status in ('candidato', 'enviado', 'descartado')),
  created_at    timestamptz not null default now()
);
create index if not exists office_skill_learnings_owner_idx on public.office_skill_learnings (owner_team_id, status);

-- O que SOBE para a área: só o padrão, enviado por uma pessoa. Sem conversa, sem evidência, sem bot.
create table if not exists public.dock_skill_signals (
  id          text primary key check (id ~ '^sgn_[0-9A-HJKMNP-TV-Z]{26}$'),
  skill_id    text not null references public.dock_skills(id),
  version     int not null,
  kind        text not null check (kind in ('acerto', 'erro')),
  pattern     text not null check (char_length(pattern) between 10 and 600),
  sent_by     text not null,
  sent_at     timestamptz not null default now(),
  proposal_id text
);
create index if not exists dock_skill_signals_skill_idx on public.dock_skill_signals (skill_id, sent_at desc);

-- Proposta de versão nova (ou de skill nova, vinda de uma pessoal). O responsável da área decide.
create table if not exists public.dock_skill_proposals (
  id                  text primary key check (id ~ '^skp_[0-9A-HJKMNP-TV-Z]{26}$'),
  area_id             text not null references public.areas(id),
  skill_id            text references public.dock_skills(id),      -- null = skill nova
  source_skill_id     text references public.dock_skills(id),      -- a pessoal de origem, quando houver
  base_version        int,
  name                text not null check (char_length(name) between 1 and 80),
  description         text not null default '' check (char_length(description) <= 400),
  label               text not null check (label ~ '^[0-9]{1,3}[.][0-9]{1,3}([.][0-9]{1,3})?$'),
  what_changed        text not null check (char_length(what_changed) between 1 and 600),
  why                 text not null default '' check (char_length(why) <= 1000),
  body                text not null check (char_length(body) between 1 and 60000),
  files               jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 20 and pg_column_size(files) < 400000),
  examples            jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array' and jsonb_array_length(examples) <= 8 and pg_column_size(examples) < 4000),
  min_level           smallint not null default 0 check (min_level between 0 and 3),
  required_connectors text[] not null default '{}' check (cardinality(required_connectors) <= 10),
  has_scripts         boolean not null default false,
  signal_count        int not null default 0 check (signal_count >= 0),
  status              text not null default 'aberta' check (status in ('aberta', 'aprovada', 'recusada', 'retirada')),
  proposed_by         text not null,
  proposed_at         timestamptz not null default now(),
  decided_by          text,
  decided_at          timestamptz,
  decision_note       text check (decision_note is null or char_length(decision_note) <= 600),
  result_version      int,
  check (not has_scripts or min_level >= 2)
);
create index if not exists dock_skill_proposals_area_idx on public.dock_skill_proposals (area_id, status);

-- ---------- 4. conectores ----------
create table if not exists public.dock_connectors (
  id                text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name              text not null check (char_length(name) between 1 and 60),
  category          text not null check (category in ('programacao', 'design', 'dados', 'produtividade', 'pesquisa', 'automacoes')),
  description       text not null default '' check (char_length(description) <= 600),
  note              text not null default '' check (char_length(note) <= 300),
  runs_at           text not null check (runs_at in ('pc', 'empresa')),   -- pc = mexe no PC da pessoa; empresa = mexe em coisa da empresa
  transport         text not null check (transport in ('interno', 'stdio', 'http')),
  server_host       text check (server_host is null or server_host ~ '^[a-z0-9.-]{3,120}$'),
  package_name      text check (package_name is null or char_length(package_name) <= 120),
  package_version   text check (package_version is null or char_length(package_version) <= 40),
  package_sha256    text check (package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'),
  tools_sha256      text check (tools_sha256 is null or tools_sha256 ~ '^[0-9a-f]{64}$'),  -- lista de ferramentas como foi aprovada
  min_level         smallint not null default 0 check (min_level between 0 and 3),
  wave              smallint not null default 0 check (wave between 0 and 2),              -- 0 = ainda não disponível
  status            text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'suspenso')),
  source_url        text check (source_url is null or (char_length(source_url) <= 300 and source_url ~ '^https://')),
  source_checked_on date,
  approved_by       text,
  approved_at       timestamptz,
  updated_by        text not null,
  updated_at        timestamptz not null default now(),
  check (status <> 'aprovado' or (approved_by is not null and approved_at is not null and source_url is not null)),
  check (transport <> 'http' or server_host is not null),
  check (transport <> 'stdio' or (package_name is not null and package_version is not null and package_sha256 is not null))
);

-- Uma linha por ação que o conector dá ao bot. Ferramenta sem linha aqui NÃO é oferecida ao bot.
create table if not exists public.dock_connector_actions (
  connector_id  text not null references public.dock_connectors(id),
  action_key    text not null check (action_key ~ '^[a-z][a-z0-9_]{1,60}$'),
  tool_name     text not null check (char_length(tool_name) between 1 and 120),   -- nome da ferramenta no servidor MCP
  label         text not null check (char_length(label) between 1 and 120),
  action_class  text not null check (action_class in ('A', 'B', 'C', 'D')),
  max_items     int not null default 1 check (max_items between 1 and 500),        -- acima disso a ação vira D
  sends_outside boolean not null default false,
  money         boolean not null default false,                                    -- exige founder
  area_id       text references public.areas(id),                                  -- área do dado tocado, quando é do OperacionalOS
  enabled       boolean not null default true,
  primary key (connector_id, action_key),
  check (not (sends_outside or money) or action_class = 'D')
);

create table if not exists public.dock_connector_requests (
  id            text primary key check (id ~ '^crq_[0-9A-HJKMNP-TV-Z]{26}$'),
  name          text not null check (char_length(name) between 1 and 80),
  url           text check (url is null or (char_length(url) <= 300 and url ~ '^https://')),
  why           text not null check (char_length(why) between 1 and 600),
  requested_by  text not null,
  requested_at  timestamptz not null default now(),
  status        text not null default 'aberto' check (status in ('aberto', 'aceito', 'recusado')),
  decided_by    text,
  decided_at    timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 600),
  connector_id  text references public.dock_connectors(id)
);

-- ---------- 5. Kit da área: bots modelo (as skills do kit são dock_skills.in_kit) ----------
create table if not exists public.dock_kit_bots (
  id              text primary key check (id ~ '^kbt_[0-9A-HJKMNP-TV-Z]{26}$'),
  area_id         text not null references public.areas(id),
  name            text not null check (char_length(name) between 1 and 60),
  title           text not null check (char_length(title) between 1 and 80),
  description     text not null default '' check (char_length(description) <= 2000),
  instructions    text not null default '' check (char_length(instructions) <= 32000),
  suggested_level smallint not null default 0 check (suggested_level between 0 and 3),  -- sugestão; o bot NASCE no 0
  avatar_color    text not null default 'grafite' check (avatar_color in ('grafite', 'aco', 'musgo', 'areia', 'vinho', 'lilas')),
  avatar_glyph    text not null default '' check (char_length(avatar_glyph) <= 1 or avatar_glyph ~ '^[a-z][a-z0-9_]{1,30}$'),
  skill_ids       text[] not null default '{}' check (cardinality(skill_ids) <= 20),
  connector_ids   text[] not null default '{}' check (cardinality(connector_ids) <= 10),
  capabilities    text[] not null default array['texto'] check (capabilities <@ array['texto', 'imagem', 'codigo', 'arquivo', 'web']),
  position        int not null default 0,
  active          boolean not null default true,
  updated_by      text not null,
  updated_at      timestamptz not null default now()
);
create index if not exists dock_kit_bots_area_idx on public.dock_kit_bots (area_id) where active;

-- ---------- 6. bot: nível, avatar, origem ----------
alter table public.office_agents add column if not exists access_level smallint not null default 0 check (access_level between 0 and 3);
alter table public.office_agents add column if not exists access_level_set_at timestamptz;
alter table public.office_agents add column if not exists avatar_style text not null default 'constelacao' check (avatar_style in ('constelacao', 'saturno', 'halo'));
alter table public.office_agents add column if not exists avatar_color text not null default 'grafite' check (avatar_color in ('grafite', 'aco', 'musgo', 'areia', 'vinho', 'lilas'));
-- '' = primeira letra do nome; 1 caractere = letra; senão, id de ícone (lupa, codigo, barras…)
alter table public.office_agents add column if not exists avatar_glyph text not null default '' check (char_length(avatar_glyph) <= 1 or avatar_glyph ~ '^[a-z][a-z0-9_]{1,30}$');
alter table public.office_agents add column if not exists origin text not null default 'do_zero' check (origin in ('do_zero', 'modelo_pessoal', 'modelo_area', 'proposto_por_bot'));
alter table public.office_agents add column if not exists origin_kit_bot_id text references public.dock_kit_bots(id);
-- confirmação pendente NO PC (mundo pessoal): só o tipo, sem conteúdo. Serve para o avatar acender.
alter table public.office_agents add column if not exists pc_pending text check (pc_pending is null or pc_pending in ('lote', 'bloqueio'));

-- founder suspende o escritório de uma pessoa sem ler nada (nota 26)
alter table public.office add column if not exists suspended_at timestamptz;
alter table public.office add column if not exists suspended_by text;

-- ---------- 7. conversa: qual IA respondeu, troca de IA, continuar com outro bot ----------
alter table public.office_messages add column if not exists job_public_id text;      -- a entrega que gerou a mensagem (liga em office_usage)
alter table public.office_messages add column if not exists connection_id text;
alter table public.office_messages add column if not exists provider text check (provider is null or provider ~ '^[a-z][a-z0-9_]{1,30}$');
alter table public.office_messages add column if not exists model text check (model is null or char_length(model) <= 120);
alter table public.office_messages add column if not exists fallback_from text check (fallback_from is null or char_length(fallback_from) <= 120);
alter table public.office_messages add column if not exists fallback_reason text check (fallback_reason is null or char_length(fallback_reason) <= 200);
create index if not exists office_messages_job_idx on public.office_messages (job_public_id) where job_public_id is not null;

alter table public.office_threads add column if not exists continued_from_thread_id text references public.office_threads(id);

-- IA trocada só nesta conversa, por bot (num canal cada bot pode ter a sua)
create table if not exists public.office_thread_models (
  thread_id     text not null references public.office_threads(id),
  agent_id      text not null references public.office_agents(id),
  owner_team_id text not null references public.office(owner_team_id),
  connection_id text not null references public.office_connections(id),
  model         text check (model is null or char_length(model) <= 120),
  set_at        timestamptz not null default now(),
  primary key (thread_id, agent_id)
);

-- ---------- 8. instalação por bot ----------
create table if not exists public.office_agent_skills (
  agent_id       text not null references public.office_agents(id),
  skill_id       text not null references public.dock_skills(id),
  owner_team_id  text not null references public.office(owner_team_id),
  pinned_version int,                       -- null = acompanha a versão atual, com aviso
  seen_version   int not null,              -- última versão que o dono aceitou
  installed_at   timestamptz not null default now(),
  primary key (agent_id, skill_id)
);
create index if not exists office_agent_skills_owner_idx on public.office_agent_skills (owner_team_id);

create table if not exists public.office_agent_connectors (
  agent_id      text not null references public.office_agents(id),
  connector_id  text not null references public.dock_connectors(id),
  owner_team_id text not null references public.office(owner_team_id),
  read_only     boolean not null default true,                         -- começa em só leitura
  account_label text not null default '' check (char_length(account_label) <= 80),  -- "qual conta", nunca o token
  status        text not null default 'pendente' check (status in ('pendente', 'conectado', 'erro')),
  installed_at  timestamptz not null default now(),
  primary key (agent_id, connector_id)
);
create index if not exists office_agent_connectors_owner_idx on public.office_agent_connectors (owner_team_id);

-- "Sempre permitir": por bot, por ação, só classe C.
create table if not exists public.office_action_grants (
  agent_id      text not null,
  connector_id  text not null,
  action_key    text not null,
  owner_team_id text not null references public.office(owner_team_id),
  granted_by    text not null,
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz,
  uses          int not null default 0 check (uses >= 0),
  last_used_at  timestamptz,
  primary key (agent_id, connector_id, action_key),
  foreign key (agent_id, connector_id) references public.office_agent_connectors (agent_id, connector_id) on delete cascade,
  foreign key (connector_id, action_key) references public.dock_connector_actions (connector_id, action_key) on delete cascade
);

-- Segunda tranca do "sempre permitir": mesmo que uma função erre, a linha não entra se a ação não for C.
create or replace function private.office_grant_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.dock_connector_actions x
                 where x.connector_id = new.connector_id and x.action_key = new.action_key
                   and x.action_class = 'C' and x.enabled and not x.money and not x.sends_outside) then
    raise exception 'office_grant_only_class_c' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists grant_guard on public.office_action_grants;
create trigger grant_guard before insert or update on public.office_action_grants
  for each row execute function private.office_grant_guard();

-- ---------- 9. porteiro: aprovações e registro ----------
create table if not exists public.office_approvals (
  id              text primary key check (id ~ '^apr_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id   text not null references public.office(owner_team_id),
  agent_id        text not null references public.office_agents(id),
  job_public_id   text not null,
  thread_id       text,
  connector_id    text not null,
  action_key      text not null,
  action_class    text not null check (action_class in ('C', 'D')),     -- já com o volume aplicado
  gate            text not null check (gate in ('lote', 'bloqueio')),   -- o office.ts já lê isto
  approver        text not null default 'dono' check (approver in ('dono', 'founder')),
  origin          text not null check (origin in ('humano', 'rotina', 'bot', 'externo')),
  origin_detail   text not null default '' check (char_length(origin_detail) <= 300),
  action_label    text not null default '' check (char_length(action_label) <= 120),  -- o que a ação é, pelo catálogo (não pela IA)
  title           text not null check (char_length(title) between 1 and 160),         -- a descrição do bot
  summary         text not null default '' check (char_length(summary) <= 2000),
  draft           jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) < 32000),  -- os argumentos que SERÃO executados
  draft_edited    boolean not null default false,
  item_count      int not null default 1 check (item_count >= 1),
  status          text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'executando', 'executada', 'falhou', 'cancelada')),
  decided_by      text,
  decided_at      timestamptz,
  decision_note   text check (decision_note is null or char_length(decision_note) <= 600),
  owner_ok_at     timestamptz,     -- dinheiro: o dono confirmou
  founder_ok_at   timestamptz,     -- dinheiro: um founder confirmou (os dois precisam)
  executed_at     timestamptz,
  result_summary  text check (result_summary is null or char_length(result_summary) <= 2000),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 100),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index if not exists office_approvals_owner_idx on public.office_approvals (owner_team_id, status);
create index if not exists office_approvals_agent_idx on public.office_approvals (agent_id) where status = 'pendente';

-- Registro com autoria, SEM conversa e sem rascunho: "bot X da Maria, ação Y, aprovado por Maria às 14h02".
create table if not exists public.dock_action_log (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  owner_team_id text not null,
  agent_id      text not null,
  agent_name    text not null default '',
  connector_id  text not null,
  action_key    text not null,
  action_class  text,
  area_id       text,
  item_count    int not null default 1,
  origin        text,
  data_class    text,                                                  -- o que o provedor da vez faz com os dados
  outcome       text not null check (outcome in ('permitida', 'aguardando', 'negada', 'aprovada', 'recusada', 'executada', 'falhou')),
  basis         text not null default '' check (char_length(basis) <= 60),   -- classe_A, sempre_permitir, motivo da recusa…
  actor         text not null default 'bot' check (char_length(actor) <= 64), -- 'bot' ou a pessoa que decidiu
  approval_id   text,
  job_public_id text
);
create index if not exists dock_action_log_agent_idx on public.dock_action_log (agent_id, created_at desc);
create index if not exists dock_action_log_owner_idx on public.dock_action_log (owner_team_id, created_at desc);
drop trigger if exists forbid_change on public.dock_action_log;
create trigger forbid_change before update or delete on public.dock_action_log
  for each row execute function private.dock_forbid_change();

-- ---------- 10. rotinas ----------
create table if not exists public.office_routines (
  id            text primary key check (id ~ '^rtn_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id text not null references public.office(owner_team_id),
  agent_id      text not null references public.office_agents(id),
  title         text not null check (char_length(title) between 1 and 120),
  prompt        text not null check (char_length(prompt) between 1 and 8000),
  kind          text not null check (kind in ('diaria', 'semanal', 'mensal')),
  time_local    time not null,
  weekday       smallint check (weekday is null or weekday between 0 and 6),     -- 0 = domingo
  monthday      smallint check (monthday is null or monthday between 1 and 28),
  tz            text not null default 'America/Sao_Paulo' check (char_length(tz) <= 60),
  enabled       boolean not null default true,
  thread_id     text references public.office_threads(id),
  next_run_at   timestamptz,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  check ((kind <> 'semanal' or weekday is not null) and (kind <> 'mensal' or monthday is not null))
);
create index if not exists office_routines_due_idx on public.office_routines (next_run_at) where enabled;

-- ---------- 11. leitura ----------
do $$
declare t text;
begin
  foreach t in array array[
    'dock_provider_policies', 'dock_skills', 'dock_skill_versions', 'dock_skill_signals', 'dock_skill_proposals',
    'dock_connectors', 'dock_connector_actions', 'dock_connector_requests', 'dock_kit_bots', 'dock_action_log',
    'office_skill_learnings', 'office_thread_models', 'office_agent_skills', 'office_agent_connectors',
    'office_action_grants', 'office_approvals', 'office_routines']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  -- pessoais: só o dono (mesmo desenho da 0026)
  foreach t in array array['office_skill_learnings', 'office_thread_models', 'office_agent_skills', 'office_agent_connectors',
                           'office_action_grants', 'office_routines']
  loop
    execute format('drop policy if exists "dono le" on public.%I', t);
    execute format('create policy "dono le" on public.%I for select to authenticated using (owner_team_id = (select private.my_team_id()))', t);
  end loop;
end;
$$;

-- Aprovações: o dono; e os founders SÓ nas que exigem founder (dinheiro).
drop policy if exists "dono le" on public.office_approvals;
create policy "dono le" on public.office_approvals for select to authenticated
  using (owner_team_id = (select private.my_team_id()) or (approver = 'founder' and (select private.is_at_least('owner'))));

-- Skills: a pessoal só para o dono; a da área para quem lê a área.
-- Atenção: private.can_read_area(null) devolve true. Por isso o escopo vem ANTES e é obrigatório.
drop policy if exists "le skill" on public.dock_skills;
create policy "le skill" on public.dock_skills for select to authenticated
  using ((scope = 'pessoal' and owner_team_id = (select private.my_team_id()))
      or (scope = 'area' and area_id is not null and (select private.is_member()) and private.can_read_area(area_id)));

drop policy if exists "le versao" on public.dock_skill_versions;
create policy "le versao" on public.dock_skill_versions for select to authenticated
  using (exists (select 1 from public.dock_skills s where s.id = skill_id and (
           (s.scope = 'pessoal' and s.owner_team_id = (select private.my_team_id()))
        or (s.scope = 'area' and s.area_id is not null and (select private.is_member()) and private.can_read_area(s.area_id)))));

drop policy if exists "le sinal" on public.dock_skill_signals;
create policy "le sinal" on public.dock_skill_signals for select to authenticated
  using (sent_by = (select private.my_team_id())
      or exists (select 1 from public.dock_skills s where s.id = skill_id and s.scope = 'area' and private.dock_is_area_lead(s.area_id)));

drop policy if exists "le proposta" on public.dock_skill_proposals;
create policy "le proposta" on public.dock_skill_proposals for select to authenticated
  using (proposed_by = (select private.my_team_id()) or private.dock_is_area_lead(area_id));

drop policy if exists "le kit" on public.dock_kit_bots;
create policy "le kit" on public.dock_kit_bots for select to authenticated
  using ((select private.is_member()) and private.can_read_area(area_id));

-- Catálogo de conectores: todos os membros veem o aprovado e o suspenso; rascunho, só founder.
drop policy if exists "le conector" on public.dock_connectors;
create policy "le conector" on public.dock_connectors for select to authenticated
  using ((select private.is_member()) and (status <> 'rascunho' or (select private.is_at_least('owner'))));
drop policy if exists "le acao" on public.dock_connector_actions;
create policy "le acao" on public.dock_connector_actions for select to authenticated
  using ((select private.is_member()) and exists (select 1 from public.dock_connectors c
          where c.id = connector_id and (c.status <> 'rascunho' or (select private.is_at_least('owner')))));
drop policy if exists "le pedido" on public.dock_connector_requests;
create policy "le pedido" on public.dock_connector_requests for select to authenticated
  using (requested_by = (select private.my_team_id()) or (select private.is_at_least('owner')));
drop policy if exists "le politica" on public.dock_provider_policies;
create policy "le politica" on public.dock_provider_policies for select to authenticated using ((select private.is_member()));

-- Registro: o dono do bot, os founders e quem gere a área tocada.
drop policy if exists "le registro" on public.dock_action_log;
create policy "le registro" on public.dock_action_log for select to authenticated
  using (owner_team_id = (select private.my_team_id())
      or (select private.is_at_least('owner'))
      or (area_id is not null and coalesce(private.area_level(area_id) = 'gerir', false)));

do $$
declare t text;
begin
  foreach t in array array['office_approvals', 'office_agent_skills', 'office_agent_connectors', 'office_action_grants',
                           'office_routines', 'office_thread_models', 'dock_skills', 'dock_connectors', 'dock_connector_requests', 'dock_skill_proposals']
  loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------- 12. funções do dono: bot ----------
-- Subir o nível é ato de pessoa logada. O motor ainda exige a confirmação na janela do app
-- antes de aplicar um nível maior que o já confirmado naquele PC (ver F5.2).
create or replace function public.office_set_agent_access(p_agent text, p_level int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  if p_level is null or p_level not between 0 and 3 then raise exception 'office_invalid_level'; end if;
  if p_level > private.office_limit('nivel_maximo') then raise exception 'office_level_not_released'; end if;
  update public.office_agents set access_level = p_level, access_level_set_at = now(), updated_at = now()
  where id = p_agent and owner_team_id = v_me;
  if not found then raise exception 'office_agent_not_found'; end if;
  -- baixou o nível: o "sempre permitir" de conector que o bot deixou de alcançar cai junto
  delete from public.office_action_grants g using public.dock_connectors c
  where g.agent_id = p_agent and c.id = g.connector_id and c.min_level > p_level;
end;
$$;

create or replace function public.office_set_agent_avatar(p_agent text, p_style text, p_color text, p_glyph text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  update public.office_agents set avatar_style = coalesce(p_style, avatar_style), avatar_color = coalesce(p_color, avatar_color),
    avatar_glyph = coalesce(p_glyph, avatar_glyph), updated_at = now()
  where id = p_agent and owner_team_id = v_me;
  if not found then raise exception 'office_agent_not_found'; end if;
end;
$$;

-- Bot a partir de um modelo da área. Nasce no nível 0, mesmo que o modelo sugira mais.
-- Só entram as skills que funcionam no nível 0; conector nenhum é instalado sozinho.
create or replace function public.office_create_agent_from_kit(p_kit_bot text, p_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  k public.dock_kit_bots;
  v_id text;
begin
  select * into k from public.dock_kit_bots x where x.id = p_kit_bot and x.active;
  if k.id is null or not private.can_read_area(k.area_id) then raise exception 'dock_kit_not_found'; end if;
  v_id := public.office_upsert_agent(null, null, coalesce(nullif(trim(coalesce(p_name, '')), ''), k.name), k.title,
                                     k.description, k.instructions, null, 'medium', null, '[]'::jsonb, k.capabilities, false);
  update public.office_agents set origin = 'modelo_area', origin_kit_bot_id = k.id,
    avatar_color = k.avatar_color, avatar_glyph = k.avatar_glyph
  where id = v_id;
  insert into public.office_agent_skills (agent_id, skill_id, owner_team_id, seen_version)
  select v_id, s.id, v_me, s.current_version
  from public.dock_skills s join public.dock_skill_versions v on v.skill_id = s.id and v.version = s.current_version
  where s.id = any (k.skill_ids) and s.scope = 'area' and s.area_id = k.area_id and not s.archived and v.min_level = 0
  on conflict do nothing;
  return v_id;
end;
$$;

-- ---------- 13. funções do dono: conexão, troca de IA, continuar ----------
create or replace function public.office_save_connection(
  p_id text, p_kind text, p_provider text, p_label text,
  p_endpoint text default null, p_acp_agent text default null, p_terms_version text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_id text;
begin
  if p_id is not null then
    -- o endereço não muda depois de criado: trocar de servidor é criar outra conexão (e aceitar o aviso de novo)
    update public.office_connections set label = trim(p_label) where id = p_id and owner_team_id = v_me;
    if not found then raise exception 'office_connection_not_found'; end if;
    return p_id;
  end if;
  if (select count(*) from public.office_connections c where c.owner_team_id = v_me) >= 30 then raise exception 'office_limit_connections'; end if;
  -- assinatura não tem botão nesta fase (Claude: a Anthropic não permite; os outros: sem fonte)
  if p_kind = 'assinatura' then raise exception 'office_kind_not_offered'; end if;
  -- programa de agente (ACP) roda processo no PC: espera a área isolada
  if p_kind = 'acp' and private.office_limit('acp_liberado') = 0 then raise exception 'office_kind_not_released'; end if;
  -- "local" só para provedor que roda no PC (senão o porteiro trataria uma nuvem como local)
  if p_kind = 'local' and not exists (select 1 from public.dock_provider_policies pp
       where pp.provider = lower(trim(p_provider)) and pp.data_class = 'local') then
    raise exception 'office_provider_not_local';
  end if;
  -- personalizado e ACP: a pessoa aceita o aviso ("você responde por este endereço" / termos do programa)
  if p_kind in ('compativel', 'acp') and (p_terms_version is null or char_length(trim(p_terms_version)) = 0) then
    raise exception 'office_terms_required';
  end if;
  v_id := private.ulid('con');
  insert into public.office_connections (id, owner_team_id, kind, provider, label, endpoint, acp_agent, terms_version, terms_ack_at)
  values (v_id, v_me, p_kind, lower(trim(p_provider)), trim(p_label),
          case when p_kind = 'compativel' then lower(trim(p_endpoint)) end,
          case when p_kind = 'acp' then lower(trim(p_acp_agent)) end,
          nullif(trim(coalesce(p_terms_version, '')), ''),
          case when p_terms_version is not null then now() end);
  return v_id;
end;
$$;

-- A função antiga passa a chamar a nova, para não sobrar um caminho sem as travas.
create or replace function public.office_upsert_connection(p_id text, p_kind text, p_provider text, p_label text)
returns text
language sql
security definer
set search_path = ''
as $$
  select public.office_save_connection(p_id, p_kind, p_provider, p_label);
$$;

-- Esta IA pode responder por este bot nesta conversa? (principal, reserva ou a troca feita pela pessoa)
create or replace function private.office_connection_allowed(p_agent text, p_thread text, p_connection text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.office_agents a
                 where a.id = p_agent and (a.connection_id = p_connection
                    or exists (select 1 from jsonb_array_elements(a.backup_models) b where b ->> 'connection_id' = p_connection)))
      or exists (select 1 from public.office_thread_models tm
                 where tm.thread_id = p_thread and tm.agent_id = p_agent and tm.connection_id = p_connection);
$$;

-- Troca a IA de um bot SÓ nesta conversa (p_connection null = volta à IA do bot). Deixa um aviso na conversa.
create or replace function public.office_set_thread_model(p_thread text, p_agent text, p_connection text, p_model text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_label text;
begin
  if not exists (select 1 from public.office_threads t where t.id = p_thread and t.owner_team_id = v_me and p_agent = any (t.agent_ids)) then
    raise exception 'office_thread_not_found';
  end if;
  if p_connection is null then
    delete from public.office_thread_models where thread_id = p_thread and agent_id = p_agent;
    v_label := 'a IA do bot';
  else
    select c.label into v_label from public.office_connections c
    where c.id = p_connection and c.owner_team_id = v_me and c.status <> 'desligada';
    if v_label is null then raise exception 'office_connection_not_found'; end if;
    insert into public.office_thread_models (thread_id, agent_id, owner_team_id, connection_id, model)
    values (p_thread, p_agent, v_me, p_connection, nullif(trim(coalesce(p_model, '')), ''))
    on conflict (thread_id, agent_id) do update set connection_id = excluded.connection_id, model = excluded.model, set_at = now();
  end if;
  insert into public.office_messages (id, thread_id, owner_team_id, author_type, author_id, kind, body)
  values (private.ulid('msg'), p_thread, v_me, 'system', v_me, 'aviso', 'IA desta conversa: ' || v_label);
end;
$$;

-- "Continuar com outro bot": abre uma conversa nova com o outro bot, ligada à de origem.
-- Nada é copiado e nenhuma entrega é criada: o bot novo só trabalha quando a pessoa escrever.
create or replace function public.office_continue_with(p_thread text, p_agent text, p_idempotency_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_src public.office_threads;
  v_name text;
  v_new text;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then raise exception 'office_invalid_key'; end if;
  select m.thread_id into v_new from public.office_messages m where m.idempotency_key = p_idempotency_key and m.owner_team_id = v_me;
  if v_new is not null then return v_new; end if;
  select * into v_src from public.office_threads t where t.id = p_thread and t.owner_team_id = v_me;
  if v_src.id is null then raise exception 'office_thread_not_found'; end if;
  select a.name into v_name from public.office_agents a where a.id = p_agent and a.owner_team_id = v_me;
  if v_name is null then raise exception 'office_agent_not_found'; end if;
  v_new := public.office_open_thread('direta', array[p_agent], left('Continuação: ' || v_src.title, 120));
  update public.office_threads set continued_from_thread_id = p_thread where id = v_new;
  insert into public.office_messages (id, thread_id, owner_team_id, author_type, author_id, kind, body, idempotency_key)
  values (private.ulid('msg'), v_new, v_me, 'system', v_me, 'aviso', 'Continuação de outra conversa. O histórico entra como informação, não como ordem.', p_idempotency_key);
  insert into public.office_messages (id, thread_id, owner_team_id, author_type, author_id, kind, body)
  values (private.ulid('msg'), p_thread, v_me, 'system', v_me, 'aviso', 'Continuada com ' || v_name || '.');
  return v_new;
end;
$$;

-- ---------- 14. funções de skill ----------
create or replace function private.dock_add_skill_version(
  p_skill text, p_version int, p_label text, p_what_changed text, p_body text, p_files jsonb, p_examples jsonb,
  p_min_level int, p_required text[], p_has_scripts boolean, p_published_by text, p_approved_by text, p_proposal text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_files jsonb := coalesce(p_files, '[]'::jsonb);
begin
  if coalesce(p_has_scripts, false) and private.office_limit('scripts_liberados') = 0 then raise exception 'dock_scripts_not_released'; end if;
  -- cada arquivo: {path, content}; caminho relativo e limpo; extensão de programa só com has_scripts
  if exists (select 1 from jsonb_array_elements(v_files) f where
       jsonb_typeof(f) <> 'object' or not (f ? 'path' and f ? 'content') or jsonb_typeof(f -> 'content') <> 'string'
       or f ->> 'path' !~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9._-]+){0,3}$' or f ->> 'path' ~ '[.][.]'
       or ((f ->> 'path' ~* '^scripts/' or f ->> 'path' ~* '[.](ps1|psm1|bat|cmd|sh|py|js|mjs|exe|vbs|dll|msi|lnk)$')
           and not coalesce(p_has_scripts, false))) then
    raise exception 'dock_invalid_files';
  end if;
  if exists (select 1 from unnest(coalesce(p_required, '{}')) r where not exists (select 1 from public.dock_connectors c where c.id = r)) then
    raise exception 'dock_unknown_connector';
  end if;
  insert into public.dock_skill_versions (skill_id, version, label, what_changed, body, files, examples, min_level, required_connectors,
                                          has_scripts, content_sha256, published_by, approved_by, proposal_id)
  values (p_skill, p_version, p_label, p_what_changed, p_body, v_files, coalesce(p_examples, '[]'::jsonb), coalesce(p_min_level, 0),
          coalesce(p_required, '{}'), coalesce(p_has_scripts, false),
          encode(sha256(convert_to(p_body || chr(10) || v_files::text, 'UTF8')), 'hex'),
          p_published_by, p_approved_by, p_proposal);
  update public.dock_skills set current_version = p_version, updated_at = now() where id = p_skill;
end;
$$;

-- Cria uma skill (p_skill null) ou publica versão nova DIRETO. Direto só vale para:
-- a própria skill pessoal, ou skill da área quando quem chama é o responsável. Os demais usam a proposta.
create or replace function public.dock_save_skill(
  p_skill text, p_scope text, p_area text, p_name text, p_description text, p_label text, p_what_changed text, p_body text,
  p_files jsonb default '[]'::jsonb, p_examples jsonb default '[]'::jsonb, p_min_level int default 0,
  p_required text[] default '{}', p_has_scripts boolean default false, p_in_kit boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.my_team_id();
  s public.dock_skills;
  v_id text;
  v_lead boolean;
begin
  if v_me is null then raise exception 'office_not_member'; end if;
  if p_skill is null then
    if p_scope = 'pessoal' then
      v_me := private.office_require();
      if (select count(*) from public.dock_skills x where x.scope = 'pessoal' and x.owner_team_id = v_me) >= private.office_limit('skills_pessoais') then
        raise exception 'dock_limit_skills';
      end if;
    elsif p_scope = 'area' then
      if not private.dock_is_area_lead(p_area) then raise exception 'dock_use_proposal' using errcode = '42501'; end if;
    else
      raise exception 'dock_invalid_scope';
    end if;
    v_id := private.ulid('skl');
    insert into public.dock_skills (id, scope, area_id, owner_team_id, name, description, in_kit, created_by)
    values (v_id, p_scope, case when p_scope = 'area' then p_area end, case when p_scope = 'pessoal' then v_me end,
            trim(p_name), coalesce(p_description, ''), p_scope = 'area' and coalesce(p_in_kit, false), v_me);
    perform private.dock_add_skill_version(v_id, 1, p_label, coalesce(nullif(trim(coalesce(p_what_changed, '')), ''), 'Primeira versão.'),
                                           p_body, p_files, p_examples, p_min_level, p_required, p_has_scripts, v_me,
                                           case when p_scope = 'area' then v_me end, null);
    return v_id;
  end if;

  select * into s from public.dock_skills x where x.id = p_skill for update;
  v_lead := s.scope = 'area' and private.dock_is_area_lead(s.area_id);
  if s.id is null or not ((s.scope = 'pessoal' and s.owner_team_id = v_me) or v_lead) then
    raise exception 'dock_use_proposal' using errcode = '42501';
  end if;
  update public.dock_skills set name = trim(p_name), description = coalesce(p_description, ''),
    in_kit = s.scope = 'area' and coalesce(p_in_kit, false) where id = p_skill;
  perform private.dock_add_skill_version(p_skill, s.current_version + 1, p_label, p_what_changed, p_body, p_files, p_examples,
                                         p_min_level, p_required, p_has_scripts, v_me, case when v_lead then v_me end, null);
  return p_skill;
end;
$$;

-- O motor guarda um aprendizado candidato no fim de uma entrega (servidor). Fica só com o dono.
create or replace function public.office_add_skill_learning(
  p_job_public_id text, p_lease_id uuid, p_skill text, p_version int, p_kind text, p_pattern text, p_evidence text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  v_id text;
begin
  r := private.lock_leased(p_job_public_id, p_lease_id);
  if r.owner_team_id is null then raise exception 'office_job_mismatch' using errcode = '42501'; end if;
  if not exists (select 1 from public.office_agent_skills i where i.agent_id = r.agent_id and i.skill_id = p_skill and i.owner_team_id = r.owner_team_id) then
    raise exception 'office_skill_not_installed';
  end if;
  if (select count(*) from public.office_skill_learnings l where l.owner_team_id = r.owner_team_id and l.status = 'candidato') >= private.office_limit('aprendizados') then
    return null;
  end if;
  v_id := private.ulid('lrn');
  insert into public.office_skill_learnings (id, owner_team_id, agent_id, skill_id, version, kind, pattern, evidence, job_public_id)
  values (v_id, r.owner_team_id, r.agent_id, p_skill, p_version, p_kind, p_pattern, left(coalesce(p_evidence, ''), 1000), p_job_public_id);
  return v_id;
end;
$$;

-- A PESSOA envia o padrão para a área (p_pattern é o texto que ela viu e pôde editar).
-- Sobe só o padrão. Texto com cara de dado pessoal (e-mail, link, número longo) é recusado.
create or replace function public.office_send_skill_signal(p_learning text, p_pattern text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  l public.office_skill_learnings;
  v_id text;
begin
  select * into l from public.office_skill_learnings x where x.id = p_learning and x.owner_team_id = v_me for update;
  if l.id is null or l.status <> 'candidato' then raise exception 'office_learning_not_found'; end if;
  if not exists (select 1 from public.dock_skills s where s.id = l.skill_id and s.scope = 'area' and private.can_read_area(s.area_id)) then
    raise exception 'dock_skill_not_found';
  end if;
  if p_pattern is null or char_length(trim(p_pattern)) not between 10 and 600 then raise exception 'dock_invalid_pattern'; end if;
  if p_pattern ~ '[^[:space:]@]+@[^[:space:]@]+[.][A-Za-z]{2,}' or p_pattern ~ '[0-9]{8,}' or p_pattern ~* 'https?://' then
    raise exception 'dock_signal_looks_personal';
  end if;
  v_id := private.ulid('sgn');
  insert into public.dock_skill_signals (id, skill_id, version, kind, pattern, sent_by)
  values (v_id, l.skill_id, l.version, l.kind, trim(p_pattern), v_me);
  update public.office_skill_learnings set status = 'enviado' where id = p_learning;
  return v_id;
end;
$$;

-- Proposta de versão nova (p_skill) ou de skill nova para a área (p_skill null, p_source = a pessoal de origem).
create or replace function public.dock_propose_skill(
  p_area text, p_skill text, p_source text, p_name text, p_description text, p_label text, p_what_changed text, p_why text, p_body text,
  p_files jsonb default '[]'::jsonb, p_examples jsonb default '[]'::jsonb, p_min_level int default 0,
  p_required text[] default '{}', p_has_scripts boolean default false, p_signal_ids text[] default '{}'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.my_team_id();
  v_base int;
  v_id text;
  v_n int;
begin
  if v_me is null or not private.can_write() or p_area is null or not private.can_read_area(p_area) then
    raise exception 'dock_area_not_allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.dock_skill_proposals p where p.proposed_by = v_me and p.status = 'aberta') >= private.office_limit('pedidos_abertos') then
    raise exception 'dock_limit_proposals';
  end if;
  if p_skill is not null then
    select s.current_version into v_base from public.dock_skills s where s.id = p_skill and s.scope = 'area' and s.area_id = p_area and not s.archived;
    if v_base is null then raise exception 'dock_skill_not_found'; end if;
  end if;
  if p_source is not null and not exists (select 1 from public.dock_skills s where s.id = p_source and s.scope = 'pessoal' and s.owner_team_id = v_me) then
    raise exception 'dock_skill_not_found';
  end if;
  v_id := private.ulid('skp');
  insert into public.dock_skill_proposals (id, area_id, skill_id, source_skill_id, base_version, name, description, label, what_changed, why,
                                           body, files, examples, min_level, required_connectors, has_scripts, proposed_by)
  values (v_id, p_area, p_skill, p_source, v_base, trim(p_name), coalesce(p_description, ''), p_label, p_what_changed, coalesce(p_why, ''),
          p_body, coalesce(p_files, '[]'::jsonb), coalesce(p_examples, '[]'::jsonb), coalesce(p_min_level, 0), coalesce(p_required, '{}'),
          coalesce(p_has_scripts, false), v_me);
  -- os sinais que embasam a proposta (só os da mesma skill e ainda soltos)
  update public.dock_skill_signals g set proposal_id = v_id
  where g.id = any (coalesce(p_signal_ids, '{}')) and g.skill_id = p_skill and g.proposal_id is null;
  get diagnostics v_n = row_count;
  update public.dock_skill_proposals set signal_count = v_n where id = v_id;
  return v_id;
end;
$$;

-- O responsável da área decide. Aprovar publica a versão na mesma transação.
-- Skill com script só entra com um founder aprovando.
create or replace function public.dock_decide_skill_proposal(p_id text, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.my_team_id();
  p public.dock_skill_proposals;
  v_skill text;
  v_version int := 1;
begin
  select * into p from public.dock_skill_proposals x where x.id = p_id for update;
  if v_me is null or p.id is null or not private.dock_is_area_lead(p.area_id) then raise exception 'dock_proposal_not_found' using errcode = '42501'; end if;
  if p.status <> 'aberta' then raise exception 'dock_proposal_closed'; end if;
  if not coalesce(p_approve, false) then
    update public.dock_skill_proposals set status = 'recusada', decided_by = v_me, decided_at = now(), decision_note = left(p_note, 600) where id = p_id;
    return;
  end if;
  if p.has_scripts and not private.is_at_least('owner') then raise exception 'dock_scripts_need_founder' using errcode = '42501'; end if;
  v_skill := p.skill_id;
  if v_skill is null then
    v_skill := private.ulid('skl');
    insert into public.dock_skills (id, scope, area_id, name, description, created_by)
    values (v_skill, 'area', p.area_id, p.name, p.description, p.proposed_by);
  else
    select s.current_version + 1 into v_version from public.dock_skills s where s.id = v_skill for update;
    -- a skill andou desde a proposta: quem propôs refaz em cima da versão atual
    if v_version - 1 is distinct from p.base_version then raise exception 'dock_proposal_stale'; end if;
  end if;
  perform private.dock_add_skill_version(v_skill, v_version, p.label, p.what_changed, p.body, p.files, p.examples, p.min_level,
                                         p.required_connectors, p.has_scripts, p.proposed_by, v_me, p.id);
  update public.dock_skill_proposals set status = 'aprovada', skill_id = v_skill, decided_by = v_me, decided_at = now(),
    decision_note = left(p_note, 600), result_version = v_version where id = p_id;
end;
$$;

-- Instala (ou muda o modo de) uma skill num bot. p_pin null = acompanha a atual; número = fixa naquela versão.
create or replace function public.office_install_skill(p_agent text, p_skill text, p_pin int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_level int;
  s public.dock_skills;
  v_ver int;
  v_min int;
begin
  select a.access_level into v_level from public.office_agents a where a.id = p_agent and a.owner_team_id = v_me for update;
  if v_level is null then raise exception 'office_agent_not_found'; end if;
  select * into s from public.dock_skills x where x.id = p_skill and not x.archived;
  if s.id is null or not ((s.scope = 'pessoal' and s.owner_team_id = v_me) or (s.scope = 'area' and s.area_id is not null and private.can_read_area(s.area_id))) then
    raise exception 'dock_skill_not_found';
  end if;
  v_ver := coalesce(p_pin, s.current_version);
  select v.min_level into v_min from public.dock_skill_versions v where v.skill_id = p_skill and v.version = v_ver;
  if v_min is null then raise exception 'dock_version_not_found'; end if;
  -- bot de nível baixo não recebe skill que pede nível alto
  if v_min > v_level then raise exception 'office_skill_level'; end if;
  if not exists (select 1 from public.office_agent_skills i where i.agent_id = p_agent and i.skill_id = p_skill)
     and (select count(*) from public.office_agent_skills i where i.agent_id = p_agent) >= private.office_limit('skills_por_bot') then
    raise exception 'office_limit_skills';
  end if;
  insert into public.office_agent_skills (agent_id, skill_id, owner_team_id, pinned_version, seen_version)
  values (p_agent, p_skill, v_me, p_pin, v_ver)
  on conflict (agent_id, skill_id) do update set pinned_version = excluded.pinned_version, seen_version = excluded.seen_version;
end;
$$;

create or replace function public.office_uninstall_skill(p_agent text, p_skill text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  delete from public.office_agent_skills where agent_id = p_agent and skill_id = p_skill and owner_team_id = v_me;
end;
$$;

-- Que versão o bot usa AGORA (o servidor chama isto ao montar a entrega). null = a skill não é entregue.
-- Versão nova entra sozinha só se não pedir MAIS que a versão que o dono já aceitou.
-- Pedir mais (nível, conector, script) espera o dono: até lá o bot fica na MAIOR versão que não pede mais
-- (nunca volta para uma versão mais antiga que já estava usando).
create or replace function private.office_skill_version_for(p_agent text, p_skill text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when eff.min_level <= a.access_level then eff.version end
  from public.office_agent_skills i
  join public.office_agents a on a.id = i.agent_id
  join public.dock_skills s on s.id = i.skill_id
  join public.dock_skill_versions seen on seen.skill_id = s.id and seen.version = i.seen_version
  join public.dock_skill_versions eff on eff.skill_id = s.id and eff.version = coalesce(i.pinned_version, (
    select max(v.version) from public.dock_skill_versions v
    where v.skill_id = s.id and v.version between i.seen_version and s.current_version
      and v.min_level <= seen.min_level and v.required_connectors <@ seen.required_connectors
      and (seen.has_scripts or not v.has_scripts)))
  where i.agent_id = p_agent and i.skill_id = p_skill and not s.archived
    -- a pessoa perdeu a área: a skill para de ser entregue, mesmo instalada
    and (s.scope = 'pessoal' or private.area_rank(private.area_level_of(i.owner_team_id, s.area_id)) >= private.area_rank('ver'));
$$;

-- O dono viu o aviso de versão nova: 'atualizar' aceita a atual; 'fixar' fica na que já usa.
create or replace function public.office_ack_skill_update(p_agent text, p_skill text, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_cur int;
  v_min int;
  v_level int;
begin
  select s.current_version, v.min_level, a.access_level into v_cur, v_min, v_level
  from public.office_agent_skills i
  join public.office_agents a on a.id = i.agent_id
  join public.dock_skills s on s.id = i.skill_id
  join public.dock_skill_versions v on v.skill_id = s.id and v.version = s.current_version
  where i.agent_id = p_agent and i.skill_id = p_skill and i.owner_team_id = v_me;
  if v_cur is null then raise exception 'office_skill_not_installed'; end if;
  if p_mode = 'fixar' then
    update public.office_agent_skills set pinned_version = seen_version where agent_id = p_agent and skill_id = p_skill;
  elsif p_mode = 'atualizar' then
    if v_min > v_level then raise exception 'office_skill_level'; end if;
    update public.office_agent_skills set pinned_version = null, seen_version = v_cur where agent_id = p_agent and skill_id = p_skill;
  else
    raise exception 'office_invalid_mode';
  end if;
end;
$$;

-- Bot modelo do Kit: o responsável da área monta.
create or replace function public.dock_save_kit_bot(
  p_id text, p_area text, p_name text, p_title text, p_description text, p_instructions text, p_suggested_level int,
  p_skill_ids text[] default '{}', p_connector_ids text[] default '{}', p_avatar_color text default 'grafite',
  p_avatar_glyph text default '', p_capabilities text[] default array['texto'], p_active boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.my_team_id();
  v_id text := p_id;
begin
  if v_me is null or not private.dock_is_area_lead(p_area) then raise exception 'dock_area_lead_only' using errcode = '42501'; end if;
  if exists (select 1 from unnest(coalesce(p_skill_ids, '{}')) x
             where not exists (select 1 from public.dock_skills s where s.id = x and s.scope = 'area' and s.area_id = p_area)) then
    raise exception 'dock_skill_not_found';
  end if;
  if exists (select 1 from unnest(coalesce(p_connector_ids, '{}')) x
             where not exists (select 1 from public.dock_connectors c where c.id = x and c.status = 'aprovado')) then
    raise exception 'dock_unknown_connector';
  end if;
  if v_id is null then
    if (select count(*) from public.dock_kit_bots k where k.area_id = p_area and k.active) >= private.office_limit('bots_modelo_por_area') then
      raise exception 'dock_limit_kit_bots';
    end if;
    v_id := private.ulid('kbt');
    insert into public.dock_kit_bots (id, area_id, name, title, updated_by) values (v_id, p_area, trim(p_name), trim(p_title), v_me);
  end if;
  update public.dock_kit_bots set name = trim(p_name), title = trim(p_title), description = coalesce(p_description, ''),
    instructions = coalesce(p_instructions, ''), suggested_level = coalesce(p_suggested_level, 0),
    skill_ids = coalesce(p_skill_ids, '{}'), connector_ids = coalesce(p_connector_ids, '{}'),
    avatar_color = coalesce(p_avatar_color, 'grafite'), avatar_glyph = coalesce(p_avatar_glyph, ''),
    capabilities = coalesce(p_capabilities, array['texto']), active = coalesce(p_active, true), updated_by = v_me, updated_at = now()
  where id = v_id and area_id = p_area;
  if not found then raise exception 'dock_kit_not_found'; end if;
  return v_id;
end;
$$;

-- ---------- 15. funções do catálogo de conectores (founder) ----------
-- Qualquer mudança num conector aprovado volta para rascunho: os bots perdem o conector até a nova aprovação.
create or replace function public.dock_save_connector(
  p_id text, p_name text, p_category text, p_description text, p_runs_at text, p_transport text, p_min_level int, p_wave int,
  p_server_host text default null, p_package_name text default null, p_package_version text default null,
  p_package_sha256 text default null, p_source_url text default null, p_source_checked_on date default null, p_note text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  insert into public.dock_connectors (id, name, category, description, note, runs_at, transport, server_host, package_name, package_version,
                                      package_sha256, min_level, wave, source_url, source_checked_on, updated_by)
  values (lower(trim(p_id)), trim(p_name), p_category, coalesce(p_description, ''), coalesce(p_note, ''), p_runs_at, p_transport, p_server_host,
          p_package_name, p_package_version, p_package_sha256, coalesce(p_min_level, 0), coalesce(p_wave, 0), p_source_url, p_source_checked_on, v_me)
  on conflict (id) do update set name = excluded.name, category = excluded.category, description = excluded.description, note = excluded.note,
    runs_at = excluded.runs_at, transport = excluded.transport, server_host = excluded.server_host, package_name = excluded.package_name,
    package_version = excluded.package_version, package_sha256 = excluded.package_sha256, min_level = excluded.min_level, wave = excluded.wave,
    source_url = excluded.source_url, source_checked_on = excluded.source_checked_on,
    status = 'rascunho', approved_by = null, approved_at = null, tools_sha256 = null, updated_by = excluded.updated_by, updated_at = now();
  -- servidor, pacote ou nível mudou: ninguém mantém "sempre permitir" de algo que não foi o aprovado
  delete from public.office_action_grants g where g.connector_id = lower(trim(p_id));
  return lower(trim(p_id));
end;
$$;

create or replace function public.dock_save_connector_action(
  p_connector text, p_action_key text, p_tool_name text, p_label text, p_class text, p_max_items int default 1,
  p_sends_outside boolean default false, p_money boolean default false, p_area text default null, p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  update public.dock_connectors set status = 'rascunho', approved_by = null, approved_at = null, tools_sha256 = null,
    updated_by = v_me, updated_at = now() where id = p_connector;
  if not found then raise exception 'dock_unknown_connector'; end if;
  -- qualquer mudança na ação (ferramenta, teto, área, classe) acaba com o "sempre permitir" dela
  delete from public.office_action_grants g where g.connector_id = p_connector and g.action_key = p_action_key;
  insert into public.dock_connector_actions (connector_id, action_key, tool_name, label, action_class, max_items, sends_outside, money, area_id, enabled)
  values (p_connector, p_action_key, p_tool_name, trim(p_label), p_class, coalesce(p_max_items, 1), coalesce(p_sends_outside, false),
          coalesce(p_money, false), p_area, coalesce(p_enabled, true))
  on conflict (connector_id, action_key) do update set tool_name = excluded.tool_name, label = excluded.label, action_class = excluded.action_class,
    max_items = excluded.max_items, sends_outside = excluded.sends_outside, money = excluded.money, area_id = excluded.area_id, enabled = excluded.enabled;
end;
$$;

-- Aprovar: grava quem, quando e a lista de ferramentas conferida (p_tools_sha256 vem do motor do founder).
create or replace function public.dock_approve_connector(p_id text, p_tools_sha256 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  if not exists (select 1 from public.dock_connector_actions x where x.connector_id = p_id and x.enabled) then raise exception 'dock_connector_without_actions'; end if;
  -- Pergunta ao Igor (nota 42): exigir que quem aprova seja diferente de quem editou por último?
  --   and updated_by <> v_me
  update public.dock_connectors set status = 'aprovado', approved_by = v_me, approved_at = now(), tools_sha256 = p_tools_sha256
  where id = p_id and status in ('rascunho', 'suspenso') and source_url is not null and (transport = 'interno' or p_tools_sha256 is not null);
  if not found then raise exception 'dock_connector_not_ready'; end if;
end;
$$;

-- Suspender vale na hora para todos os bots: o porteiro recusa e o motor deixa de oferecer.
create or replace function public.dock_suspend_connector(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  update public.dock_connectors set status = 'suspenso', updated_by = v_me, updated_at = now() where id = p_id;
  if not found then raise exception 'dock_unknown_connector'; end if;
end;
$$;

create or replace function public.dock_request_connector(p_name text, p_url text, p_why text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.my_team_id();
  v_id text;
begin
  if v_me is null or not private.can_write() then raise exception 'office_not_member' using errcode = '42501'; end if;
  if (select count(*) from public.dock_connector_requests q where q.requested_by = v_me and q.status = 'aberto') >= private.office_limit('pedidos_abertos') then
    raise exception 'dock_limit_requests';
  end if;
  v_id := private.ulid('crq');
  insert into public.dock_connector_requests (id, name, url, why, requested_by) values (v_id, trim(p_name), nullif(trim(coalesce(p_url, '')), ''), trim(p_why), v_me);
  return v_id;
end;
$$;

create or replace function public.dock_decide_connector_request(p_id text, p_accept boolean, p_note text default null, p_connector text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  update public.dock_connector_requests set status = case when coalesce(p_accept, false) then 'aceito' else 'recusado' end,
    decided_by = v_me, decided_at = now(), decision_note = left(p_note, 600), connector_id = p_connector
  where id = p_id and status = 'aberto';
  if not found then raise exception 'dock_request_not_found'; end if;
end;
$$;

create or replace function public.dock_set_provider_policy(p_provider text, p_data_class text, p_note text, p_source_url text, p_checked_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  insert into public.dock_provider_policies (provider, data_class, note, source_url, checked_on, set_by)
  values (lower(trim(p_provider)), p_data_class, coalesce(p_note, ''), p_source_url, p_checked_on, v_me)
  on conflict (provider) do update set data_class = excluded.data_class, note = excluded.note, source_url = excluded.source_url,
    checked_on = excluded.checked_on, set_by = excluded.set_by, set_at = now();
end;
$$;

-- Founder suspende (ou libera) o escritório de uma pessoa. Não dá acesso a nada: só para.
create or replace function public.dock_set_office_suspended(p_owner text, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  update public.office set suspended_at = case when coalesce(p_suspended, false) then now() end,
    suspended_by = case when coalesce(p_suspended, false) then v_me end
  where owner_team_id = p_owner;
  if not found then raise exception 'office_not_found'; end if;
end;
$$;

-- ---------- 16. funções do dono: conector no bot e "sempre permitir" ----------
create or replace function public.office_install_connector(p_agent text, p_connector text, p_read_only boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_level int;
  v_min int;
begin
  select a.access_level into v_level from public.office_agents a where a.id = p_agent and a.owner_team_id = v_me for update;
  if v_level is null then raise exception 'office_agent_not_found'; end if;
  select c.min_level into v_min from public.dock_connectors c where c.id = p_connector and c.status = 'aprovado' and c.wave > 0;
  if v_min is null then raise exception 'dock_unknown_connector'; end if;
  if v_min > v_level then raise exception 'office_connector_level'; end if;
  if not exists (select 1 from public.office_agent_connectors i where i.agent_id = p_agent and i.connector_id = p_connector)
     and (select count(*) from public.office_agent_connectors i where i.agent_id = p_agent) >= private.office_limit('conectores_por_bot') then
    raise exception 'office_limit_connectors';
  end if;
  insert into public.office_agent_connectors (agent_id, connector_id, owner_team_id, read_only)
  values (p_agent, p_connector, v_me, coalesce(p_read_only, true))
  on conflict (agent_id, connector_id) do update set read_only = excluded.read_only;
  if coalesce(p_read_only, true) then
    delete from public.office_action_grants g where g.agent_id = p_agent and g.connector_id = p_connector;
  end if;
end;
$$;

create or replace function public.office_uninstall_connector(p_agent text, p_connector text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  -- o "sempre permitir" cai junto (on delete cascade)
  delete from public.office_agent_connectors where agent_id = p_agent and connector_id = p_connector and owner_team_id = v_me;
end;
$$;

-- Liga ou desliga o "sempre permitir" de UMA ação num bot. Só classe C; nunca D.
create or replace function public.office_set_action_grant(p_agent text, p_connector text, p_action text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  if not coalesce(p_on, false) then
    delete from public.office_action_grants where agent_id = p_agent and connector_id = p_connector and action_key = p_action and owner_team_id = v_me;
    return;
  end if;
  if not exists (select 1 from public.office_agent_connectors i
                 where i.agent_id = p_agent and i.connector_id = p_connector and i.owner_team_id = v_me and not i.read_only) then
    raise exception 'office_connector_not_installed';
  end if;
  -- o gatilho grant_guard recusa se a ação não for C
  insert into public.office_action_grants (agent_id, connector_id, action_key, owner_team_id, granted_by, expires_at)
  values (p_agent, p_connector, p_action, v_me, v_me, now() + interval '90 days')
  on conflict (agent_id, connector_id, action_key) do update set granted_by = excluded.granted_by, granted_at = now(), expires_at = excluded.expires_at;
end;
$$;

-- ---------- 17. o porteiro (servidor) ----------
create or replace function private.dock_log_action(
  p_owner text, p_agent text, p_connector text, p_action text, p_class text, p_area text, p_items int, p_origin text,
  p_data_class text, p_outcome text, p_basis text, p_actor text, p_approval text, p_job text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.dock_action_log (owner_team_id, agent_id, agent_name, connector_id, action_key, action_class, area_id, item_count,
                                      origin, data_class, outcome, basis, actor, approval_id, job_public_id)
  values (left(p_owner, 64), left(p_agent, 64), coalesce((select left(a.name, 60) from public.office_agents a where a.id = p_agent), ''),
          left(p_connector, 64), left(p_action, 64), left(p_class, 1), left(p_area, 64), coalesce(p_items, 1), left(p_origin, 20),
          left(p_data_class, 20), p_outcome, left(coalesce(p_basis, ''), 60), left(coalesce(p_actor, 'bot'), 64), left(p_approval, 64), left(p_job, 64));
$$;

-- TODA ação de conector "da empresa" passa aqui ANTES de acontecer, inclusive leitura.
-- Quem chama é o motor, com o lease da entrega. O bot não chama: ele não tem credencial nenhuma.
-- Devolve: permitida (pode executar) · aguardando (virou aprovação) · negada (com o motivo).
create or replace function public.office_request_action(
  p_worker_id text, p_job_public_id text, p_lease_id uuid, p_agent_id text, p_connector_id text, p_action_key text,
  p_connection_id text, p_item_count int, p_tainted boolean, p_origin_detail text,
  p_title text, p_summary text, p_draft jsonb, p_idempotency_key text
)
returns table (decision text, approval text, reason text, klass text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  v_agent public.office_agents;
  v_con public.dock_connectors;
  v_act public.dock_connector_actions;
  v_inst public.office_agent_connectors;
  v_ia public.office_connections;
  v_prev public.office_approvals;
  v_class text;
  v_origin text;
  v_data text;
  v_items int := greatest(1, coalesce(p_item_count, 1));
  v_deny text;
  v_apr text;
  v_grant boolean := false;
begin
  r := private.lock_leased(p_job_public_id, p_lease_id);
  if r.owner_team_id is null or r.claimed_by is distinct from p_worker_id or r.agent_id is distinct from p_agent_id then
    raise exception 'office_job_mismatch' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workers w where w.id = p_worker_id and w.enabled and w.owner_team_id = r.owner_team_id) then
    raise exception 'office_worker_mismatch' using errcode = '42501';
  end if;
  -- ação aprovada roda pelo office_take_approval, nunca por um pedido novo dentro dela
  if r.job_type <> 'office_reply' then raise exception 'office_job_mismatch' using errcode = '42501'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then raise exception 'office_invalid_key'; end if;

  -- o mesmo pedido de novo devolve a mesma resposta (o motor pergunta de novo depois da aprovação)
  select * into v_prev from public.office_approvals x where x.idempotency_key = p_idempotency_key and x.owner_team_id = r.owner_team_id;
  if v_prev.id is not null then
    return query select case when v_prev.status = 'pendente' and v_prev.expires_at > now() then 'aguardando' else 'negada' end,
                        v_prev.id, v_prev.status, v_prev.action_class;
    return;
  end if;

  select * into v_agent from public.office_agents a where a.id = p_agent_id and a.owner_team_id = r.owner_team_id;
  select * into v_con from public.dock_connectors c where c.id = p_connector_id;
  select * into v_act from public.dock_connector_actions x where x.connector_id = p_connector_id and x.action_key = p_action_key;
  select * into v_inst from public.office_agent_connectors i where i.agent_id = p_agent_id and i.connector_id = p_connector_id;
  select * into v_ia from public.office_connections c where c.id = p_connection_id and c.owner_team_id = r.owner_team_id;

  -- 2. tipo de ação, com o volume: acima de max_items vira D
  v_class := v_act.action_class;
  if v_class is not null and v_items > v_act.max_items then v_class := 'D'; end if;
  -- 3. origem: quem decide é o servidor (pela entrega) e o motor (conteúdo de fora lido nesta entrega), nunca o bot
  -- "humano" só por lista positiva: entrega nascida de mensagem da própria pessoa
  v_origin := case when coalesce(p_tainted, false) then 'externo'
                   when r.parent_job_id is not null then 'bot'
                   when r.payload ->> 'origin' = 'rotina' then 'rotina'
                   when r.payload ? 'message_id' and r.created_by = r.owner_team_id then 'humano'
                   else 'bot' end;
  v_data := private.office_data_class(v_ia.kind, v_ia.provider, v_ia.endpoint);

  v_deny := case
    when not exists (select 1 from public.members m where m.team_id = r.owner_team_id and m.active) then 'dono_inativo'
    when v_agent.id is null then 'bot_nao_encontrado'
    when exists (select 1 from public.office o where o.owner_team_id = r.owner_team_id and o.suspended_at is not null) then 'escritorio_suspenso'
    when v_agent.paused then 'bot_pausado'
    when v_con.id is null or v_con.status <> 'aprovado' then 'conector_fora_do_catalogo'
    when v_con.runs_at <> 'empresa' then 'conector_do_pc'
    when v_act.connector_id is null or not v_act.enabled then 'acao_desconhecida'
    when v_inst.agent_id is null then 'conector_nao_instalado'
    when v_agent.access_level < v_con.min_level then 'nivel_insuficiente'
    when v_inst.read_only and v_class <> 'A' then 'so_leitura'
    when v_ia.id is null or not private.office_connection_allowed(p_agent_id, r.entity_id, p_connection_id) then 'ia_nao_autorizada'
    -- dado da empresa não vai para provedor que treina com o conteúdo
    when v_data = 'treina' then 'provedor_treina_com_dados'
    -- 1. dono e cargo: o bot nunca pode mais que o dono
    when v_class <> 'A' and not exists (select 1 from public.members m where m.team_id = r.owner_team_id and m.active
                                        and m.role_level in ('owner', 'admin', 'operator')) then 'cargo_nao_alcanca'
    when v_act.area_id is not null
         and private.area_rank(private.area_level_of(r.owner_team_id, v_act.area_id))
             < private.area_rank(case when v_class = 'A' then 'ver' else 'operar' end) then 'cargo_nao_alcanca'
    -- 4. velocidade
    when (select count(*) from public.dock_action_log l where l.agent_id = p_agent_id and l.created_at > now() - interval '1 minute')
         >= private.office_limit('acoes_por_minuto') then 'limite_de_velocidade'
    when v_class in ('C', 'D') and (select count(*) from public.office_approvals x where x.agent_id = p_agent_id and x.status = 'pendente')
         >= private.office_limit('aprovacoes_pendentes_por_bot') then 'fila_de_aprovacao_cheia'
    else null end;

  if v_deny is not null then
    perform private.dock_log_action(r.owner_team_id, p_agent_id, p_connector_id, p_action_key, v_class, v_act.area_id, v_items, v_origin,
                                    v_data, 'negada', v_deny, 'bot', null, p_job_public_id);
    -- recusas acumuladas pausam o bot (nota 26, "automático")
    if (select count(*) from public.dock_action_log l where l.agent_id = p_agent_id and l.outcome = 'negada'
          and l.created_at > now() - interval '10 minutes') >= private.office_limit('recusas_em_10_min') then
      update public.office_agents set paused = true, updated_at = now() where id = p_agent_id and owner_team_id = r.owner_team_id;
    end if;
    return query select 'negada'::text, null::text, v_deny, v_class;
    return;
  end if;

  -- "sempre permitir": só C, só pedido da própria pessoa, só sem conteúdo de fora nesta entrega
  if v_class = 'C' and v_origin = 'humano' then
    update public.office_action_grants g set uses = g.uses + 1, last_used_at = now()
    where g.agent_id = p_agent_id and g.connector_id = p_connector_id and g.action_key = p_action_key
      and (g.expires_at is null or g.expires_at > now());
    v_grant := found;
  end if;

  if v_class in ('A', 'B') or v_grant then
    perform private.dock_log_action(r.owner_team_id, p_agent_id, p_connector_id, p_action_key, v_class, v_act.area_id, v_items, v_origin,
                                    v_data, 'permitida', case when v_grant then 'sempre_permitir' else 'classe_' || v_class end,
                                    'bot', null, p_job_public_id);
    return query select 'permitida'::text, null::text, case when v_grant then 'sempre_permitir' else 'classe_' || v_class end, v_class;
    return;
  end if;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then raise exception 'office_invalid_draft'; end if;
  v_apr := private.ulid('apr');
  insert into public.office_approvals (id, owner_team_id, agent_id, job_public_id, thread_id, connector_id, action_key, action_class, gate, approver,
                                       origin, origin_detail, action_label, title, summary, draft, item_count, idempotency_key, expires_at)
  values (v_apr, r.owner_team_id, p_agent_id, p_job_public_id, r.entity_id, p_connector_id, p_action_key, v_class,
          case when v_class = 'D' then 'bloqueio' else 'lote' end, case when v_act.money then 'founder' else 'dono' end,
          v_origin, left(coalesce(p_origin_detail, ''), 300), left(v_act.label, 120), left(coalesce(nullif(trim(coalesce(p_title, '')), ''), v_act.label), 160),
          left(coalesce(p_summary, ''), 2000), p_draft, v_items, p_idempotency_key, now() + interval '7 days');
  perform private.dock_log_action(r.owner_team_id, p_agent_id, p_connector_id, p_action_key, v_class, v_act.area_id, v_items, v_origin,
                                  v_data, 'aguardando', 'aprovacao', 'bot', v_apr, p_job_public_id);
  return query select 'aguardando'::text, v_apr, 'aprovacao'::text, v_class;
end;
$$;

-- A aprovação ainda vale? A ação, o cargo, a área e o escritório podem ter mudado desde o pedido.
-- null = vale; texto = por que não vale (aí ela é cancelada e o bot precisa pedir de novo).
create or replace function private.office_approval_problem(p_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.members m where m.team_id = a.owner_team_id and m.active
                     and m.role_level in ('owner', 'admin', 'operator')) then 'dono_sem_cargo'
    when exists (select 1 from public.office o where o.owner_team_id = a.owner_team_id and o.suspended_at is not null) then 'escritorio_suspenso'
    when x.connector_id is null then 'acao_mudou'
    when x.money and a.approver <> 'founder' then 'acao_mudou'
    when (x.action_class = 'D' or x.sends_outside) and a.action_class <> 'D' then 'acao_mudou'
    when a.item_count > x.max_items and a.action_class <> 'D' then 'acao_mudou'
    when x.area_id is not null
         and private.area_rank(private.area_level_of(a.owner_team_id, x.area_id)) < private.area_rank('operar') then 'cargo_nao_alcanca'
    else null end
  from public.office_approvals a
  left join public.dock_connector_actions x on x.connector_id = a.connector_id and x.action_key = a.action_key and x.enabled
  where a.id = p_id;
$$;

-- A pessoa decide. Pode editar o rascunho: o que for aprovado é o que será executado.
-- Só o DONO edita o rascunho. Dinheiro precisa do dono E de um founder (em qualquer ordem).
-- Aprovar cria uma entrega "office_action": o motor executa o rascunho guardado, sem passar pela IA.
create or replace function public.office_decide_approval(
  p_id text, p_approve boolean, p_draft jsonb default null, p_always boolean default false, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.my_team_id();
  a public.office_approvals;
  v_ok boolean := coalesce(p_approve, false);
  v_problem text;
  v_owner_ok timestamptz;
  v_founder_ok timestamptz;
  v_done boolean;
begin
  if v_me is null then raise exception 'office_not_member'; end if;
  select * into a from public.office_approvals x where x.id = p_id for update;
  if a.id is null or not (a.owner_team_id = v_me or (a.approver = 'founder' and private.is_at_least('owner'))) then
    raise exception 'office_approval_not_found';
  end if;
  if a.status <> 'pendente' then raise exception 'office_approval_closed'; end if;
  if a.expires_at <= now() then raise exception 'office_approval_expired'; end if;
  if p_draft is not null and a.owner_team_id <> v_me then raise exception 'office_only_owner_edits' using errcode = '42501'; end if;
  if v_ok and p_draft is not null and (jsonb_typeof(p_draft) <> 'object' or pg_column_size(p_draft) >= 32000) then raise exception 'office_invalid_draft'; end if;

  -- reconfere: se algo mudou desde o pedido, a aprovação é cancelada (o bot pede de novo)
  v_problem := private.office_approval_problem(a.id);
  if v_ok and v_problem is not null then
    update public.office_approvals set status = 'cancelada', decided_by = v_me, decided_at = now(),
      decision_note = 'cancelada: ' || v_problem where id = p_id;
    perform private.dock_log_action(a.owner_team_id, a.agent_id, a.connector_id, a.action_key, a.action_class, null, a.item_count, a.origin,
                                    null, 'negada', v_problem, v_me, a.id, a.job_public_id);
    return;
  end if;

  -- dinheiro: dono E founder; o que faltar fica esperando (editar o rascunho zera a confirmação do founder)
  if v_ok and a.approver = 'founder' then
    v_owner_ok := case when a.owner_team_id = v_me then now() else a.owner_ok_at end;
    v_founder_ok := case when p_draft is not null and p_draft is distinct from a.draft then null else a.founder_ok_at end;
    if private.is_at_least('owner') then v_founder_ok := now(); end if;
    v_done := v_owner_ok is not null and v_founder_ok is not null;
    update public.office_approvals set owner_ok_at = v_owner_ok, founder_ok_at = v_founder_ok,
      draft = coalesce(p_draft, draft), draft_edited = draft_edited or (p_draft is not null and p_draft is distinct from a.draft)
    where id = p_id;
    if not v_done then
      perform private.dock_log_action(a.owner_team_id, a.agent_id, a.connector_id, a.action_key, a.action_class, null, a.item_count, a.origin,
                                      null, 'aguardando', case when v_owner_ok is null then 'falta_dono' else 'falta_founder' end, v_me, a.id, a.job_public_id);
      return;
    end if;
    select * into a from public.office_approvals x where x.id = p_id;
    p_draft := null;
  end if;

  if coalesce(p_always, false) then
    -- nunca para D, nunca a partir de pedido que não veio da própria pessoa, nunca por terceiro
    if not v_ok or a.action_class <> 'C' or a.origin <> 'humano' or a.owner_team_id <> v_me then
      raise exception 'office_grant_only_class_c' using errcode = '42501';
    end if;
    insert into public.office_action_grants (agent_id, connector_id, action_key, owner_team_id, granted_by, expires_at)
    values (a.agent_id, a.connector_id, a.action_key, v_me, v_me, now() + interval '90 days')
    on conflict (agent_id, connector_id, action_key) do update set granted_by = excluded.granted_by, granted_at = now(), expires_at = excluded.expires_at;
  end if;

  update public.office_approvals set status = case when v_ok then 'aprovada' else 'recusada' end,
    draft = case when v_ok and p_draft is not null then p_draft else draft end,
    draft_edited = draft_edited or (v_ok and p_draft is not null and p_draft is distinct from a.draft),
    decided_by = v_me, decided_at = now(), decision_note = left(p_note, 600)
  where id = p_id;
  perform private.dock_log_action(a.owner_team_id, a.agent_id, a.connector_id, a.action_key, a.action_class, null, a.item_count, a.origin,
                                  null, case when v_ok then 'aprovada' else 'recusada' end, case when coalesce(p_always, false) then 'com_sempre_permitir' else '' end,
                                  v_me, a.id, a.job_public_id);
  if v_ok then
    insert into public.ai_jobs (public_id, job_type, agent_id, entity_type, entity_id, payload, idempotency_key, created_by,
                                required_capabilities, correlation_id, causation_id, owner_team_id)
    values (private.ulid('job'), 'office_action', a.agent_id, 'office_thread', a.thread_id, jsonb_build_object('approval_id', a.id),
            'act:' || a.id, v_me, array['office_action'], 'thr:' || coalesce(a.thread_id, ''), a.id, a.owner_team_id)
    on conflict (idempotency_key) do nothing;
  end if;
end;
$$;

-- O motor pega a ação aprovada para executar (servidor). Só uma vez: se o PC cair no meio,
-- a aprovação fica em 'executando' e NÃO roda de novo sozinha; a pessoa confere.
create or replace function public.office_take_approval(p_job_public_id text, p_lease_id uuid, p_approval_id text)
returns table (connector text, action text, args jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  a public.office_approvals;
begin
  r := private.lock_leased(p_job_public_id, p_lease_id);
  if r.job_type <> 'office_action' or r.payload ->> 'approval_id' is distinct from p_approval_id then
    raise exception 'office_job_mismatch' using errcode = '42501';
  end if;
  select * into a from public.office_approvals x where x.id = p_approval_id and x.owner_team_id = r.owner_team_id for update;
  if a.id is null or a.status <> 'aprovada' then raise exception 'office_approval_closed'; end if;
  -- bot pausado: não executa agora (a entrega volta para a fila e roda depois de retomar)
  if exists (select 1 from public.office_agents g where g.id = a.agent_id and g.paused) then raise exception 'office_agent_paused'; end if;
  -- algo mudou desde a aprovação (ação, cargo, área, dono inativo): não executa
  if private.office_approval_problem(a.id) is not null then
    update public.office_approvals set status = 'cancelada', decision_note = left('cancelada: ' || private.office_approval_problem(a.id), 600) where id = a.id;
    return;
  end if;
  -- o catálogo, a instalação ou o escritório podem ter mudado entre o pedido e a aprovação
  if exists (select 1 from public.office o where o.owner_team_id = a.owner_team_id and o.suspended_at is not null)
     or not exists (select 1 from public.dock_connectors c
                    join public.dock_connector_actions x on x.connector_id = c.id and x.action_key = a.action_key and x.enabled
                    join public.office_agent_connectors i on i.connector_id = c.id and i.agent_id = a.agent_id and not i.read_only
                    where c.id = a.connector_id and c.status = 'aprovado') then
    update public.office_approvals set status = 'cancelada' where id = a.id;
    return;
  end if;
  update public.office_approvals set status = 'executando' where id = a.id;
  return query select a.connector_id, a.action_key, a.draft;
end;
$$;

create or replace function public.office_finish_action(p_job_public_id text, p_lease_id uuid, p_approval_id text, p_ok boolean, p_result text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  a public.office_approvals;
begin
  r := private.lock_leased(p_job_public_id, p_lease_id);
  select * into a from public.office_approvals x where x.id = p_approval_id and x.owner_team_id = r.owner_team_id and x.status = 'executando' for update;
  if a.id is null or r.payload ->> 'approval_id' is distinct from p_approval_id then raise exception 'office_approval_closed'; end if;
  update public.office_approvals set status = case when coalesce(p_ok, false) then 'executada' else 'falhou' end,
    executed_at = now(), result_summary = left(p_result, 2000) where id = a.id;
  perform private.dock_log_action(a.owner_team_id, a.agent_id, a.connector_id, a.action_key, a.action_class, null, a.item_count, a.origin,
                                  null, case when coalesce(p_ok, false) then 'executada' else 'falhou' end, '', coalesce(a.decided_by, 'bot'), a.id, p_job_public_id);
end;
$$;

-- Mensagem do bot, com a IA que respondeu (servidor). Só aceita IA que o dono escolheu para este bot ou conversa.
create or replace function public.office_post_agent_message(
  p_job_public_id text, p_lease_id uuid, p_seq int, p_kind text, p_body text, p_report jsonb,
  p_connection_id text, p_model text, p_fallback_from text default null, p_fallback_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  v_provider text;
  v_key text;
  v_id text;
begin
  r := private.lock_leased(p_job_public_id, p_lease_id);
  if r.owner_team_id is null or r.job_type not in ('office_reply', 'office_action') then raise exception 'office_job_mismatch' using errcode = '42501'; end if;
  -- ação aprovada não passa pela IA: a mensagem dela não leva conexão nem modelo
  if r.job_type = 'office_action' then
    p_connection_id := null; p_model := null; p_fallback_from := null; p_fallback_reason := null;
  end if;
  select c.provider into v_provider from public.office_connections c where p_connection_id is not null and c.id = p_connection_id and c.owner_team_id = r.owner_team_id;
  if r.job_type = 'office_reply' and (v_provider is null or not private.office_connection_allowed(r.agent_id, r.entity_id, p_connection_id)) then
    raise exception 'office_connection_not_allowed' using errcode = '42501';
  end if;
  v_key := 'rep:' || p_job_public_id || ':' || coalesce(p_seq, 0);
  select m.id into v_id from public.office_messages m where m.idempotency_key = v_key;
  if v_id is not null then return v_id; end if;
  v_id := private.ulid('msg');
  insert into public.office_messages (id, thread_id, owner_team_id, author_type, author_id, kind, body, report, idempotency_key,
                                      job_public_id, connection_id, provider, model, fallback_from, fallback_reason)
  values (v_id, r.entity_id, r.owner_team_id, 'agent', r.agent_id, coalesce(p_kind, 'texto'), p_body, p_report, v_key,
          p_job_public_id, p_connection_id, v_provider, left(p_model, 120), left(p_fallback_from, 120), left(p_fallback_reason, 200));
  return v_id;
end;
$$;

-- O motor avisa que há (ou não há mais) confirmação pendente no PC para um bot (servidor). Só o tipo.
create or replace function public.office_set_pc_pending(p_worker_id text, p_agent text, p_gate text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.office_agents a set pc_pending = p_gate
  where a.id = p_agent and a.owner_team_id = (select w.owner_team_id from public.workers w where w.id = p_worker_id and w.enabled);
  if not found then raise exception 'office_agent_not_found'; end if;
end;
$$;

-- ---------- 18. rotinas ----------
-- Próxima execução depois de p_after, no relógio do fuso da rotina.
create or replace function private.office_next_run(p_kind text, p_time time, p_weekday int, p_monthday int, p_tz text, p_after timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_after at time zone p_tz;
  v_try timestamp;
  i int;
begin
  for i in 0..62 loop
    v_try := (v_local::date + i) + p_time;
    if v_try > v_local and (p_kind = 'diaria'
        or (p_kind = 'semanal' and extract(dow from v_try)::int = p_weekday)
        or (p_kind = 'mensal' and extract(day from v_try)::int = p_monthday)) then
      return v_try at time zone p_tz;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.office_save_routine(
  p_id text, p_agent text, p_title text, p_prompt text, p_kind text, p_time time,
  p_weekday int default null, p_monthday int default null, p_tz text default 'America/Sao_Paulo'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_id text := p_id;
  v_next timestamptz;
begin
  if not exists (select 1 from public.office_agents a where a.id = p_agent and a.owner_team_id = v_me) then raise exception 'office_agent_not_found'; end if;
  if p_kind is null or p_kind not in ('diaria', 'semanal', 'mensal') or p_time is null
     or (p_kind = 'semanal' and (p_weekday is null or p_weekday not between 0 and 6))
     or (p_kind = 'mensal' and (p_monthday is null or p_monthday not between 1 and 28)) then
    raise exception 'office_invalid_schedule';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then raise exception 'office_invalid_timezone'; end if;
  v_next := private.office_next_run(p_kind, p_time, p_weekday, p_monthday, p_tz, now());
  if v_id is null then
    if (select count(*) from public.office_routines x where x.owner_team_id = v_me) >= private.office_limit('rotinas') then raise exception 'office_limit_routines'; end if;
    v_id := private.ulid('rtn');
    insert into public.office_routines (id, owner_team_id, agent_id, title, prompt, kind, time_local, weekday, monthday, tz, next_run_at)
    values (v_id, v_me, p_agent, trim(p_title), p_prompt, p_kind, p_time, p_weekday, p_monthday, p_tz, v_next);
    return v_id;
  end if;
  update public.office_routines set agent_id = p_agent, title = trim(p_title), prompt = p_prompt, kind = p_kind, time_local = p_time,
    weekday = p_weekday, monthday = p_monthday, tz = p_tz, next_run_at = v_next
  where id = v_id and owner_team_id = v_me;
  if not found then raise exception 'office_routine_not_found'; end if;
  return v_id;
end;
$$;

create or replace function public.office_set_routine_enabled(p_id text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  update public.office_routines set enabled = coalesce(p_enabled, false),
    next_run_at = case when coalesce(p_enabled, false) then private.office_next_run(kind, time_local, weekday, monthday, tz, now()) end
  where id = p_id and owner_team_id = v_me;
  if not found then raise exception 'office_routine_not_found'; end if;
end;
$$;

-- O agendador do servidor chama a cada minuto (servidor). Cada rotina vencida vira uma mensagem "system"
-- e uma entrega marcada origin = rotina: nessa entrega, ação C nunca segue sozinha, mesmo com "sempre permitir".
create or replace function public.office_run_due_routines()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  rt public.office_routines;
  v_thread text;
  v_msg text;
  v_key text;
  v_n int := 0;
begin
  for rt in select * from public.office_routines x where x.enabled and x.next_run_at <= now()
            order by x.next_run_at limit 50 for update skip locked
  loop
    v_thread := rt.thread_id;
    v_key := 'rtn:' || rt.id || ':' || to_char(rt.next_run_at at time zone 'UTC', 'YYYYMMDDHH24MI');
    if exists (select 1 from public.office o where o.owner_team_id = rt.owner_team_id and o.consent_at is not null and o.suspended_at is null)
       and exists (select 1 from public.members m where m.team_id = rt.owner_team_id and m.active)
       and not exists (select 1 from public.office_messages m where m.idempotency_key = v_key) then
      if v_thread is null then
        v_thread := private.ulid('thr');
        insert into public.office_threads (id, owner_team_id, kind, title, agent_ids, lead_agent_id)
        values (v_thread, rt.owner_team_id, 'direta', left('Rotina: ' || rt.title, 120), array[rt.agent_id], rt.agent_id);
      end if;
      v_msg := private.ulid('msg');
      insert into public.office_messages (id, thread_id, owner_team_id, author_type, author_id, kind, body, idempotency_key)
      values (v_msg, v_thread, rt.owner_team_id, 'system', rt.id, 'texto', rt.prompt, v_key);
      insert into public.ai_jobs (public_id, job_type, agent_id, entity_type, entity_id, payload, idempotency_key, created_by,
                                  required_capabilities, correlation_id, causation_id, owner_team_id)
      values (private.ulid('job'), 'office_reply', rt.agent_id, 'office_thread', v_thread,
              jsonb_build_object('message_id', v_msg, 'thread_id', v_thread, 'origin', 'rotina', 'routine_id', rt.id),
              'dlv:' || v_msg || ':' || rt.agent_id, rt.owner_team_id, array['office_reply'], 'thr:' || v_thread, v_msg, rt.owner_team_id)
      on conflict (idempotency_key) do nothing;
      v_n := v_n + 1;
    end if;
    update public.office_routines set thread_id = v_thread, last_run_at = now(),
      next_run_at = private.office_next_run(rt.kind, rt.time_local, rt.weekday, rt.monthday, rt.tz, now())
    where id = rt.id;
  end loop;
  return v_n;
end;
$$;

-- ---------- 19. quem pode chamar o quê ----------
do $$
declare f text;
begin
  -- pessoa logada (o navegador): tudo o que ela escreve passa por estas
  foreach f in array array[
    'public.office_set_agent_access(text,int)',
    'public.office_set_agent_avatar(text,text,text,text)',
    'public.office_create_agent_from_kit(text,text)',
    'public.office_save_connection(text,text,text,text,text,text,text)',
    'public.office_upsert_connection(text,text,text,text)',
    'public.office_set_thread_model(text,text,text,text)',
    'public.office_continue_with(text,text,text)',
    'public.dock_save_skill(text,text,text,text,text,text,text,text,jsonb,jsonb,int,text[],boolean,boolean)',
    'public.office_send_skill_signal(text,text)',
    'public.dock_propose_skill(text,text,text,text,text,text,text,text,text,jsonb,jsonb,int,text[],boolean,text[])',
    'public.dock_decide_skill_proposal(text,boolean,text)',
    'public.office_install_skill(text,text,int)',
    'public.office_uninstall_skill(text,text)',
    'public.office_ack_skill_update(text,text,text)',
    'public.dock_save_kit_bot(text,text,text,text,text,text,int,text[],text[],text,text,text[],boolean)',
    'public.dock_save_connector(text,text,text,text,text,text,int,int,text,text,text,text,text,date,text)',
    'public.dock_save_connector_action(text,text,text,text,text,int,boolean,boolean,text,boolean)',
    'public.dock_approve_connector(text,text)',
    'public.dock_suspend_connector(text)',
    'public.dock_request_connector(text,text,text)',
    'public.dock_decide_connector_request(text,boolean,text,text)',
    'public.dock_set_provider_policy(text,text,text,text,date)',
    'public.dock_set_office_suspended(text,boolean)',
    'public.office_install_connector(text,text,boolean)',
    'public.office_uninstall_connector(text,text)',
    'public.office_set_action_grant(text,text,text,boolean)',
    'public.office_decide_approval(text,boolean,jsonb,boolean,text)',
    'public.office_save_routine(text,text,text,text,text,time,int,int,text)',
    'public.office_set_routine_enabled(text,boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- só o servidor (rotas /api/workers e o agendador): o navegador e o bot não alcançam
  foreach f in array array[
    'public.office_request_action(text,text,uuid,text,text,text,text,int,boolean,text,text,text,jsonb,text)',
    'public.office_take_approval(text,uuid,text)',
    'public.office_finish_action(text,uuid,text,boolean,text)',
    'public.office_post_agent_message(text,uuid,int,text,text,jsonb,text,text,text,text)',
    'public.office_add_skill_learning(text,uuid,text,int,text,text,text)',
    'public.office_set_pc_pending(text,text,text)',
    'public.office_run_due_routines()'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- regras internas: usadas pelas políticas (authenticated) ou só por dentro das funções
  foreach f in array array['private.dock_is_area_lead(text)', 'private.office_limit(text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'private.area_level_of(text,text)', 'private.office_data_class(text,text,text)', 'private.office_connection_allowed(text,text,text)',
    'private.office_approval_problem(text)', 'private.dock_guard_area_owner()',
    'private.office_skill_version_for(text,text)', 'private.office_next_run(text,time,int,int,text,timestamptz)',
    'private.dock_add_skill_version(text,int,text,text,text,jsonb,jsonb,int,text[],boolean,text,text,text)',
    'private.dock_log_action(text,text,text,text,text,text,int,text,text,text,text,text,text,text)',
    'private.dock_forbid_change()', 'private.office_grant_guard()'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
