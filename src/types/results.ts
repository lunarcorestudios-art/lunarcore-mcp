import type {
  Client,
  DataSource,
  DeliveryHealth,
  Doc,
  EntityLink,
  Lead,
  LeadStage,
  Member,
  Milestone,
  MilestoneStatus,
  Project,
  Proposal,
  ProposalStatus,
  Reminder,
  Task,
  TaskComment,
  TaskStatus,
  TimeEntry,
} from "./entities.js";

export interface Page<T> {
  items: T[];
  total: number;
}

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface IntegrationPresence {
  clickup: {
    configured: boolean;
    present: { apiToken: boolean; teamId: boolean };
  };
  google: {
    configured: boolean;
    present: { clientId: boolean; clientSecret: boolean; refreshToken: boolean };
  };
}

export interface WorkspaceContext {
  workspace: { name: string; adapter: DataSource };
  actor: Actor;
  counts: {
    clients: number;
    projects: number;
    milestones: number;
    tasks: number;
    comments: number;
    leads: number;
    proposals: number;
    members: number;
    docs: number;
    reminders: number;
    timeEntries: number;
    links: number;
  };
  integrations: IntegrationPresence;
  persistence: "process_memory" | "external";
}

export interface DeliveryStatus {
  project: Project;
  client: Client;
  milestones: {
    total: number;
    byStatus: Record<MilestoneStatus, number>;
    next?: Milestone;
  };
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    blocked: Array<{ id: string; title: string }>;
  };
  health: DeliveryHealth;
}

export interface PipelineSummary {
  leads: { total: number; byStage: Record<LeadStage, number> };
  proposals: {
    total: number;
    byStatus: Record<ProposalStatus, number>;
    openAmountByCurrency: Array<{ currency: string; amount: number }>;
  };
}

export interface TimeSummary {
  from?: string;
  to?: string;
  totalMinutes: number;
  entryCount: number;
  byMember: Array<{ memberId: string; name: string; minutes: number }>;
  byProject: Array<{ projectId: string; name: string; minutes: number }>;
}

export interface SearchHit {
  kind: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export interface ToolSuccess<T> {
  ok: true;
  source: DataSource;
  data: T;
}

export interface ToolFailure {
  ok: false;
  source: DataSource;
  error: {
    code: string;
    message: string;
  };
}

export type ToolEnvelope<T> = ToolSuccess<T> | ToolFailure;

export type ClientRecord = { client: Client };
export type ProjectRecord = { project: Project };
export type MilestoneRecord = { milestone: Milestone };
export type TaskRecord = { task: Task; comments: TaskComment[] };
export type TaskCommentRecord = { comment: TaskComment };
export type LeadRecord = { lead: Lead };
export type ProposalRecord = { proposal: Proposal };
export type DocRecord = { doc: Doc };
export type ReminderRecord = { reminder: Reminder };
export type TimeEntryRecord = { entry: TimeEntry };
export type LinkRecord = { link: EntityLink };
export type MemberMatches = { matches: Member[]; total: number };
export type ActorRecord = { actor: Actor };
