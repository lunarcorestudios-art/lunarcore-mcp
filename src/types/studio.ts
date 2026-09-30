import type { DataSource } from "./entities.js";
import type {
  CommentOnTaskInput,
  CreateClientInput,
  CreateDocInput,
  CreateLeadInput,
  CreateProjectInput,
  CreateProposalInput,
  CreateReminderInput,
  CreateTaskInput,
  IdInput,
  LinkEntitiesInput,
  ListClientsInput,
  ListLeadsInput,
  ListMembersInput,
  ListMilestonesInput,
  ListProjectsInput,
  ListProposalsInput,
  ListRemindersInput,
  ListTasksInput,
  LogTimeInput,
  ResolveMemberInput,
  SearchClientsInput,
  SearchDocsInput,
  SearchInput,
  TimeSummaryInput,
  UpdateClientInput,
  UpdateLeadInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpsertMilestoneInput,
} from "./inputs.js";
import type {
  ActorRecord,
  ClientRecord,
  DeliveryStatus,
  DocRecord,
  LeadRecord,
  LinkRecord,
  MemberMatches,
  MilestoneRecord,
  Page,
  PipelineSummary,
  ProjectRecord,
  ProposalRecord,
  ReminderRecord,
  SearchHit,
  TaskCommentRecord,
  TaskRecord,
  TimeEntryRecord,
  TimeSummary,
  WorkspaceContext,
} from "./results.js";
import type { Client, Doc, Lead, Member, Milestone, Project, Proposal, Reminder, Task } from "./entities.js";

/**
 * Stable studio port. MCP tool names call these methods and never talk to
 * ClickUp or Google directly. A future composite adapter can route delivery
 * to ClickUp and docs/reminders to Google without renaming tools.
 */
export interface StudioOs {
  readonly source: DataSource;
  listClients(input: ListClientsInput): Promise<Page<Client>>;
  getClient(input: IdInput): Promise<ClientRecord>;
  createClient(input: CreateClientInput): Promise<ClientRecord>;
  updateClient(input: UpdateClientInput): Promise<ClientRecord>;
  searchClients(input: SearchClientsInput): Promise<Page<Client>>;
  listProjects(input: ListProjectsInput): Promise<Page<Project>>;
  getProject(input: IdInput): Promise<ProjectRecord>;
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  updateProject(input: UpdateProjectInput): Promise<ProjectRecord>;
  listMilestones(input: ListMilestonesInput): Promise<Page<Milestone>>;
  upsertMilestone(input: UpsertMilestoneInput): Promise<MilestoneRecord>;
  listTasks(input: ListTasksInput): Promise<Page<Task>>;
  getTask(input: IdInput): Promise<TaskRecord>;
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  updateTask(input: UpdateTaskInput): Promise<TaskRecord>;
  commentOnTask(input: CommentOnTaskInput): Promise<TaskCommentRecord>;
  deliveryStatus(input: IdInput): Promise<DeliveryStatus>;
  listLeads(input: ListLeadsInput): Promise<Page<Lead>>;
  getLead(input: IdInput): Promise<LeadRecord>;
  createLead(input: CreateLeadInput): Promise<LeadRecord>;
  updateLead(input: UpdateLeadInput): Promise<LeadRecord>;
  listProposals(input: ListProposalsInput): Promise<Page<Proposal>>;
  getProposal(input: IdInput): Promise<ProposalRecord>;
  createProposal(input: CreateProposalInput): Promise<ProposalRecord>;
  pipelineSummary(): Promise<PipelineSummary>;
  listMembers(input: ListMembersInput): Promise<Page<Member>>;
  resolveMember(input: ResolveMemberInput): Promise<MemberMatches>;
  searchDocs(input: SearchDocsInput): Promise<Page<Doc>>;
  getDoc(input: IdInput): Promise<DocRecord>;
  createDoc(input: CreateDocInput): Promise<DocRecord>;
  createReminder(input: CreateReminderInput): Promise<ReminderRecord>;
  listReminders(input: ListRemindersInput): Promise<Page<Reminder>>;
  logTime(input: LogTimeInput): Promise<TimeEntryRecord>;
  timeSummary(input: TimeSummaryInput): Promise<TimeSummary>;
  search(input: SearchInput): Promise<Page<SearchHit>>;
  whoami(): Promise<ActorRecord>;
  workspaceContext(): Promise<WorkspaceContext>;
  linkEntities(input: LinkEntitiesInput): Promise<LinkRecord>;
}

export type StudioMethod = {
  [K in keyof StudioOs]: StudioOs[K] extends (...args: infer _Args) => unknown ? K : never;
}[keyof StudioOs];
