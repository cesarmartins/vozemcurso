-- Banco de produção do Afinador Vocal (Supabase / PostgreSQL).
-- Rode no SQL Editor do Supabase. Espelha o que hoje fica no navegador (src/contas/local.ts,
-- src/exercicios/biblioteca.ts e src/exercicios/resultados.ts).
--
-- Regra principal (multi-professor):
--   * cada professor vê e edita só a própria turma e a própria biblioteca;
--   * o aluno de turma vê só os exercícios do professor dele e as próprias práticas;
--   * o aluno independente vê e edita só o que é dele.
-- Quem garante isso é o próprio banco (Row Level Security), não o site.

-- ---------- Contas ----------
-- O login (e-mail e senha) fica em auth.users, do Supabase. Aqui ficam os dados do perfil.
create table public.contas (
  id            uuid primary key references auth.users (id) on delete cascade,
  tipo          text not null check (tipo in ('professor', 'aluno')),
  nome          text not null check (length(trim(nome)) > 0),
  email         text not null unique,
  professor_id  uuid references public.contas (id) on delete set null,
  codigo_turma  text unique,
  voz           text not null default '',
  objetivo      text not null default '',
  -- Assinatura: 'professor', 'aluno' (independente) ou null (aluno de turma, incluído no plano do professor).
  plano         text check (plano in ('professor', 'aluno', 'escola')),
  plano_ativo_ate timestamptz,
  criado_em     timestamptz not null default now(),
  check (tipo = 'aluno' or professor_id is null),
  check (tipo = 'professor' or codigo_turma is null)
);
create index on public.contas (professor_id);

-- Alunos que o professor cadastrou e que ainda não criaram a conta (ou não aceitaram).
create table public.convites (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid not null references public.contas (id) on delete cascade,
  nome          text not null,
  email         text not null,
  criado_em     timestamptz not null default now(),
  unique (professor_id, email)
);
create index on public.convites (email);

-- ---------- Exercícios ----------
-- O áudio fica no Storage (bucket "exercicios", caminho <dono_id>/<id>.<ext>); aqui só o caminho.
create table public.exercicios (
  id            uuid primary key default gen_random_uuid(),
  dono_id       uuid not null references public.contas (id) on delete cascade,
  nome          text not null,
  categoria     text not null check (categoria in ('aquecimento','vibracao','respiracao','aparelhos','pre-show','pos-show','outros')),
  equipamento   text not null default '',
  audio_path    text not null,
  arquivo_nome  text not null,
  criado_em     timestamptz not null default now()
);
create index on public.exercicios (dono_id);

-- ---------- Práticas ----------
create table public.resultados (
  id            bigint generated always as identity primary key,
  aluno_id      uuid not null references public.contas (id) on delete cascade,
  exercicio_id  uuid not null references public.exercicios (id) on delete cascade,
  acertos       int not null check (acertos >= 0),
  avaliadas     int not null check (avaliadas > 0 and acertos <= avaliadas),
  desvio_medio  real not null,
  criado_em     timestamptz not null default now()
);
create index on public.resultados (exercicio_id, aluno_id);

-- ---------- Ficha do aluno e agenda ----------
-- O aluno é identificado pelo e-mail: vale para quem já tem conta e para quem só foi convidado.
create table public.fichas (
  professor_id  uuid not null references public.contas (id) on delete cascade,
  aluno_email   text not null,
  telefone      text not null default '',
  observacoes   text not null default '',
  primary key (professor_id, aluno_email)
);

-- Aulas semanais fixas. dia: 0 = domingo … 6 = sábado.
create table public.aulas (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid not null references public.contas (id) on delete cascade,
  aluno_email   text not null,
  dia           smallint not null check (dia between 0 and 6),
  inicio        time not null,
  duracao       smallint not null check (duracao between 15 and 240),
  modalidade    text not null default 'presencial' check (modalidade in ('presencial', 'online')),
  local         text not null default '',
  criado_em     timestamptz not null default now(),
  -- Termina até meia-noite (somar a uma hora "dá a volta" no relógio, por isso conta em minutos).
  check (extract(epoch from inicio) / 60 + duracao <= 1440)
);
create index on public.aulas (professor_id, dia);
create index on public.aulas (aluno_email);

-- O professor não pode ter duas aulas no mesmo horário.
create extension if not exists btree_gist;
alter table public.aulas add constraint aulas_sem_conflito exclude using gist (
  professor_id with =,
  dia with =,
  tsrange(timestamp '2000-01-01' + inicio, timestamp '2000-01-01' + inicio + make_interval(mins => duracao)) with &&
);

-- ---------- Funções auxiliares (rodam como dono do banco, sem recursão nas políticas) ----------
create function public.meu_professor() returns uuid language sql stable security definer set search_path = public as
  $$ select professor_id from contas where id = auth.uid() $$;

create function public.sou_professor_de(aluno uuid) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from contas where id = aluno and professor_id = auth.uid()) $$;

-- Entrar numa turma pelo código (o aluno não consegue ler a tabela de professores direto).
create function public.entrar_na_turma(codigo text) returns void language plpgsql security definer set search_path = public as $$
declare prof uuid;
begin
  select id into prof from contas where tipo = 'professor' and codigo_turma = upper(regexp_replace(codigo, '[^A-Za-z0-9]', '', 'g'));
  if prof is null then raise exception 'Código da turma não encontrado'; end if;
  update contas set professor_id = prof where id = auth.uid() and tipo = 'aluno';
  delete from convites where email = (select email from contas where id = auth.uid());
end $$;

-- Aceitar convite feito pelo e-mail do aluno.
create function public.aceitar_convite(convite uuid) returns void language plpgsql security definer set search_path = public as $$
declare prof uuid;
begin
  select c.professor_id into prof from convites c join contas a on a.email = c.email
   where c.id = convite and a.id = auth.uid() and a.tipo = 'aluno';
  if prof is null then raise exception 'Esse convite não existe mais'; end if;
  update contas set professor_id = prof where id = auth.uid();
  delete from convites where email = (select email from contas where id = auth.uid());
end $$;

-- O professor tira um aluno da turma (a conta do aluno continua existindo, sem professor).
create function public.remover_da_turma(aluno uuid) returns void language sql security definer set search_path = public as
  $$ update contas set professor_id = null where id = aluno and professor_id = auth.uid() $$;

-- O aluno sai da turma por conta própria.
create function public.sair_da_turma() returns void language sql security definer set search_path = public as
  $$ update contas set professor_id = null where id = auth.uid() and tipo = 'aluno' $$;

-- Quando o aluno sai da turma (ou é removido), some a ficha e os horários com aquele professor.
create function public.esquecer_aluno() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.professor_id is not null and new.professor_id is distinct from old.professor_id then
    delete from fichas where professor_id = old.professor_id and aluno_email = old.email;
    delete from aulas  where professor_id = old.professor_id and aluno_email = old.email;
  end if;
  return new;
end $$;
create trigger contas_esquecer_aluno after update of professor_id on public.contas
  for each row execute function public.esquecer_aluno();

-- ---------- Segurança por linha ----------
alter table public.fichas     enable row level security;
alter table public.aulas      enable row level security;
alter table public.contas     enable row level security;
alter table public.convites   enable row level security;
alter table public.exercicios enable row level security;
alter table public.resultados enable row level security;

-- Contas: cada um vê a própria; o professor vê os alunos dele; o aluno vê o professor dele.
create policy contas_ler on public.contas for select using (
  id = auth.uid() or professor_id = auth.uid() or id = public.meu_professor()
);
create policy contas_criar on public.contas for insert with check (id = auth.uid());
-- Editar o próprio perfil. Trocar de turma só pelas funções acima; plano só pelo pagamento (servidor).
create policy contas_editar on public.contas for update using (id = auth.uid())
  with check (id = auth.uid() and professor_id is not distinct from public.meu_professor());

-- Convites: o professor gerencia os dele; o aluno vê os enviados para o e-mail dele.
create policy convites_professor on public.convites for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
create policy convites_aluno on public.convites for select using (email = (select email from public.contas where id = auth.uid()));

-- Exercícios: o dono faz tudo; o aluno da turma só lê os do professor.
create policy exercicios_dono on public.exercicios for all using (dono_id = auth.uid()) with check (dono_id = auth.uid());
create policy exercicios_turma on public.exercicios for select using (dono_id = public.meu_professor());

-- Práticas: o aluno grava e lê as dele; o professor lê as dos alunos da turma.
create policy resultados_aluno on public.resultados for all using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());
create policy resultados_professor on public.resultados for select using (public.sou_professor_de(aluno_id));

-- Ficha: só o professor (as anotações são privadas dele).
create policy fichas_professor on public.fichas for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());

-- Aulas: o professor gerencia as dele; o aluno lê as próprias com o professor atual.
create policy aulas_professor on public.aulas for all using (professor_id = auth.uid()) with check (professor_id = auth.uid());
create policy aulas_aluno on public.aulas for select using (
  professor_id = public.meu_professor() and aluno_email = (select email from public.contas where id = auth.uid())
);

-- ---------- Storage (áudios) ----------
-- Crie o bucket privado "exercicios" no painel do Supabase e depois rode:
create policy audio_dono on storage.objects for all
  using (bucket_id = 'exercicios' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'exercicios' and (storage.foldername(name))[1] = auth.uid()::text);
create policy audio_turma on storage.objects for select
  using (bucket_id = 'exercicios' and (storage.foldername(name))[1] = public.meu_professor()::text);
