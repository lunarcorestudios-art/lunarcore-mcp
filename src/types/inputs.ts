import type {
  ClientStatus,
  Contact,
  DocKind,
  EntityKind,
  LeadStage,
  MilestoneStatus,
  ProjectStatus,
  ProposalStatus,
  TaskPriority,
  TaskStatus,
} from "./entities.js";

export interface IdInput {
  id: string;
}

export interface ListClientsInput {
  status?: ClientStatus;
  query?: string;
  limit?: number;
}

export interface CreateClientInput {
  name: string;
  status?: ClientStatus;
  industry?: string;
  primaryContact?: Contact;
  notes?: string;
}

export interface UpdateClientInput {
  id: string;
  name?: string;
  status?: ClientStatus;
  industry?: string;
  primaryContact?: Contact;
  notes?: string;
}

export interface SearchClientsInput {
  query: string;
  limit?: number;
}

export interface ListProjectsInput {
  clientId?: string;
  status?: ProjectStatus;
  query?: string;
  limit?: number;
}

export interface CreateProjectInput {
  clientId: string;
  name: string;
  status?: ProjectStatus;
  phase?: string;
  startDate?: string;
  dueDate?: string;
  description?: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  status?: ProjectStatus;
  phase?: string;
  startDate?: string;
  dueDate?: string;
  description?: string;
}

export interface ListMilestonesInput {
  projectId: string;
  status?: MilestoneStatus;
  limit?: number;
}

export interface UpsertMilestoneInput {
  id?: string;
  projectId?: string;
  name?: string;
  status?: MilestoneStatus;
  dueDate?: string;
  description?: string;
}

export interface ListTasksInput {
  projectId?: string;
  milestoneId?: string;
  assigneeId?: string;
  status?: TaskStatus;
  query?: string;
  limit?: number;
}

export interface CreateTaskInput {
  projectId: string;
  milestoneId?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
  priority?: TaskPriority;
}

export interface UpdateTaskInput {
  id: string;
  milestoneId?: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
  priority?: TaskPriority;
}

export interface CommentOnTaskInput {
  taskId: string;
  body: string;
  authorId?: string;
}

export interface ListLeadsInput {
  stage?: LeadStage;
  ownerId?: string;
  query?: string;
  limit?: number;
}

export interface CreateLeadInput {
  name: string;
  company?: string;
  email?: string;
  source?: string;
  stage?: LeadStage;
  ownerId?: string;
  notes?: string;
}

export interface UpdateLeadInput {
  id: string;
  name?: string;
  company?: string;
  email?: string;
  source?: string;
  stage?: LeadStage;
  ownerId?: string;
  notes?: string;
}

export interface ListProposalsInput {
  leadId?: string;
  clientId?: string;
  status?: ProposalStatus;
  query?: string;
  limit?: number;
}

export interface CreateProposalInput {
  title: string;
  leadId?: string;
  clientId?: string;
  status?: ProposalStatus;
  amount?: number;
  currency?: string;
  summary?: string;
}

export interface ListMembersInput {
  active?: boolean;
  query?: string;
  limit?: number;
}

export interface ResolveMemberInput {
  query: string;
  limit?: number;
}

export interface SearchDocsInput {
  query: string;
  clientId?: string;
  projectId?: string;
  kind?: DocKind;
  limit?: number;
}

export interface CreateDocInput {
  title: string;
  body: string;
  kind?: DocKind;
  clientId?: string;
  projectId?: string;
}

export interface CreateReminderInput {
  title: string;
  dueAt: string;
  assigneeId?: string;
  relatedKind?: EntityKind;
  relatedId?: string;
  notes?: string;
}

export interface ListRemindersInput {
  assigneeId?: string;
  query?: string;
  limit?: number;
}

export interface LogTimeInput {
  memberId: string;
  minutes: number;
  date?: string;
  projectId?: string;
  taskId?: string;
  note?: string;
}

export interface TimeSummaryInput {
  memberId?: string;
  projectId?: string;
  from?: string;
  to?: string;
}

export interface SearchInput {
  query: string;
  kinds?: EntityKind[];
  limit?: number;
}

export interface LinkEntitiesInput {
  fromKind: EntityKind;
  fromId: string;
  toKind: EntityKind;
  toId: string;
  relation: string;
}
