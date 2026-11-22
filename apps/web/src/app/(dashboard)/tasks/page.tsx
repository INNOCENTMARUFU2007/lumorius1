'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, ClipboardList, FolderKanban, ListChecks, Plus, Search, Timer, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/primitives';

const STATUS = { todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Completed', cancelled: 'Cancelled' } as const;
const PRIORITY = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' } as const;
const PRIORITY_STYLE = {
  urgent: 'bg-red-500/15 text-red-600 dark:text-red-300',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  low: 'bg-muted text-muted-foreground',
};
type Status = keyof typeof STATUS;
type Priority = keyof typeof PRIORITY;
type Filter = Status | 'all' | 'overdue';
type WorkRoute = { view: 'tasks' | 'projects'; filter: Filter; projectId: string; taskId?: string };
type Team = { id: string; name: string };
type Project = {
  id: string; name: string; description: string | null; status: string;
  start_date: string | null; end_date: string | null; team_id: string | null;
  team_name?: string | null; owner_name?: string | null;
  task_count: string | number; completed_task_count: string | number;
};
type Task = {
  id: string; title: string; description: string | null; status: Status; priority: Priority;
  due_date: string | null; assignee_name: string | null; project_name: string | null; tags?: string[];
};
type TaskPage = {
  data: Task[]; total: number; totalPages: number;
  summary: { total: number; inProgress: number; completed: number; overdue: number };
};
type ApiEnvelope<T> = { data: T };
const field = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:opacity-50';
const primary = cn(button, 'bg-brand-500 text-white hover:bg-brand-600');
const secondary = cn(button, 'border border-border bg-card text-foreground hover:bg-muted');
const panel = 'min-w-0 rounded-2xl border border-border bg-card shadow-sm';
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

function apiError(error: unknown, fallback: string) {
  if (!isAxiosError<{ message?: string | string[] }>(error)) return fallback;
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function Modal({ title, pending, close, children }: {
  title: string; pending: boolean; close: () => void; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  return (
    <dialog ref={dialog} aria-label={title}
      onCancel={(event) => { event.preventDefault(); if (!pending) close(); }}
      className="m-auto max-h-[90dvh] w-11/12 max-w-xl overflow-auto rounded-2xl border border-border bg-card text-foreground shadow-2xl backdrop:bg-slate-950/75"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Close form" onClick={close} disabled={pending} className={secondary}><X className="h-4 w-4" /></button>
      </div>
      {children}
    </dialog>
  );
}

function FormActions({ close, pending, error, label }: { close: () => void; pending: boolean; error: string; label: string }) {
  return <>
    {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <button type="button" className={secondary} onClick={close} disabled={pending}>Cancel</button>
      <button type="submit" className={primary} disabled={pending}>{pending ? 'Saving…' : label}</button>
    </div>
  </>;
}

function ProjectForm({ project, accountKey, close, saved }: {
  project?: Project; accountKey: string; close: () => void; saved: () => void;
}) {
  const [startDate, setStartDate] = useState(project?.start_date ?? '');
  const [team, setTeam] = useState(project?.team_id ?? '');
  const [error, setError] = useState('');
  const teams = useQuery({
    queryKey: ['project-team-options', accountKey],
    queryFn: async ({ signal }) => (await api.get<ApiEnvelope<Team[]>>('/projects/teams', { signal })).data.data,
    staleTime: 60_000,
  });
  const submit = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get('name') ?? '').trim();
      const description = String(form.get('description') ?? '').trim() || null;
      const teamId = form.has('team') ? String(form.get('team')) || null : project?.team_id ?? null;
      const start = String(form.get('start') ?? '') || null;
      const end = String(form.get('end') ?? '') || null;
      if (!name) throw new Error('Enter a project name.');
      if (start && end && end < start) throw new Error('The target date must be on or after the start date.');
      const details = { name, description, teamId, startDate: start, endDate: end };
      if (project) return api.patch('/projects/' + project.id, details);
      return api.post('/projects', {
        name, description: description ?? undefined, teamId: teamId ?? undefined,
        startDate: start ?? undefined, endDate: end ?? undefined,
      });
    },
    onSuccess: () => {
      toast.success(project ? 'Project updated' : 'Project created');
      saved();
    },
    onError: (e) => setError(apiError(e, e instanceof Error && !isAxiosError(e) ? e.message : 'Could not save the project.')),
  });

  return (
    <Modal title={project ? 'Edit project' : 'New project'} pending={submit.isPending} close={close}>
      <form className="space-y-4 p-5" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!submit.isPending) { setError(''); submit.mutate(new FormData(event.currentTarget)); }
      }}>
        <Field label="Project name"><input name="name" required autoFocus maxLength={255} defaultValue={project?.name} className={field} /></Field>
        <Field label="Description"><textarea name="description" rows={4} defaultValue={project?.description ?? ''} className={field} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date"><input name="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} /></Field>
          <Field label="Target date"><input name="end" type="date" min={startDate || undefined} defaultValue={project?.end_date ?? ''} className={field} /></Field>
        </div>
        <Field label="Team">
          <select name="team" className={field} value={team} onChange={(event) => setTeam(event.target.value)} disabled={!teams.isSuccess}>
            <option value="">Organization-wide</option>
            {project?.team_id && !teams.data?.some(({ id }) => id === project.team_id) && <option value={project.team_id}>{project.team_name ?? 'Current team'}</option>}
            {teams.data?.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </Field>
        {teams.isLoading && <p className="text-xs text-muted-foreground">Loading teams…</p>}
        {teams.isError && <p className="text-xs text-muted-foreground">Team options could not be loaded. <button type="button" className="underline" onClick={() => void teams.refetch()}>Retry</button></p>}
        <FormActions close={close} pending={submit.isPending} error={error} label={project ? 'Save changes' : 'Create project'} />
      </form>
    </Modal>
  );
}

type Member = { id: string; name?: string | null; email?: string | null; role?: string | null };

function TaskForm({ projects, projectId, close, saved }: { projects: Project[]; projectId: string; close: () => void; saved: () => void }) {
  const [error, setError] = useState('');
  const { user } = useAuth();
  // Active members of this workspace, for the assignee picker.
  const members = useQuery<Member[]>({
    queryKey: ['organizations', 'members', 'assignable'],
    staleTime: 60_000,
    queryFn: async () => {
      const body = (await api.get('/organizations/members')).data as { data?: unknown };
      const raw = (body?.data ?? body) as unknown;
      const list = Array.isArray(raw) ? raw : Array.isArray((raw as { members?: unknown[] })?.members) ? (raw as { members: unknown[] }).members : [];
      return list as Member[];
    },
  });
  const submit = useMutation({
    mutationFn: (form: FormData) => {
      const title = String(form.get('title') ?? '').trim();
      const dueDate = String(form.get('due') ?? '');
      if (!title) throw new Error('Enter a task title.');
      return api.post('/tasks', {
        title,
        description: String(form.get('description') ?? '').trim() || undefined,
        projectId: String(form.get('project') ?? '') || undefined,
        priority: form.get('priority'),
        assigneeId: String(form.get('assignee') ?? '') || undefined,
        dueDate: dueDate ? new Date(dueDate + 'T23:59:59').toISOString() : undefined,
        tags: [...new Set(String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean))],
      });
    },
    onSuccess: () => { toast.success('Task created'); saved(); },
    onError: (e) => setError(apiError(e, e instanceof Error && !isAxiosError(e) ? e.message : 'Could not create the task.')),
  });
  return (
    <Modal title="New task" pending={submit.isPending} close={close}>
      <form className="space-y-4 p-5" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!submit.isPending) { setError(''); submit.mutate(new FormData(event.currentTarget)); }
      }}>
        <Field label="Task title"><input name="title" required autoFocus maxLength={500} className={field} /></Field>
        <Field label="Description"><textarea name="description" rows={3} className={field} /></Field>
        <Field label="Project"><select name="project" defaultValue={projectId} className={field}>
          <option value="">No project</option>
          {projectId && !projects.some(({ id }) => id === projectId) && <option value={projectId}>Selected project</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></Field>
        <Field label="Assign to">
          <select name="assignee" defaultValue="" className={field} disabled={members.isPending}>
            <option value="">{members.isPending ? 'Loading members…' : 'Unassigned'}</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>{(m.name || m.email || 'Member') + (m.id === user?.id ? ' (me)' : '')}</option>
            ))}
          </select>
          {members.isError && <span className="mt-1 block text-xs text-destructive">Could not load members. You can still create the task unassigned.</span>}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority"><select name="priority" defaultValue="medium" className={field}>
            {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></Field>
          <Field label="Due date"><input name="due" type="date" className={field} /></Field>
        </div>
        <Field label="Tags (comma separated)"><input name="tags" className={field} /></Field>
        <FormActions close={close} pending={submit.isPending} error={error} label="Create task" />
      </form>
    </Modal>
  );
}

function ProjectCard({ project, openTasks, addTask, edit }: {
  project: Project; openTasks: () => void; addTask: () => void; edit?: () => void;
}) {
  const total = Number(project.task_count);
  const completed = Number(project.completed_task_count);
  const valid = Number.isFinite(total) && Number.isFinite(completed);
  const progress = valid && total > 0 ? Math.round(100 * completed / total) : null;
  const start = project.start_date ? dateFormatter.format(new Date(project.start_date)) : null;
  const end = project.end_date ? dateFormatter.format(new Date(project.end_date)) : null;
  const timeline = start && end ? start + ' – ' + end : start ? 'Starts ' + start : end ? 'Due ' + end : 'No dates set';
  return (
    <article className={cn(panel, 'flex flex-col p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300"><FolderKanban className="h-5 w-5" /></div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">{project.status.replace(/_/g, ' ')}</span>
      </div>
      <h3 className="mt-3 break-words text-lg font-semibold">{project.name}</h3>
      {project.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{project.description}</p>}
      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" />{timeline}</p>
        <p className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0" />{project.team_name || (project.team_id ? 'Assigned team' : 'Organization-wide')}</p>
        {project.owner_name && <p><span className="font-medium text-foreground">Owner </span>{project.owner_name}</p>}
      </div>
      <div className="mt-auto pt-5">
        <div className="flex justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{valid ? completed + ' of ' + total + ' tasks complete' : 'Task counts unavailable'}</span>
          {progress !== null && <span className="font-semibold tabular-nums">{progress}%</span>}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {progress !== null && <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400" style={{ width: progress + '%' }} />}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <button type="button" className={secondary} onClick={openTasks}>View tasks <ArrowRight className="h-4 w-4" /></button>
        <button type="button" className={cn(button, 'text-brand-600 hover:bg-brand-500/10 dark:text-brand-300')} onClick={addTask}>Add task</button>
        {edit && <button type="button" className={cn(button, 'ml-auto text-muted-foreground hover:bg-muted')} onClick={edit}>Edit</button>}
      </div>
    </article>
  );
}


function readWorkRoute(): WorkRoute {
  const query = new URLSearchParams(window.location.search);
  const view = query.get('view') === 'projects' ? 'projects' : 'tasks';
  const status = query.get('status') ?? '';
  const filter = status === 'overdue' || Object.hasOwn(STATUS, status) ? status as Filter : 'all';
  const project = query.get('project') ?? '';
  const projectId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(project) ? project : '';
  const task = query.get('task') ?? '';
  const taskId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(task) ? task : undefined;
  return { view, filter, projectId, taskId };
}

export default function TasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const role = user?.role.toLowerCase() ?? '';
  const canWork = !!user?.organizationId && ['owner', 'admin', 'manager', 'member'].includes(role);
  const canManage = canWork && ['owner', 'admin', 'manager'].includes(role);
  const accountKey = [user?.organizationId, user?.id].join('/');
  const [route, setRoute] = useState<WorkRoute | null>(null);
  const { view, filter, projectId } = route ?? { view: 'tasks', filter: 'all', projectId: '' } as const;
  const [search, setSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [taskForm, setTaskForm] = useState<{ projectId: string } | null>(null);
  const [projectForm, setProjectForm] = useState<{ project?: Project } | null>(null);

  useEffect(() => {
    const syncRoute = () => { setRoute(readWorkRoute()); setPage(1); };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setTaskSearch(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  function go(next: 'tasks' | 'projects', status: Filter = 'all', project = '') {
    const params = new URLSearchParams();
    if (next === 'projects') params.set('view', 'projects');
    if (status !== 'all') params.set('status', status);
    if (project) params.set('project', project);
    setRoute({ view: next, filter: status, projectId: project });
    setPage(1);
    router.replace(params.size ? '/tasks?' + params.toString() : '/tasks', { scroll: false });
  }

  const sourceTask = useQuery({
    queryKey: ['tasks', 'source', accountKey, route?.taskId],
    enabled: canWork && Boolean(route?.taskId),
    queryFn: async ({ signal }) => (await api.get<ApiEnvelope<Task>>('/tasks/' + route?.taskId, { signal })).data.data,
  });

  const taskQuery = useQuery({
    queryKey: ['tasks', 'workspace', accountKey, filter, projectId, taskSearch, priority, mine, page],
    enabled: canWork && route !== null && view === 'tasks',
    queryFn: async ({ signal }) => (await api.get<ApiEnvelope<TaskPage>>('/tasks', {
      signal,
      params: {
        page, pageSize: 12, projectId: projectId || undefined, search: taskSearch || undefined,
        priority: priority || undefined, assigneeId: mine ? user?.id : undefined,
        status: filter === 'all' || filter === 'overdue' ? undefined : filter,
        overdue: filter === 'overdue' ? true : undefined,
      },
    })).data.data,
  });
  const projectsQuery = useQuery({
    queryKey: ['projects', accountKey],
    enabled: canWork,
    queryFn: async ({ signal }) => (await api.get<ApiEnvelope<Project[]>>('/projects', { signal })).data.data,
  });

  function refreshWorkspace() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['founder-os', 'dashboard'] }),
    ]);
  }

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => api.patch('/tasks/' + id, { status }),
    onSuccess: refreshWorkspace,
    onError: (error) => toast.error(apiError(error, 'Could not update task status.')),
  });

  const projects = projectsQuery.data ?? [];
  const projectTerm = projectSearch.trim().toLowerCase();
  const matchingProjects = projects.filter((project) =>
    [project.name, project.description, project.team_name, project.owner_name].some((value) => value?.toLowerCase().includes(projectTerm)),
  );
  const selected = projects.find((project) => project.id === projectId);
  const data = taskQuery.data;
  const stats: { label: string; value?: number; icon: typeof ClipboardList; filter: Filter; color: string }[] = [
    { label: 'All tasks', value: data?.summary?.total, icon: ClipboardList, filter: 'all', color: 'text-sky-600 dark:text-sky-300' },
    { label: 'In progress', value: data?.summary?.inProgress, icon: Timer, filter: 'in_progress', color: 'text-violet-600 dark:text-violet-300' },
    { label: 'Completed', value: data?.summary?.completed, icon: CheckCircle2, filter: 'done', color: 'text-emerald-600 dark:text-emerald-300' },
    { label: 'Overdue', value: data?.summary?.overdue, icon: CircleAlert, filter: 'overdue', color: 'text-rose-600 dark:text-rose-300' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <PageHeader
        hero
        icon={ListChecks}
        title="Tasks & Projects"
        description="Plan projects, track deadlines, and move work through each stage."
        actions={canWork ? <>
          <button type="button" onClick={() => setTaskForm({ projectId })} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3.5 text-sm font-medium transition hover:bg-muted"><Plus className="h-4 w-4" /> New task</button>
          {canManage && <button type="button" onClick={() => setProjectForm({})} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-glow-primary transition hover:bg-primary/90"><FolderKanban className="h-4 w-4" /> New project</button>}
        </> : undefined}
      />

      {route?.taskId && canWork && <section className={cn(panel, 'p-5')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Linked task</p>
            {sourceTask.data && <><h2 className="mt-1 break-words font-semibold">{sourceTask.data.title}</h2><p className="mt-1 text-sm capitalize text-muted-foreground">{sourceTask.data.status.replaceAll('_', ' ')}</p>{sourceTask.data.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{sourceTask.data.description}</p>}</>}
            {sourceTask.isPending && <p role="status" className="text-sm text-muted-foreground">Loading task…</p>}
            {sourceTask.isError && <p role="alert" className="text-sm text-destructive">The linked task could not be opened.</p>}
          </div>
          <button className={button} onClick={() => go('tasks')}>Close</button>
        </div>
      </section>}

      {!route ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading tasks and projects…</p> :
        !canWork ? <p className={cn(panel, 'p-6 text-sm text-muted-foreground')}>Tasks and projects require workspace member access.</p> : <>
        <nav aria-label="Work views" className="flex flex-wrap gap-2 border-b border-border pb-3">
          {(['tasks', 'projects'] as const).map((tab) => (
            <button key={tab} type="button" aria-current={view === tab ? 'page' : undefined} onClick={() => go(tab)}
              className={cn(button, view === tab ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300' : 'text-muted-foreground hover:bg-muted')}>
              {tab === 'tasks' ? <ListChecks className="h-4 w-4" /> : <FolderKanban className="h-4 w-4" />}
              {tab === 'tasks' ? 'Tasks' : 'Projects'}
              {tab === 'projects' && projectsQuery.isSuccess && <span className="text-xs tabular-nums opacity-80">{projects.length}</span>}
            </button>
          ))}
        </nav>

        {view === 'projects' ? <>
          <section className={cn(panel, 'flex flex-wrap items-center justify-between gap-3 p-4')} aria-label="Browse projects">
            <div><h2 className="font-semibold">Projects</h2><p className="text-xs text-muted-foreground">{projectsQuery.isSuccess ? matchingProjects.length + ' of ' + projects.length + ' projects' : 'Project portfolio'}</p></div>
            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input aria-label="Search projects" placeholder="Search projects…" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} className={cn(field, 'pl-9')} />
            </label>
          </section>
          {projectsQuery.isLoading ? <p role="status" className={cn(panel, 'p-6 text-sm')}>Loading projects…</p> :
            projectsQuery.isError ? <div role="alert" className={cn(panel, 'flex flex-wrap items-center justify-between gap-3 p-5 text-sm')}>Projects could not be loaded.<button type="button" className={secondary} onClick={() => void projectsQuery.refetch()}>Retry</button></div> :
            matchingProjects.length ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {matchingProjects.map((project) => <ProjectCard key={project.id} project={project}
                openTasks={() => { setSearch(''); setTaskSearch(''); setPriority(''); setMine(false); go('tasks', 'all', project.id); }}
                addTask={() => setTaskForm({ projectId: project.id })}
                edit={canManage ? () => setProjectForm({ project }) : undefined} />)}
            </div> : <div className={cn(panel, 'space-y-3 p-8 text-center')}>
              <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{projectTerm ? 'No projects match your search.' : 'No projects yet.'}</p>
              {!projectTerm && canManage && <button type="button" className={primary} onClick={() => setProjectForm({})}><Plus className="h-4 w-4" /> Create a project</button>}
            </div>}
        </> : <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Task summary">
            {stats.map(({ label, value, icon: Icon, filter: stat, color }) => (
              <button key={stat} type="button" aria-pressed={filter === stat} onClick={() => go('tasks', stat, projectId)}
                className={cn(panel, 'flex min-h-24 flex-col items-start justify-between gap-2 p-4 text-left transition hover:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400', filter === stat && 'border-brand-400/50')}>
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className={cn('h-4 w-4 shrink-0', color)} />{label}</span>
                <span className="text-2xl font-semibold tabular-nums">{value?.toLocaleString() ?? '—'}</span>
              </button>
            ))}
          </section>
          <section className={panel} aria-label="Task list">
            <div className="space-y-3 border-b border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{selected ? selected.name + ' tasks' : 'Task queue'}</h2>
                {data && <span className="text-xs text-muted-foreground">{data.total.toLocaleString()} matching tasks</span>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(175px,1.5fr)_repeat(3,minmax(100px,1fr))_auto]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={(event) => setSearch(event.target.value)} className={cn(field, 'pl-9')} />
                </label>
                <select aria-label="Filter by status" className={field} value={filter} onChange={(event) => go('tasks', event.target.value as Filter, projectId)}>
                  <option value="all">All statuses</option><option value="overdue">Overdue</option>
                  {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select aria-label="Filter by priority" className={field} value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}>
                  <option value="">All priorities</option>{Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select aria-label="Filter by project" className={field} value={projectId} onChange={(event) => go('tasks', filter, event.target.value)}>
                  <option value="">All projects</option>{projectId && !selected && <option value={projectId}>Selected project</option>}
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
                <button type="button" aria-pressed={mine} onClick={() => { setMine(!mine); setPage(1); }} className={cn(secondary, mine && 'border-brand-400 bg-brand-500/10')}>Assigned to me</button>
              </div>
            </div>
            {taskQuery.isLoading ? <p role="status" className="p-6 text-sm">Loading tasks…</p> :
              taskQuery.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">Tasks could not be loaded.<button type="button" className={secondary} onClick={() => void taskQuery.refetch()}>Retry</button></div> :
              !data?.data.length ? <p className="p-8 text-center text-sm text-muted-foreground">No tasks match these filters.</p> :
              <ul className="divide-y divide-border">{data.data.map((task) => {
                const overdue = task.due_date && task.status !== 'done' && task.status !== 'cancelled' && new Date(task.due_date).getTime() < Date.now();
                return <li key={task.id} className="grid items-center gap-3 px-4 py-3.5 hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className={cn('break-words text-sm font-semibold', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</p>
                    {task.description && <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{task.description}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {task.project_name && <span>{task.project_name}</span>}
                      {task.assignee_name && <span>{task.assignee_name}</span>}
                      {task.due_date && <span className={overdue ? 'font-medium text-rose-600 dark:text-rose-300' : ''}>{overdue ? 'Overdue · ' : 'Due '}{formatDate(task.due_date)}</span>}
                      {task.tags?.map((tag, index) => <span key={index} className="rounded bg-muted px-1.5 py-0.5">{tag}</span>)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', PRIORITY_STYLE[task.priority])}>{PRIORITY[task.priority] ?? task.priority}</span>
                    <select aria-label={'Status for ' + task.title} value={task.status} disabled={updateTask.isPending}
                      className={cn(field, 'w-auto px-2.5 py-1.5 text-xs')}
                      onChange={(event) => updateTask.mutate({ id: task.id, status: event.target.value as Status })}>
                      {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                </li>;
              })}</ul>}
            {data && (data.totalPages > 1 || page > 1) && (
              <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                <button type="button" className={secondary} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span className="text-xs text-muted-foreground">Page {page} of {Math.max(1, data.totalPages)}</span>
                <button type="button" className={secondary} disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
          </section>
        </>}
      </>}

      {projectForm && canManage && <ProjectForm project={projectForm.project} accountKey={accountKey} close={() => setProjectForm(null)} saved={() => {
        setProjectForm(null); setProjectSearch(''); go('projects'); void refreshWorkspace();
      }} />}
      {taskForm && canWork && <TaskForm projects={projects} projectId={taskForm.projectId} close={() => setTaskForm(null)} saved={() => {
        setTaskForm(null); void refreshWorkspace();
      }} />}
    </div>
  );
}
