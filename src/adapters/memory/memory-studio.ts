import type { StudioConfig } from "../../config/env.js";
import type {
  Client,
  Contact,
  Doc,
  EntityKind,
  EntityLink,
  Lead,
  Member,
  Milestone,
  Project,
  Proposal,
  Reminder,
  Task,
  TaskComment,
  TimeEntry,
} from "../../types/entities.js";
import {
  LEAD_STAGES,
  MILESTONE_STATUSES,
  PROPOSAL_STATUSES,
  TASK_STATUSES,
} from "../../types/entities.js";
import { StudioError } from "../../types/errors.js";
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
} from "../../types/inputs.js";
import type {
  Actor,
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
} from "../../types/results.js";
import type { StudioOs } from "../../types/studio.js";
import { seedRecords } from "./seed.js";
import {
  assertDateTime,
  assertDay,
  assertEmail,
  assertPatch,
  countBy,
  createId,
  includesFold,
  matchesAny,
  nowIso,
  paginate,
  requireText,
  sortByUpdatedDesc,
  todayUtc,
  withUpdates,
} from "./support.js";

interface CorpusEntry {
  kind: EntityKind;
  id: string;
  title: string;
  fields: string[];
}

/**
 * Process-local studio. Records live in memory and reset when the process exits.
 * Successful tool calls are stamped `source: "stub"` by the MCP layer.
 */
export class MemoryStudio implements StudioOs {
  readonly source = "stub" as const;

  private readonly clients = new Map<string, Client>();
  private readonly projects = new Map<string, Project>();
  private readonly milestones = new Map<string, Milestone>();
  private readonly tasks = new Map<string, Task>();
  private readonly comments: TaskComment[] = [];
  private readonly leads = new Map<string, Lead>();
  private readonly proposals = new Map<string, Proposal>();
  private readonly members = new Map<string, Member>();
  private readonly docs = new Map<string, Doc>();
  private readonly reminders: Reminder[] = [];
  private readonly timeEntries: TimeEntry[] = [];
  private readonly links: EntityLink[] = [];

  constructor(private readonly config: StudioConfig) {
    const seeded = seedRecords();
    for (const member of seeded.members) this.members.set(member.id, member);
    for (const client of seeded.clients) this.clients.set(client.id, client);
    for (const project of seeded.projects) this.projects.set(project.id, project);
    for (const milestone of seeded.milestones) this.milestones.set(milestone.id, milestone);
    for (const task of seeded.tasks) this.tasks.set(task.id, task);
    this.comments.push(...seeded.comments);
    for (const lead of seeded.leads) this.leads.set(lead.id, lead);
    for (const proposal of seeded.proposals) this.proposals.set(proposal.id, proposal);
    for (const doc of seeded.docs) this.docs.set(doc.id, doc);
    this.reminders.push(...seeded.reminders);
    this.timeEntries.push(...seeded.timeEntries);
    this.links.push(...seeded.links);
  }

  async listClients(input: ListClientsInput): Promise<Page<Client>> {
    const query = input.query?.trim();
    const items = [...this.clients.values()].filter((client) => {
      if (input.status && client.status !== input.status) return false;
      if (query && !this.clientMatches(client, query)) return false;
      return true;
    });
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  async getClient(input: IdInput): Promise<ClientRecord> {
    return { client: this.requireClient(input.id) };
  }

  async createClient(input: CreateClientInput): Promise<ClientRecord> {
    const timestamp = nowIso();
    const client: Client = {
      id: createId("cli"),
      name: requireText(input.name, "name"),
      status: input.status ?? "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.industry !== undefined) client.industry = requireText(input.industry, "industry");
    if (input.notes !== undefined) client.notes = requireText(input.notes, "notes");
    if (input.primaryContact !== undefined) client.primaryContact = this.readContact(input.primaryContact);
    this.clients.set(client.id, client);
    return { client };
  }

  async updateClient(input: UpdateClientInput): Promise<ClientRecord> {
    assertPatch(input, ["id"]);
    const current = this.requireClient(input.id);
    const client = withUpdates(
      current,
      {
        name: input.name === undefined ? undefined : requireText(input.name, "name"),
        status: input.status,
        industry: input.industry === undefined ? undefined : requireText(input.industry, "industry"),
        notes: input.notes === undefined ? undefined : requireText(input.notes, "notes"),
        primaryContact:
          input.primaryContact === undefined ? undefined : this.readContact(input.primaryContact),
      },
      ["name", "status", "industry", "notes", "primaryContact"],
    );
    this.clients.set(client.id, client);
    return { client };
  }

  async searchClients(input: SearchClientsInput): Promise<Page<Client>> {
    const query = requireText(input.query, "query");
    const items = [...this.clients.values()].filter((client) => this.clientMatches(client, query));
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  async listProjects(input: ListProjectsInput): Promise<Page<Project>> {
    if (input.clientId) this.requireClient(input.clientId);
    const query = input.query?.trim();
    const items = [...this.projects.values()].filter((project) => {
      if (input.clientId && project.clientId !== input.clientId) return false;
      if (input.status && project.status !== input.status) return false;
      if (query && !matchesAny(query, [project.name, project.phase, project.description])) return false;
      return true;
    });
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  async getProject(input: IdInput): Promise<ProjectRecord> {
    return { project: this.requireProject(input.id) };
  }

  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    this.requireClient(input.clientId);
    const timestamp = nowIso();
    const project: Project = {
      id: createId("prj"),
      clientId: input.clientId,
      name: requireText(input.name, "name"),
      status: input.status ?? "planning",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.phase !== undefined) project.phase = requireText(input.phase, "phase");
    if (input.startDate !== undefined) project.startDate = assertDay(input.startDate, "startDate");
    if (input.dueDate !== undefined) project.dueDate = assertDay(input.dueDate, "dueDate");
    if (input.description !== undefined) project.description = requireText(input.description, "description");
    this.projects.set(project.id, project);
    return { project };
  }

  async updateProject(input: UpdateProjectInput): Promise<ProjectRecord> {
    assertPatch(input, ["id"]);
    const current = this.requireProject(input.id);
    const project = withUpdates(
      current,
      {
        name: input.name === undefined ? undefined : requireText(input.name, "name"),
        status: input.status,
        phase: input.phase === undefined ? undefined : requireText(input.phase, "phase"),
        startDate: input.startDate === undefined ? undefined : assertDay(input.startDate, "startDate"),
        dueDate: input.dueDate === undefined ? undefined : assertDay(input.dueDate, "dueDate"),
        description:
          input.description === undefined ? undefined : requireText(input.description, "description"),
      },
      ["name", "status", "phase", "startDate", "dueDate", "description"],
    );
    this.projects.set(project.id, project);
    return { project };
  }

  async listMilestones(input: ListMilestonesInput): Promise<Page<Milestone>> {
    this.requireProject(input.projectId);
    const items = [...this.milestones.values()].filter((milestone) => {
      if (milestone.projectId !== input.projectId) return false;
      if (input.status && milestone.status !== input.status) return false;
      return true;
    });
    items.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.name.localeCompare(b.name));
    return paginate(items, input.limit);
  }

  async upsertMilestone(input: UpsertMilestoneInput): Promise<MilestoneRecord> {
    if (input.id) {
      assertPatch(input, ["id"]);
      const current = this.requireMilestone(input.id);
      if (input.projectId && input.projectId !== current.projectId) {
        throw new StudioError("invalid", "Milestones cannot move between projects.");
      }
      const milestone = withUpdates(
        current,
        {
          name: input.name === undefined ? undefined : requireText(input.name, "name"),
          status: input.status,
          dueDate: input.dueDate === undefined ? undefined : assertDay(input.dueDate, "dueDate"),
          description:
            input.description === undefined ? undefined : requireText(input.description, "description"),
        },
        ["name", "status", "dueDate", "description"],
      );
      this.milestones.set(milestone.id, milestone);
      return { milestone };
    }

    if (!input.projectId || !input.name?.trim()) {
      throw new StudioError(
        "invalid",
        "Provide id to update a milestone, or projectId and name to create or update by name.",
      );
    }
    const projectId = input.projectId;
    this.requireProject(projectId);
    const name = requireText(input.name, "name");
    const existing = [...this.milestones.values()].find(
      (milestone) => milestone.projectId === projectId && milestone.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const milestone = withUpdates(
        existing,
        {
          name,
          status: input.status,
          dueDate: input.dueDate === undefined ? undefined : assertDay(input.dueDate, "dueDate"),
          description:
            input.description === undefined ? undefined : requireText(input.description, "description"),
        },
        ["name", "status", "dueDate", "description"],
      );
      this.milestones.set(milestone.id, milestone);
      return { milestone };
    }

    const timestamp = nowIso();
    const milestone: Milestone = {
      id: createId("mls"),
      projectId,
      name,
      status: input.status ?? "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.dueDate !== undefined) milestone.dueDate = assertDay(input.dueDate, "dueDate");
    if (input.description !== undefined) milestone.description = requireText(input.description, "description");
    this.milestones.set(milestone.id, milestone);
    return { milestone };
  }

  async listTasks(input: ListTasksInput): Promise<Page<Task>> {
    if (input.projectId) this.requireProject(input.projectId);
    if (input.milestoneId) this.requireMilestone(input.milestoneId);
    if (input.assigneeId) this.requireMember(input.assigneeId);
    const query = input.query?.trim();
    const items = [...this.tasks.values()].filter((task) => {
      if (input.projectId && task.projectId !== input.projectId) return false;
      if (input.milestoneId && task.milestoneId !== input.milestoneId) return false;
      if (input.assigneeId && task.assigneeId !== input.assigneeId) return false;
      if (input.status && task.status !== input.status) return false;
      if (query && !matchesAny(query, [task.title, task.description])) return false;
      return true;
    });
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  async getTask(input: IdInput): Promise<TaskRecord> {
    const task = this.requireTask(input.id);
    const comments = this.comments
      .filter((comment) => comment.taskId === task.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { task, comments };
  }

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    this.requireProject(input.projectId);
    if (input.milestoneId) this.requireMilestoneOnProject(input.milestoneId, input.projectId);
    if (input.assigneeId) this.requireMember(input.assigneeId);
    const timestamp = nowIso();
    const task: Task = {
      id: createId("tsk"),
      projectId: input.projectId,
      title: requireText(input.title, "title"),
      status: input.status ?? "todo",
      priority: input.priority ?? "normal",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.milestoneId !== undefined) task.milestoneId = input.milestoneId;
    if (input.description !== undefined) task.description = requireText(input.description, "description");
    if (input.assigneeId !== undefined) task.assigneeId = input.assigneeId;
    if (input.dueDate !== undefined) task.dueDate = assertDay(input.dueDate, "dueDate");
    this.tasks.set(task.id, task);
    return { task, comments: [] };
  }

  async updateTask(input: UpdateTaskInput): Promise<TaskRecord> {
    assertPatch(input, ["id"]);
    const current = this.requireTask(input.id);
    if (input.milestoneId) this.requireMilestoneOnProject(input.milestoneId, current.projectId);
    if (input.assigneeId) this.requireMember(input.assigneeId);
    const task = withUpdates(
      current,
      {
        title: input.title === undefined ? undefined : requireText(input.title, "title"),
        description: input.description === undefined ? undefined : requireText(input.description, "description"),
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        milestoneId: input.milestoneId,
        dueDate: input.dueDate === undefined ? undefined : assertDay(input.dueDate, "dueDate"),
      },
      ["title", "description", "status", "priority", "assigneeId", "milestoneId", "dueDate"],
    );
    this.tasks.set(task.id, task);
    return this.getTask({ id: task.id });
  }

  async commentOnTask(input: CommentOnTaskInput): Promise<TaskCommentRecord> {
    this.requireTask(input.taskId);
    if (input.authorId) this.requireMember(input.authorId);
    const comment: TaskComment = {
      id: createId("cmt"),
      taskId: input.taskId,
      body: requireText(input.body, "body"),
      createdAt: nowIso(),
    };
    if (input.authorId !== undefined) comment.authorId = input.authorId;
    this.comments.push(comment);
    return { comment };
  }

  async deliveryStatus(input: IdInput): Promise<DeliveryStatus> {
    const project = this.requireProject(input.id);
    const client = this.requireClient(project.clientId);
    const milestones = [...this.milestones.values()].filter((milestone) => milestone.projectId === project.id);
    const tasks = [...this.tasks.values()].filter((task) => task.projectId === project.id);
    const today = todayUtc();
    const openMilestones = milestones
      .filter((milestone) => milestone.status !== "done")
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.name.localeCompare(b.name));
    const blockedTasks = tasks.filter((task) => task.status === "blocked");
    const overdue = milestones.some(
      (milestone) => milestone.status !== "done" && milestone.dueDate !== undefined && milestone.dueDate < today,
    );
    let health: DeliveryStatus["health"] = "on_track";
    if (project.status === "delivered") health = "delivered";
    else if (blockedTasks.length > 0 || milestones.some((milestone) => milestone.status === "blocked")) {
      health = "blocked";
    } else if (overdue) health = "at_risk";

    const next = openMilestones[0];
    return {
      project,
      client,
      milestones: {
        total: milestones.length,
        byStatus: countBy(
          milestones.map((milestone) => milestone.status),
          MILESTONE_STATUSES,
        ),
        ...(next ? { next } : {}),
      },
      tasks: {
        total: tasks.length,
        byStatus: countBy(
          tasks.map((task) => task.status),
          TASK_STATUSES,
        ),
        blocked: blockedTasks.map((task) => ({ id: task.id, title: task.title })),
      },
      health,
    };
  }

  async listLeads(input: ListLeadsInput): Promise<Page<Lead>> {
    if (input.ownerId) this.requireMember(input.ownerId);
    const query = input.query?.trim();
    const items = [...this.leads.values()].filter((lead) => {
      if (input.stage && lead.stage !== input.stage) return false;
      if (input.ownerId && lead.ownerId !== input.ownerId) return false;
      if (query && !matchesAny(query, [lead.name, lead.company, lead.email, lead.notes, lead.source])) return false;
      return true;
    });
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  async getLead(input: IdInput): Promise<LeadRecord> {
    return { lead: this.requireLead(input.id) };
  }

  async createLead(input: CreateLeadInput): Promise<LeadRecord> {
    if (input.ownerId) this.requireMember(input.ownerId);
    const timestamp = nowIso();
    const lead: Lead = {
      id: createId("led"),
      name: requireText(input.name, "name"),
      stage: input.stage ?? "new",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.company !== undefined) lead.company = requireText(input.company, "company");
    if (input.email !== undefined) lead.email = assertEmail(input.email, "email");
    if (input.source !== undefined) lead.source = requireText(input.source, "source");
    if (input.ownerId !== undefined) lead.ownerId = input.ownerId;
    if (input.notes !== undefined) lead.notes = requireText(input.notes, "notes");
    this.leads.set(lead.id, lead);
    return { lead };
  }

  async updateLead(input: UpdateLeadInput): Promise<LeadRecord> {
    assertPatch(input, ["id"]);
    if (input.ownerId) this.requireMember(input.ownerId);
    const current = this.requireLead(input.id);
    const lead = withUpdates(
      current,
      {
        name: input.name === undefined ? undefined : requireText(input.name, "name"),
        company: input.company === undefined ? undefined : requireText(input.company, "company"),
        email: input.email === undefined ? undefined : assertEmail(input.email, "email"),
        source: input.source === undefined ? undefined : requireText(input.source, "source"),
        stage: input.stage,
        ownerId: input.ownerId,
        notes: input.notes === undefined ? undefined : requireText(input.notes, "notes"),
      },
      ["name", "company", "email", "source", "stage", "ownerId", "notes"],
    );
    this.leads.set(lead.id, lead);
    return { lead };
  }

  async listProposals(input: ListProposalsInput): Promise<Page<Proposal>> {
    if (input.leadId) this.requireLead(input.leadId);
    if (input.clientId) this.requireClient(input.clientId);
    const query = input.query?.trim();
    const items = [...this.proposals.values()].filter((proposal) => {
      if (input.leadId && proposal.leadId !== input.leadId) return false;
      if (input.clientId && proposal.clientId !== input.clientId) return false;
      if (input.status && proposal.status !== input.status) return false;
      if (query && !matchesAny(query, [proposal.title, proposal.summary])) return false;
      return true;
    });
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  async getProposal(input: IdInput): Promise<ProposalRecord> {
    return { proposal: this.requireProposal(input.id) };
  }

  async createProposal(input: CreateProposalInput): Promise<ProposalRecord> {
    if (input.leadId) this.requireLead(input.leadId);
    if (input.clientId) this.requireClient(input.clientId);
    const timestamp = nowIso();
    const proposal: Proposal = {
      id: createId("prp"),
      title: requireText(input.title, "title"),
      status: input.status ?? "draft",
      currency: input.currency?.trim().toUpperCase() || "USD",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.leadId !== undefined) proposal.leadId = input.leadId;
    if (input.clientId !== undefined) proposal.clientId = input.clientId;
    if (input.amount !== undefined) proposal.amount = input.amount;
    if (input.summary !== undefined) proposal.summary = requireText(input.summary, "summary");
    this.proposals.set(proposal.id, proposal);
    return { proposal };
  }

  async pipelineSummary(): Promise<PipelineSummary> {
    const leads = [...this.leads.values()];
    const proposals = [...this.proposals.values()];
    const open = new Map<string, number>();
    for (const proposal of proposals) {
      if (proposal.status !== "draft" && proposal.status !== "sent") continue;
      if (proposal.amount === undefined) continue;
      open.set(proposal.currency, (open.get(proposal.currency) ?? 0) + proposal.amount);
    }
    return {
      leads: {
        total: leads.length,
        byStage: countBy(
          leads.map((lead) => lead.stage),
          LEAD_STAGES,
        ),
      },
      proposals: {
        total: proposals.length,
        byStatus: countBy(
          proposals.map((proposal) => proposal.status),
          PROPOSAL_STATUSES,
        ),
        openAmountByCurrency: [...open.entries()]
          .map(([currency, amount]) => ({ currency, amount }))
          .sort((a, b) => a.currency.localeCompare(b.currency)),
      },
    };
  }

  async listMembers(input: ListMembersInput): Promise<Page<Member>> {
    const query = input.query?.trim();
    const items = [...this.members.values()].filter((member) => {
      if (input.active !== undefined && member.active !== input.active) return false;
      if (query && !matchesAny(query, [member.name, member.email, member.role])) return false;
      return true;
    });
    items.sort((a, b) => a.name.localeCompare(b.name));
    return paginate(items, input.limit);
  }

  async resolveMember(input: ResolveMemberInput): Promise<MemberMatches> {
    const query = requireText(input.query, "query").toLowerCase();
    const matches = [...this.members.values()].filter(
      (member) =>
        member.email.toLowerCase() === query ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.role.toLowerCase().includes(query),
    );
    matches.sort((a, b) => {
      const rank = (member: Member) => (member.email.toLowerCase() === query ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    const page = paginate(matches, input.limit);
    return { matches: page.items, total: page.total };
  }

  async searchDocs(input: SearchDocsInput): Promise<Page<Doc>> {
    if (input.clientId) this.requireClient(input.clientId);
    if (input.projectId) this.requireProject(input.projectId);
    const query = requireText(input.query, "query");
    const items = [...this.docs.values()].filter((doc) => {
      if (input.clientId && doc.clientId !== input.clientId) return false;
      if (input.projectId && doc.projectId !== input.projectId) return false;
      if (input.kind && doc.kind !== input.kind) return false;
      return matchesAny(query, [doc.title, doc.body]);
    });
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  async getDoc(input: IdInput): Promise<DocRecord> {
    return { doc: this.requireDoc(input.id) };
  }

  async createDoc(input: CreateDocInput): Promise<DocRecord> {
    if (input.clientId) this.requireClient(input.clientId);
    if (input.projectId) {
      const project = this.requireProject(input.projectId);
      if (input.clientId && project.clientId !== input.clientId) {
        throw new StudioError("invalid", "projectId does not belong to clientId.");
      }
    }
    const timestamp = nowIso();
    const doc: Doc = {
      id: createId("doc"),
      title: requireText(input.title, "title"),
      body: requireText(input.body, "body"),
      kind: input.kind ?? "note",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.clientId !== undefined) doc.clientId = input.clientId;
    if (input.projectId !== undefined) doc.projectId = input.projectId;
    this.docs.set(doc.id, doc);
    return { doc };
  }

  async createReminder(input: CreateReminderInput): Promise<ReminderRecord> {
    if (input.assigneeId) this.requireMember(input.assigneeId);
    const related = this.readRelated(input.relatedKind, input.relatedId);
    const reminder: Reminder = {
      id: createId("rem"),
      title: requireText(input.title, "title"),
      dueAt: assertDateTime(input.dueAt, "dueAt"),
      createdAt: nowIso(),
    };
    if (input.assigneeId !== undefined) reminder.assigneeId = input.assigneeId;
    if (related) reminder.related = related;
    if (input.notes !== undefined) reminder.notes = requireText(input.notes, "notes");
    this.reminders.push(reminder);
    return { reminder };
  }

  async listReminders(input: ListRemindersInput): Promise<Page<Reminder>> {
    if (input.assigneeId) this.requireMember(input.assigneeId);
    const query = input.query?.trim();
    const items = this.reminders.filter((reminder) => {
      if (input.assigneeId && reminder.assigneeId !== input.assigneeId) return false;
      if (query && !matchesAny(query, [reminder.title, reminder.notes])) return false;
      return true;
    });
    items.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title));
    return paginate(items, input.limit);
  }

  async logTime(input: LogTimeInput): Promise<TimeEntryRecord> {
    this.requireMember(input.memberId);
    let projectId = input.projectId;
    if (input.taskId) {
      const task = this.requireTask(input.taskId);
      if (projectId && projectId !== task.projectId) {
        throw new StudioError("invalid", "taskId does not belong to projectId.");
      }
      projectId = task.projectId;
    } else if (projectId) {
      this.requireProject(projectId);
    }
    const entry: TimeEntry = {
      id: createId("tim"),
      memberId: input.memberId,
      minutes: input.minutes,
      date: input.date === undefined ? todayUtc() : assertDay(input.date, "date"),
      createdAt: nowIso(),
    };
    if (projectId !== undefined) entry.projectId = projectId;
    if (input.taskId !== undefined) entry.taskId = input.taskId;
    if (input.note !== undefined) entry.note = requireText(input.note, "note");
    this.timeEntries.push(entry);
    return { entry };
  }

  async timeSummary(input: TimeSummaryInput): Promise<TimeSummary> {
    if (input.memberId) this.requireMember(input.memberId);
    if (input.projectId) this.requireProject(input.projectId);
    const from = input.from === undefined ? undefined : assertDay(input.from, "from");
    const to = input.to === undefined ? undefined : assertDay(input.to, "to");
    if (from && to && from > to) throw new StudioError("invalid", "from must be on or before to.");
    const entries = this.timeEntries.filter((entry) => {
      if (input.memberId && entry.memberId !== input.memberId) return false;
      if (input.projectId && entry.projectId !== input.projectId) return false;
      if (from && entry.date < from) return false;
      if (to && entry.date > to) return false;
      return true;
    });
    const byMember = new Map<string, number>();
    const byProject = new Map<string, number>();
    let totalMinutes = 0;
    for (const entry of entries) {
      totalMinutes += entry.minutes;
      byMember.set(entry.memberId, (byMember.get(entry.memberId) ?? 0) + entry.minutes);
      if (entry.projectId) byProject.set(entry.projectId, (byProject.get(entry.projectId) ?? 0) + entry.minutes);
    }
    return {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      totalMinutes,
      entryCount: entries.length,
      byMember: [...byMember.entries()]
        .map(([memberId, minutes]) => ({
          memberId,
          name: this.members.get(memberId)?.name ?? memberId,
          minutes,
        }))
        .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
      byProject: [...byProject.entries()]
        .map(([projectId, minutes]) => ({
          projectId,
          name: this.projects.get(projectId)?.name ?? projectId,
          minutes,
        }))
        .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    };
  }

  async search(input: SearchInput): Promise<Page<SearchHit>> {
    const query = requireText(input.query, "query");
    const kinds = input.kinds ? new Set(input.kinds) : undefined;
    const hits: SearchHit[] = [];
    for (const entry of this.corpus()) {
      if (kinds && !kinds.has(entry.kind)) continue;
      const titleHit = includesFold(entry.title, query);
      const fieldHits = entry.fields.filter((field) => includesFold(field, query)).length;
      const score = (titleHit ? 2 : 0) + fieldHits;
      if (score === 0) continue;
      const snippetSource = titleHit
        ? entry.title
        : (entry.fields.find((field) => includesFold(field, query)) ?? entry.title);
      hits.push({
        kind: entry.kind,
        id: entry.id,
        title: entry.title,
        snippet: snippet(snippetSource),
        score,
      });
    }
    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    return paginate(hits, input.limit);
  }

  async whoami(): Promise<ActorRecord> {
    return { actor: this.actor() };
  }

  async workspaceContext(): Promise<WorkspaceContext> {
    return {
      workspace: { name: this.config.workspaceName, adapter: this.source },
      actor: this.actor(),
      counts: {
        clients: this.clients.size,
        projects: this.projects.size,
        milestones: this.milestones.size,
        tasks: this.tasks.size,
        comments: this.comments.length,
        leads: this.leads.size,
        proposals: this.proposals.size,
        members: this.members.size,
        docs: this.docs.size,
        reminders: this.reminders.length,
        timeEntries: this.timeEntries.length,
        links: this.links.length,
      },
      integrations: this.config.integrations,
      persistence: "process_memory",
    };
  }

  async linkEntities(input: LinkEntitiesInput): Promise<LinkRecord> {
    this.requireEntity(input.fromKind, input.fromId);
    this.requireEntity(input.toKind, input.toId);
    if (input.fromKind === input.toKind && input.fromId === input.toId) {
      throw new StudioError("invalid", "Cannot link a record to itself.");
    }
    const relation = requireText(input.relation, "relation");
    const existing = this.links.find(
      (link) =>
        link.from.kind === input.fromKind &&
        link.from.id === input.fromId &&
        link.to.kind === input.toKind &&
        link.to.id === input.toId &&
        link.relation === relation,
    );
    if (existing) return { link: existing };
    const link: EntityLink = {
      id: createId("lnk"),
      from: { kind: input.fromKind, id: input.fromId },
      to: { kind: input.toKind, id: input.toId },
      relation,
      createdAt: nowIso(),
    };
    this.links.push(link);
    return { link };
  }

  private actor(): Actor {
    const email = this.config.actor.email;
    const member = [...this.members.values()].find(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
    );
    return {
      id: member?.id ?? "actor_local",
      name: this.config.actor.name,
      email,
      role: this.config.actor.role,
    };
  }

  private clientMatches(client: Client, query: string): boolean {
    return matchesAny(query, [
      client.name,
      client.industry,
      client.notes,
      client.primaryContact?.name,
      client.primaryContact?.email,
    ]);
  }

  private readContact(contact: Contact): Contact {
    const name = contact.name?.trim();
    const email = contact.email ? assertEmail(contact.email, "primaryContact.email") : undefined;
    if (!name && !email) {
      throw new StudioError("invalid", "primaryContact needs a name or an email.");
    }
    return {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    };
  }

  private readRelated(kind: EntityKind | undefined, id: string | undefined): Reminder["related"] {
    if (kind === undefined && id === undefined) return undefined;
    if (kind === undefined || id === undefined) {
      throw new StudioError("invalid", "relatedKind and relatedId must be provided together.");
    }
    this.requireEntity(kind, id);
    return { kind, id };
  }

  private requireEntity(kind: EntityKind, id: string): void {
    const found = (() => {
      switch (kind) {
        case "client":
          return this.clients.has(id);
        case "project":
          return this.projects.has(id);
        case "milestone":
          return this.milestones.has(id);
        case "task":
          return this.tasks.has(id);
        case "lead":
          return this.leads.has(id);
        case "proposal":
          return this.proposals.has(id);
        case "member":
          return this.members.has(id);
        case "doc":
          return this.docs.has(id);
        case "reminder":
          return this.reminders.some((reminder) => reminder.id === id);
        case "time_entry":
          return this.timeEntries.some((entry) => entry.id === id);
        default:
          return false;
      }
    })();
    if (!found) throw new StudioError("not_found", `${kind} ${id} not found.`);
  }

  private requireClient(id: string): Client {
    const client = this.clients.get(id);
    if (!client) throw new StudioError("not_found", `Client ${id} not found.`);
    return client;
  }

  private requireProject(id: string): Project {
    const project = this.projects.get(id);
    if (!project) throw new StudioError("not_found", `Project ${id} not found.`);
    return project;
  }

  private requireMilestone(id: string): Milestone {
    const milestone = this.milestones.get(id);
    if (!milestone) throw new StudioError("not_found", `Milestone ${id} not found.`);
    return milestone;
  }

  private requireMilestoneOnProject(id: string, projectId: string): Milestone {
    const milestone = this.requireMilestone(id);
    if (milestone.projectId !== projectId) {
      throw new StudioError("invalid", `Milestone ${id} does not belong to project ${projectId}.`);
    }
    return milestone;
  }

  private requireTask(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) throw new StudioError("not_found", `Task ${id} not found.`);
    return task;
  }

  private requireMember(id: string): Member {
    const member = this.members.get(id);
    if (!member) throw new StudioError("not_found", `Member ${id} not found.`);
    return member;
  }

  private requireLead(id: string): Lead {
    const lead = this.leads.get(id);
    if (!lead) throw new StudioError("not_found", `Lead ${id} not found.`);
    return lead;
  }

  private requireProposal(id: string): Proposal {
    const proposal = this.proposals.get(id);
    if (!proposal) throw new StudioError("not_found", `Proposal ${id} not found.`);
    return proposal;
  }

  private requireDoc(id: string): Doc {
    const doc = this.docs.get(id);
    if (!doc) throw new StudioError("not_found", `Doc ${id} not found.`);
    return doc;
  }

  private corpus(): CorpusEntry[] {
    const entries: CorpusEntry[] = [];
    for (const client of this.clients.values()) {
      entries.push({
        kind: "client",
        id: client.id,
        title: client.name,
        fields: [client.industry, client.notes, client.primaryContact?.name, client.primaryContact?.email].filter(
          isString,
        ),
      });
    }
    for (const project of this.projects.values()) {
      entries.push({
        kind: "project",
        id: project.id,
        title: project.name,
        fields: [project.phase, project.description].filter(isString),
      });
    }
    for (const milestone of this.milestones.values()) {
      entries.push({
        kind: "milestone",
        id: milestone.id,
        title: milestone.name,
        fields: [milestone.description].filter(isString),
      });
    }
    for (const task of this.tasks.values()) {
      entries.push({
        kind: "task",
        id: task.id,
        title: task.title,
        fields: [task.description].filter(isString),
      });
    }
    for (const lead of this.leads.values()) {
      entries.push({
        kind: "lead",
        id: lead.id,
        title: lead.name,
        fields: [lead.company, lead.email, lead.source, lead.notes].filter(isString),
      });
    }
    for (const proposal of this.proposals.values()) {
      entries.push({
        kind: "proposal",
        id: proposal.id,
        title: proposal.title,
        fields: [proposal.summary].filter(isString),
      });
    }
    for (const member of this.members.values()) {
      entries.push({
        kind: "member",
        id: member.id,
        title: member.name,
        fields: [member.email, member.role],
      });
    }
    for (const doc of this.docs.values()) {
      entries.push({ kind: "doc", id: doc.id, title: doc.title, fields: [doc.body] });
    }
    for (const reminder of this.reminders) {
      entries.push({
        kind: "reminder",
        id: reminder.id,
        title: reminder.title,
        fields: [reminder.notes].filter(isString),
      });
    }
    for (const entry of this.timeEntries) {
      entries.push({
        kind: "time_entry",
        id: entry.id,
        title: entry.note ?? `${entry.minutes}m`,
        fields: [entry.note].filter(isString),
      });
    }
    return entries;
  }
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

function snippet(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}
