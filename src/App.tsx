import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import {
  Archive, ArrowLeft, ArrowUpRight, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, CirclePlus, Edit3, Menu, RotateCcw, Star, Trash2, X,
} from 'lucide-react'
import { workspaceApi } from './api/workspaceApi'
import { Importance, Project, Todo, WorkspaceData } from './types'

const ACTIVE_LIMIT = 5
const TODO_LIMIT = 5
const colors: Project['color'][] = ['coral', 'lavender', 'sage', 'sand', 'sky']
const todayIso = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const touchTime = () => new Date().toISOString()
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试。'

function dayDistance(value: string) {
  const target = new Date(`${value}T12:00:00`)
  const today = new Date(`${todayIso()}T12:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function updatedLabel(value: string) {
  const days = Math.max(0, -dayDistance(value.slice(0, 10)))
  if (days === 0) return '今天推进'
  if (days === 1) return '昨天推进'
  if (days >= 7) return `${days} 天未推进`
  return `${days} 天前`
}

function dueLabel(value: string) {
  if (!value) return '无截止日期'
  const days = dayDistance(value)
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  if (days <= 7) return `${days} 天后到期`
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function projectHints(project: Project) {
  const hints: { label: string; urgent?: boolean }[] = []
  if (project.due && dayDistance(project.due) <= 7) hints.push({ label: dueLabel(project.due), urgent: dayDistance(project.due) <= 0 })
  if (-dayDistance(project.updatedAt.slice(0, 10)) >= 7) hints.push({ label: '7 天未推进' })
  if (project.focus) hints.push({ label: '最近重点' })
  if (project.importance === 'important') hints.push({ label: '重要' })
  return hints
}

const blankProject = (index: number): Project => ({
  id: '', name: '', color: colors[index % colors.length], stage: '', next: '', due: '',
  importance: 'normal', focus: false, updatedAt: touchTime(), prerequisite: '', decisions: '',
  note: '', completed: false, todos: [],
})

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData>({ projects: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Project | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    workspaceApi.read()
      .then((data) => { if (!cancelled) setWorkspace(data) })
      .catch((error: unknown) => { if (!cancelled) setLoadError(errorMessage(error)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const active = workspace.projects.filter((project) => !project.completed)
  const completed = workspace.projects.filter((project) => project.completed)
  const selected = workspace.projects.find((project) => project.id === selectedId) ?? null
  const todayTodos = active.flatMap((project) => project.todos.filter((todo) => !todo.done && todo.today).map((todo) => ({ project, todo })))

  const saveProject = async (project: Project) => {
    if (!project.id && active.length >= ACTIVE_LIMIT) {
      setNotice('进行中项目已达 5 个，请先完成或归档一个。')
      return false
    }
    try {
      const saved = project.id
        ? await workspaceApi.updateProject(project)
        : await workspaceApi.createProject(project, workspace.projects.length)
      setWorkspace((current) => ({
        projects: project.id
          ? current.projects.map((item) => item.id === saved.id ? saved : item)
          : [...current.projects, saved],
      }))
      setNotice(project.id ? '项目已保存' : '新项目已加入工作桌')
      setEditing(null)
      return true
    } catch (error) {
      setNotice(errorMessage(error))
      return false
    }
  }

  const updateTodo = async (projectId: string, todoId: string, change: Partial<Todo>) => {
    const project = workspace.projects.find((item) => item.id === projectId)
    const todo = project?.todos.find((item) => item.id === todoId)
    if (!project || !todo) return
    try {
      const result = await workspaceApi.updateTodo(projectId, todo, change)
      setWorkspace((current) => ({ projects: current.projects.map((item) => item.id === projectId ? {
        ...item,
        updatedAt: result.updatedAt ?? item.updatedAt,
        todos: item.todos.map((entry) => entry.id === todoId ? result.todo : entry),
      } : item) }))
      if (change.done) setNotice('已完成，项目推进时间已更新')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const addTodo = async (projectId: string, title: string) => {
    const project = workspace.projects.find((item) => item.id === projectId)
    if (!project || project.todos.filter((todo) => !todo.done).length >= TODO_LIMIT) {
      setNotice('每个项目最多保留 5 个未完成待办。')
      return false
    }
    try {
      const todo = await workspaceApi.createTodo(projectId, title, project.todos.length)
      setWorkspace((current) => ({ projects: current.projects.map((item) => item.id === projectId
        ? { ...item, todos: [...item.todos, todo] }
        : item) }))
      setNotice('待办已添加')
      return true
    } catch (error) {
      setNotice(errorMessage(error))
      return false
    }
  }

  const deleteTodo = async (projectId: string, todoId: string) => {
    try {
      await workspaceApi.deleteTodo(todoId)
      setWorkspace((current) => ({ projects: current.projects.map((project) => project.id === projectId
        ? { ...project, todos: project.todos.filter((todo) => todo.id !== todoId) }
        : project) }))
      setNotice('待办已删除')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const completeProject = async (project: Project) => {
    try {
      const saved = await workspaceApi.setProjectCompleted(project, true)
      setWorkspace((current) => ({ projects: current.projects.map((item) => item.id === saved.id ? saved : item) }))
      setNotice('项目已收进“已完成”')
      setSelectedId(null)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const reopenProject = async (project: Project) => {
    if (active.length >= ACTIVE_LIMIT) {
      setNotice('进行中项目已达 5 个，暂时无法重新启用。')
      return
    }
    try {
      const saved = await workspaceApi.setProjectCompleted(project, false)
      setWorkspace((current) => ({ projects: current.projects.map((item) => item.id === saved.id ? saved : item) }))
      setNotice('项目已重新启用')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  if (loading) return <main className="loading-state"><span className="brand-mark">✶</span><p>正在读取工作桌…</p></main>

  if (selected) {
    return <>
      <ProjectDetail
        project={selected} onBack={() => setSelectedId(null)} onEdit={() => setEditing(selected)}
        onUpdateTodo={(todoId, change) => updateTodo(selected.id, todoId, change)}
        onDeleteTodo={(todoId) => deleteTodo(selected.id, todoId)}
        onAddTodo={(title) => addTodo(selected.id, title)} onComplete={() => completeProject(selected)} notice={notice}
      />
      {editing && <ProjectForm project={editing} onSave={saveProject} onCancel={() => setEditing(null)} />}
    </>
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#desk"><span className="brand-mark">✶</span><span>我的工作桌</span></a>
        <nav className={menuOpen ? 'topnav topnav-open' : 'topnav'} aria-label="主导航">
          <a className="active" href="#desk" onClick={() => setMenuOpen(false)}>工作桌</a><a href="#archive" onClick={() => setMenuOpen(false)}>已完成</a>
        </nav>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? '关闭菜单' : '打开菜单'} aria-expanded={menuOpen}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <span className="avatar" aria-hidden="true">林</span>
      </header>

      <section className="hero" id="desk">
        <div><p className="eyebrow">{new Intl.DateTimeFormat('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><h1>今天，从哪里开始？</h1><p className="hero-copy">把注意力放回眼前，先做一件真正推进项目的事。</p></div>
        <button className="primary-button" onClick={() => active.length < ACTIVE_LIMIT ? setEditing(blankProject(workspace.projects.length)) : setNotice('进行中项目已达 5 个，请先完成一个。')}><CirclePlus size={18} /> 新增项目</button>
      </section>

      {loadError && <aside className="connection-error" role="alert">{loadError}</aside>}
      <TodayPanel items={todayTodos} onComplete={(projectId, todoId) => updateTodo(projectId, todoId, { done: true })} onOpen={setSelectedId} />

      <section className="projects-section" aria-labelledby="projects-heading">
        <div className="section-heading"><div><span className="section-kicker">进行中 · {active.length} 个项目</span><h2 id="projects-heading">我的项目</h2></div><span className="muted">最多 5 个</span></div>
        <div className="project-grid">
          {active.map((project) => <ProjectCard key={project.id} project={project} onOpen={() => setSelectedId(project.id)} onToggleToday={(todo) => updateTodo(project.id, todo.id, { today: !todo.today })} />)}
          {active.length === 0 && <EmptyProjects onAdd={() => setEditing(blankProject(workspace.projects.length))} />}
        </div>
      </section>

      <CompletedProjects projects={completed} onOpen={setSelectedId} onReopen={reopenProject} />
      <footer><span>给自己留一点清楚的空间。</span><span>数据已连接 Supabase</span></footer>
      {editing && <ProjectForm project={editing} onSave={saveProject} onCancel={() => setEditing(null)} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  )
}

function TodayPanel({ items, onComplete, onOpen }: { items: { project: Project; todo: Todo }[]; onComplete: (projectId: string, todoId: string) => void; onOpen: (id: string) => void }) {
  return <section className="today-panel" aria-labelledby="today-heading">
    <div className="section-heading"><div><span className="section-kicker">今日选择</span><h2 id="today-heading">今天做</h2></div><span className="muted">{items.length} 件</span></div>
    {items.length === 0 ? <div className="today-empty"><span className="sun-icon">☀</span><p>从下面的项目里，挑一两件今天想做的事吧。</p><a className="text-button" href="#projects-heading">去挑选 <ArrowUpRight size={15} /></a></div> :
      <div className="today-list">{items.map(({ project, todo }) => <div className="today-item" key={todo.id}><button className="check-button" onClick={() => onComplete(project.id, todo.id)} aria-label={`完成${todo.title}`}><Check size={16} /></button><button className="today-copy" onClick={() => onOpen(project.id)}><strong>{todo.title}</strong><span>{project.name}</span></button></div>)}</div>}
  </section>
}

function ProjectCard({ project, onOpen, onToggleToday }: { project: Project; onOpen: () => void; onToggleToday: (todo: Todo) => void }) {
  const todos = project.todos.filter((todo) => !todo.done)
  return <article className={`project-card ${project.color}`}>
    <div className="card-top"><span className="status-dot" /><span className="updated">{updatedLabel(project.updatedAt)}</span></div>
    <HintRow project={project} />
    <button className="card-title" onClick={onOpen}>{project.name}<ChevronRight size={18} /></button>
    <div className="context"><span>上次做到</span><p>{project.stage}</p></div><div className="context next"><span>下一步</span><p>{project.next}</p></div>
    <div className="todo-list">{todos.length ? todos.map((todo) => <div className="todo-row" key={todo.id}><button className={todo.today ? 'today-toggle selected' : 'today-toggle'} onClick={() => onToggleToday(todo)} aria-label={todo.today ? `从今天做移除${todo.title}` : `把${todo.title}加入今天做`} title={todo.today ? '从今天做移除' : '加入今天做'}><Star size={14} fill={todo.today ? 'currentColor' : 'none'} /></button><button onClick={onOpen}>{todo.title}</button></div>) : <p className="all-done">近期待办已清空。</p>}</div>
    <div className="card-bottom"><span><CalendarDays size={14} /> {dueLabel(project.due)}</span><button onClick={onOpen}>查看详情 <ArrowUpRight size={14} /></button></div>
  </article>
}

function HintRow({ project }: { project: Project }) { return <div className="hint-row">{projectHints(project).map((hint) => <span className={hint.urgent ? 'hint urgent' : 'hint'} key={hint.label}>{hint.label}</span>)}</div> }

function ProjectDetail({ project, onBack, onEdit, onUpdateTodo, onDeleteTodo, onAddTodo, onComplete, notice }: {
  project: Project; onBack: () => void; onEdit: () => void; onUpdateTodo: (todoId: string, change: Partial<Todo>) => void;
  onDeleteTodo: (todoId: string) => void; onAddTodo: (title: string) => Promise<boolean>; onComplete: () => void; notice: string
}) {
  const [title, setTitle] = useState('')
  const openTodos = project.todos.filter((todo) => !todo.done)
  const submitTodo = async (event: FormEvent) => { event.preventDefault(); const clean = title.trim(); if (clean && await onAddTodo(clean)) setTitle('') }
  return <main className="detail-shell">
    <div className="detail-toolbar"><button className="back-button" onClick={onBack}><ArrowLeft size={18} /> 返回工作桌</button><button className="secondary-button" onClick={onEdit}><Edit3 size={16} /> 编辑项目</button></div>
    <article className={`detail-card ${project.color}`}>
      <div className="detail-label">项目详情</div><h1>{project.name}</h1><HintRow project={project} />
      <div className="detail-grid"><Info label="上次做到" text={project.stage} /><Info label="下一步" text={project.next} /></div>
      <div className="context-sections"><Info label="开始前须知" text={project.prerequisite} /><Info label="关键决定" text={project.decisions} /><Info label="临时备注" text={project.note} /></div>
      <section className="detail-todos"><div className="todo-heading"><span className="detail-heading">近期待办</span><span>{openTodos.length} / {TODO_LIMIT}</span></div>
        {openTodos.map((todo) => <div className="detail-todo" key={todo.id}><button className="check-button" onClick={() => onUpdateTodo(todo.id, { done: true })} aria-label={`完成${todo.title}`}><Check size={15} /></button><span>{todo.title}</span><button className={todo.today ? 'icon-button selected' : 'icon-button'} onClick={() => onUpdateTodo(todo.id, { today: !todo.today })} aria-label={todo.today ? '从今天做移除' : '加入今天做'} title={todo.today ? '已加入今天做' : '加入今天做'}><Star size={16} fill={todo.today ? 'currentColor' : 'none'} /></button><button className="icon-button danger" onClick={() => onDeleteTodo(todo.id)} aria-label={`删除${todo.title}`}><Trash2 size={16} /></button></div>)}
        {openTodos.length === 0 && <p className="empty-copy">还没有待办，写下一件具体的事。</p>}
        <form className="add-todo" onSubmit={submitTodo}><label className="sr-only" htmlFor="new-todo">新待办</label><input id="new-todo" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={openTodos.length >= TODO_LIMIT ? '已达 5 个未完成待办' : '添加一个具体待办…'} disabled={openTodos.length >= TODO_LIMIT} /><button className="secondary-button" disabled={!title.trim() || openTodos.length >= TODO_LIMIT}><CirclePlus size={16} /> 添加</button></form>
      </section>
      <div className="detail-actions"><button className="complete-project" onClick={onComplete}><CheckCircle2 size={17} /> 完成项目</button></div>
    </article>{notice && <div className="toast" role="status">{notice}</div>}
  </main>
}

function Info({ label, text }: { label: string; text: string }) { return <div><span className="detail-heading">{label}</span><p>{text || '暂无内容'}</p></div> }

function ProjectForm({ project, onSave, onCancel }: { project: Project; onSave: (project: Project) => Promise<boolean>; onCancel: () => void }) {
  const [draft, setDraft] = useState(project)
  const [errors, setErrors] = useState<string[]>([])
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => titleRef.current?.focus(), [])
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onCancel])
  const set = <K extends keyof Project>(key: K, value: Project[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const missing = [!draft.name.trim() && '项目名', !draft.stage.trim() && '上次做到', !draft.next.trim() && '下一步'].filter(Boolean) as string[]
    if (missing.length) { setErrors(missing); return }
    await onSave({ ...draft, name: draft.name.trim(), stage: draft.stage.trim(), next: draft.next.trim() })
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="form-title"><div className="modal-heading"><div><span className="section-kicker">{project.id ? '更新上下文' : '放上工作桌'}</span><h2 id="form-title">{project.id ? '编辑项目' : '新增项目'}</h2></div><button className="icon-button" onClick={onCancel} aria-label="关闭"><X size={20} /></button></div>
    <form onSubmit={submit} className="project-form">
      {errors.length > 0 && <div className="form-error" role="alert">请填写：{errors.join('、')}</div>}
      <Field label="项目名 *"><input ref={titleRef} value={draft.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="上次做到 *"><textarea rows={2} value={draft.stage} onChange={(e) => set('stage', e.target.value)} /></Field>
      <Field label="下一步 *"><textarea rows={2} value={draft.next} onChange={(e) => set('next', e.target.value)} /></Field>
      <div className="form-row"><Field label="截止日期"><input type="date" value={draft.due} onChange={(e) => set('due', e.target.value)} /></Field><Field label="重要程度"><select value={draft.importance} onChange={(e) => set('importance', e.target.value as Importance)}><option value="normal">普通</option><option value="important">重要</option></select></Field></div>
      <label className="checkbox-field"><input type="checkbox" checked={draft.focus} onChange={(e) => set('focus', e.target.checked)} /><span>这是我最近想重点推进的项目</span></label>
      <Field label="开始前须知"><textarea rows={2} value={draft.prerequisite} onChange={(e) => set('prerequisite', e.target.value)} /></Field>
      <Field label="关键决定"><textarea rows={2} value={draft.decisions} onChange={(e) => set('decisions', e.target.value)} /></Field>
      <Field label="临时备注"><textarea rows={2} value={draft.note} onChange={(e) => set('note', e.target.value)} /></Field>
      <div className="form-actions"><button type="button" className="ghost-button" onClick={onCancel}>取消</button><button className="primary-button" type="submit"><Check size={17} /> 保存项目</button></div>
    </form></section></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }

function CompletedProjects({ projects, onOpen, onReopen }: { projects: Project[]; onOpen: (id: string) => void; onReopen: (project: Project) => void }) {
  const [open, setOpen] = useState(false)
  return <section className="archive-section" id="archive"><button className="archive-heading" onClick={() => setOpen(!open)} aria-expanded={open}><span><Archive size={18} /> 已完成 <small>{projects.length}</small></span><ChevronDown className={open ? 'rotate' : ''} size={19} /></button>{open && <div className="archive-list">{projects.length === 0 ? <p>完成的项目会放在这里。</p> : projects.map((project) => <div className="archive-item" key={project.id}><button onClick={() => onOpen(project.id)}>{project.name}</button><button className="text-button" onClick={() => onReopen(project)}><RotateCcw size={14} /> 重新启用</button></div>)}</div>}</section>
}

function EmptyProjects({ onAdd }: { onAdd: () => void }) { return <div className="empty-projects"><div className="empty-illustration">✶</div><h3>还没有进行中的项目</h3><p>把最近真正想推进的事放到这里，保持在 5 个以内。</p><button className="primary-button" onClick={onAdd}><CirclePlus size={18} /> 新增第一个项目</button></div> }

export default App
