export const DATA_SOURCES = ["stub", "clickup", "google"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const CLIENT_STATUSES = ["active", "paused", "prospect", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const PROJECT_STATUSES = [
  "planning",
  "active",
  "review",
  "delivered",
  "on_hold",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const MILESTONE_STATUSES = ["pending", "in_progress", "done", "blocked"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const LEAD_STAGES = ["new", "qualified", "proposal", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const PROPOSAL_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const DOC_KINDS = ["brief", "note", "sop", "proposal", "other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const ENTITY_KINDS = [
  "client",
  "project",
  "milestone",
  "task",
  "lead",
  "proposal",
  "member",
  "doc",
  "reminder",
  "time_entry",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const DELIVERY_HEALTH = ["on_track", "at_risk", "blocked", "delivered"] as const;
export type DeliveryHealth = (typeof DELIVERY_HEALTH)[number];

export interface Contact {
  name?: string;
  email?: string;
}

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  industry?: string;
  primaryContact?: Contact;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  status: ProjectStatus;
  phase?: string;
  startDate?: string;
  dueDate?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  status: MilestoneStatus;
  dueDate?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  milestoneId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId?: string;
  body: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  company?: string;
  email?: string;
  source?: string;
  stage: LeadStage;
  ownerId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  leadId?: string;
  clientId?: string;
  title: string;
  status: ProposalStatus;
  amount?: number;
  currency: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export interface Doc {
  id: string;
  title: string;
  body: string;
  kind: DocKind;
  clientId?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export interface Reminder {
  id: string;
  title: string;
  dueAt: string;
  assigneeId?: string;
  related?: EntityRef;
  notes?: string;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  memberId: string;
  projectId?: string;
  taskId?: string;
  minutes: number;
  date: string;
  note?: string;
  createdAt: string;
}

export interface EntityLink {
  id: string;
  from: EntityRef;
  to: EntityRef;
  relation: string;
  createdAt: string;
}
