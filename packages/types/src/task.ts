export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  organizationId: string;
  projectId?: string;
  assigneeId?: string;
  createdById: string;
  teamId?: string;
  dueDate?: string;
  completedAt?: string;
  tags: string[];
  sourceType?: 'manual' | 'meeting' | 'ai';
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'planning' | 'active' | 'paused' | 'completed';
  organizationId: string;
  teamId?: string;
  ownerId: string;
  startDate?: string;
  endDate?: string;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  dueDate?: string;
  status: 'active' | 'achieved' | 'missed';
  organizationId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}
