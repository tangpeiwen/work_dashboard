export type Importance = 'normal' | 'important'

export type Todo = {
  id: string
  title: string
  done: boolean
  today: boolean
}

export type Project = {
  id: string
  name: string
  color: 'coral' | 'lavender' | 'sage' | 'sand' | 'sky'
  stage: string
  next: string
  due: string
  importance: Importance
  focus: boolean
  updatedAt: string
  prerequisite: string
  decisions: string
  note: string
  completed: boolean
  todos: Todo[]
}

export type WorkspaceData = { projects: Project[] }
