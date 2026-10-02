import { supabase } from '../lib/supabase'
import { Project, Todo, WorkspaceData } from '../types'

type ProjectRow = {
  id: string
  name: string
  color: Project['color']
  stage: string
  next_step: string
  due_date: string | null
  importance: Project['importance']
  is_focus: boolean
  last_progress_at: string
  prerequisite: string
  decisions: string
  note: string
  is_completed: boolean
  position: number
}

type TodoRow = {
  id: string
  project_id: string
  title: string
  is_done: boolean
  is_today: boolean
  position: number
}

const projectColumns = 'id,name,color,stage,next_step,due_date,importance,is_focus,last_progress_at,prerequisite,decisions,note,is_completed,position'
const todoColumns = 'id,project_id,title,is_done,is_today,position'

function mapTodo(row: TodoRow): Todo {
  return { id: row.id, title: row.title, done: row.is_done, today: row.is_today }
}

function mapProject(row: ProjectRow, todos: Todo[] = []): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    stage: row.stage,
    next: row.next_step,
    due: row.due_date ?? '',
    importance: row.importance,
    focus: row.is_focus,
    updatedAt: row.last_progress_at,
    prerequisite: row.prerequisite,
    decisions: row.decisions,
    note: row.note,
    completed: row.is_completed,
    todos,
  }
}

function projectValues(project: Project, position?: number) {
  return {
    name: project.name,
    color: project.color,
    stage: project.stage,
    next_step: project.next,
    due_date: project.due || null,
    importance: project.importance,
    is_focus: project.focus,
    last_progress_at: project.updatedAt,
    prerequisite: project.prerequisite,
    decisions: project.decisions,
    note: project.note,
    is_completed: project.completed,
    ...(position === undefined ? {} : { position }),
  }
}

export const workspaceApi = {
  async read(): Promise<WorkspaceData> {
    const [projectsResult, todosResult] = await Promise.all([
      supabase.from('projects').select(projectColumns).order('position').order('created_at'),
      supabase.from('todos').select(todoColumns).order('position').order('created_at'),
    ])
    if (projectsResult.error) throw new Error(`读取项目失败：${projectsResult.error.message}`)
    if (todosResult.error) throw new Error(`读取待办失败：${todosResult.error.message}`)

    const todosByProject = new Map<string, Todo[]>()
    for (const row of todosResult.data as TodoRow[]) {
      const todos = todosByProject.get(row.project_id) ?? []
      todos.push(mapTodo(row))
      todosByProject.set(row.project_id, todos)
    }
    return {
      projects: (projectsResult.data as ProjectRow[]).map((row) => mapProject(row, todosByProject.get(row.id))),
    }
  },

  async createProject(project: Project, position: number): Promise<Project> {
    const { data, error } = await supabase.from('projects').insert(projectValues(project, position)).select(projectColumns).single()
    if (error) throw new Error(`创建项目失败：${error.message}`)
    return mapProject(data as ProjectRow)
  },

  async updateProject(project: Project): Promise<Project> {
    const { data, error } = await supabase.from('projects').update(projectValues(project)).eq('id', project.id).select(projectColumns).single()
    if (error) throw new Error(`保存项目失败：${error.message}`)
    return mapProject(data as ProjectRow, project.todos)
  },

  async setProjectCompleted(project: Project, completed: boolean): Promise<Project> {
    if (completed) {
      const { error: todoError } = await supabase.from('todos').update({ is_today: false }).eq('project_id', project.id)
      if (todoError) throw new Error(`更新待办失败：${todoError.message}`)
    }
    const { data, error } = await supabase.from('projects').update({ is_completed: completed }).eq('id', project.id).select(projectColumns).single()
    if (error) throw new Error(`更新项目状态失败：${error.message}`)
    const todos = project.todos.map((todo) => completed ? { ...todo, today: false } : todo)
    return mapProject(data as ProjectRow, todos)
  },

  async createTodo(projectId: string, title: string, position: number): Promise<Todo> {
    const { data, error } = await supabase.from('todos').insert({ project_id: projectId, title, position }).select(todoColumns).single()
    if (error) throw new Error(`创建待办失败：${error.message}`)
    return mapTodo(data as TodoRow)
  },

  async updateTodo(projectId: string, todo: Todo, change: Partial<Todo>): Promise<{ todo: Todo; updatedAt?: string }> {
    const done = change.done ?? todo.done
    const today = done ? false : (change.today ?? todo.today)
    const { data, error } = await supabase.from('todos').update({
      title: change.title ?? todo.title,
      is_done: done,
      is_today: today,
      completed_at: done ? new Date().toISOString() : null,
    }).eq('id', todo.id).select(todoColumns).single()
    if (error) throw new Error(`更新待办失败：${error.message}`)

    if (change.done === true && !todo.done) {
      const updatedAt = new Date().toISOString()
      const { error: projectError } = await supabase.from('projects').update({ last_progress_at: updatedAt }).eq('id', projectId)
      if (projectError) throw new Error(`更新项目进度失败：${projectError.message}`)
      return { todo: mapTodo(data as TodoRow), updatedAt }
    }
    return { todo: mapTodo(data as TodoRow) }
  },

  async deleteTodo(todoId: string): Promise<void> {
    const { error } = await supabase.from('todos').delete().eq('id', todoId)
    if (error) throw new Error(`删除待办失败：${error.message}`)
  },
}
