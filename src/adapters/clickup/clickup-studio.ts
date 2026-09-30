import type { StudioConfig } from "../../config/env.js";
import { parseStudioConfig } from "../../config/env.js";
import type { Client, Member, Milestone, Project, Task, TaskComment } from "../../types/entities.js";
import { MILESTONE_STATUSES, TASK_STATUSES } from "../../types/entities.js";
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
import type { StudioMethod, StudioOs } from "../../types/studio.js";
import {
  assertDay,
  assertPatch,
  countBy,
  includesFold,
  matchesAny,
  paginate,
  requireText,
  sortByUpdatedDesc,
  todayUtc,
} from "../memory/support.js";
import type { ClickUpComment, ClickUpFolder, ClickUpList, ClickUpSpace, ClickUpStatus, ClickUpTask, ClickUpTeam, ClickUpUser } from "./api-types.js";
import { ClickUpApiError, ClickUpClient, type ClickUpQuery } from "./http.js";
import {
  CLICKUP_MAPPING,
  CLIENT_SPACE_NAME,
  HIERARCHY_CACHE_MS,
  MAX_TASK_PAGES,
  MEMBER_CACHE_MS,
  MILESTONE_TAG,
  TASK_PAGE_SIZE,
  clickUpId,
  clickUpMillisFromDay,
  clickUpUserId,
  dayFromClickUp,
  findClientSpace,
  isArchiveListName,
  isDefaultHiddenList,
  isMilestoneTask,
  isTemplateClientName,
  milestoneStatusToTaskStatus,
  pickClickUpStatus,
  projectStatusFromList,
  taskPriorityToClickUp,
  timestampOrEpoch,
  toClient,
  toCommentRecord,
  toMember,
  toMilestoneRecord,
  toProject,
  toTaskRecord,
} from "./mapping.js";

interface StoredList {
  id: string;
  name: string;
  content: string;
  archived: boolean;
  dueDate?: string;
  startDate?: string;
  taskCount: number;
  statuses: ClickUpStatus[];
  createdAt: string;
  updatedAt: string;
  folderId: string;
}

interface StoredFolder {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  spaceId: string;
  lists: StoredList[];
  archivedLists?: StoredList[];
}

interface Hierarchy {
  teamName: string;
  spaceId: string;
  spaceName: string;
  folders: StoredFolder[];
}

interface LocatedList extends StoredList {
  clientId: string;
}

export interface ClickUpStudioDeps {
  fetchImpl?: typeof fetch;
  /** Spacing between ClickUp requests. Defaults to 600ms. */
  minIntervalMs?: number;
  /** How long folder and list data is reused. Defaults to 60 seconds. */
  cacheTtlMs?: number;
  memberCacheTtlMs?: number;
  /** Overrides the space name used when CLICKUP_SPACE_ID is unset. */
  spaceName?: string;
}

/**
 * Live StudioOs backed by ClickUp.
 *
 * Clients are folders in the Client Work space. Projects are the lists inside
 * those folders. Tasks are ClickUp tasks. Milestones are tasks tagged
 * `milestone` (or an affirmative milestone custom field). `_TEMPLATE*` folders
 * and `_archive*` lists are not part of the default delivery view.
 */
export class ClickUpStudio implements StudioOs {
  readonly source = "clickup" as const;

  private readonly http: ClickUpClient;
  private readonly cacheTtlMs: number;
  private readonly memberCacheTtlMs: number;
  private hierarchyCache?: { at: number; value: Hierarchy };
  private hierarchyInflight?: Promise<Hierarchy>;
  private hierarchyInflightGeneration = -1;
  private hierarchyGeneration = 0;
  private teamCache?: { at: number; team: ClickUpTeam };
  private userCache?: ClickUpUser;

  constructor(
    private readonly options: {
      token: string;
      teamId: string;
      spaceId?: string;
      spaceName: string;
      config: StudioConfig;
    },
    deps: ClickUpStudioDeps = {},
  ) {
    this.http = new ClickUpClient({
      token: options.token,
      fetchImpl: deps.fetchImpl,
      minIntervalMs: deps.minIntervalMs,
    });
    this.cacheTtlMs = deps.cacheTtlMs ?? HIERARCHY_CACHE_MS;
    this.memberCacheTtlMs = deps.memberCacheTtlMs ?? MEMBER_CACHE_MS;
  }

  listClients(input: ListClientsInput): Promise<Page<Client>> {
    return this.guard(() => this.listClientsInner(input));
  }

  getClient(input: IdInput): Promise<ClientRecord> {
    return this.guard(async () => ({ client: toClient(await this.requireClient(input.id)) }));
  }

  createClient(input: CreateClientInput): Promise<ClientRecord> {
    return this.guard(() => this.createClientInner(input));
  }

  updateClient(input: UpdateClientInput): Promise<ClientRecord> {
    return this.guard(() => this.updateClientInner(input));
  }

  searchClients(input: SearchClientsInput): Promise<Page<Client>> {
    return this.guard(() => this.listClientsInner({ query: requireText(input.query, "query"), limit: input.limit }));
  }

  listProjects(input: ListProjectsInput): Promise<Page<Project>> {
    return this.guard(() => this.listProjectsInner(input));
  }

  getProject(input: IdInput): Promise<ProjectRecord> {
    return this.guard(async () => ({ project: toProject(await this.requireList(input.id)) }));
  }

  createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    return this.guard(() => this.createProjectInner(input));
  }

  updateProject(input: UpdateProjectInput): Promise<ProjectRecord> {
    return this.guard(() => this.updateProjectInner(input));
  }

  listMilestones(input: ListMilestonesInput): Promise<Page<Milestone>> {
    return this.guard(() => this.listMilestonesInner(input));
  }

  upsertMilestone(input: UpsertMilestoneInput): Promise<MilestoneRecord> {
    return this.guard(() => this.upsertMilestoneInner(input));
  }

  listTasks(input: ListTasksInput): Promise<Page<Task>> {
    return this.guard(() => this.listTasksInner(input));
  }

  getTask(input: IdInput): Promise<TaskRecord> {
    return this.guard(() => this.getTaskInner(input.id));
  }

  createTask(input: CreateTaskInput): Promise<TaskRecord> {
    return this.guard(() => this.createTaskInner(input));
  }

  updateTask(input: UpdateTaskInput): Promise<TaskRecord> {
    return this.guard(() => this.updateTaskInner(input));
  }

  commentOnTask(input: CommentOnTaskInput): Promise<TaskCommentRecord> {
    return this.guard(() => this.commentOnTaskInner(input));
  }

  deliveryStatus(input: IdInput): Promise<DeliveryStatus> {
    return this.guard(() => this.deliveryStatusInner(input.id));
  }

  listLeads(_input: ListLeadsInput): Promise<Page<never>> {
    return this.guard(async () => this.notImplemented("listLeads"));
  }

  getLead(_input: IdInput): Promise<LeadRecord> {
    return this.guard(async () => this.notImplemented("getLead"));
  }

  createLead(_input: CreateLeadInput): Promise<LeadRecord> {
    return this.guard(async () => this.notImplemented("createLead"));
  }

  updateLead(_input: UpdateLeadInput): Promise<LeadRecord> {
    return this.guard(async () => this.notImplemented("updateLead"));
  }

  listProposals(_input: ListProposalsInput): Promise<Page<never>> {
    return this.guard(async () => this.notImplemented("listProposals"));
  }

  getProposal(_input: IdInput): Promise<ProposalRecord> {
    return this.guard(async () => this.notImplemented("getProposal"));
  }

  createProposal(_input: CreateProposalInput): Promise<ProposalRecord> {
    return this.guard(async () => this.notImplemented("createProposal"));
  }

  pipelineSummary(): Promise<PipelineSummary> {
    return this.guard(async () => this.notImplemented("pipelineSummary"));
  }

  listMembers(input: ListMembersInput): Promise<Page<Member>> {
    return this.guard(() => this.listMembersInner(input));
  }

  resolveMember(input: ResolveMemberInput): Promise<MemberMatches> {
    return this.guard(() => this.resolveMemberInner(input));
  }

  searchDocs(_input: SearchDocsInput): Promise<Page<never>> {
    return this.guard(async () => this.notImplemented("searchDocs"));
  }

  getDoc(_input: IdInput): Promise<DocRecord> {
    return this.guard(async () => this.notImplemented("getDoc"));
  }

  createDoc(_input: CreateDocInput): Promise<DocRecord> {
    return this.guard(async () => this.notImplemented("createDoc"));
  }

  createReminder(_input: CreateReminderInput): Promise<ReminderRecord> {
    return this.guard(async () => this.notImplemented("createReminder"));
  }

  listReminders(_input: ListRemindersInput): Promise<Page<never>> {
    return this.guard(async () => this.notImplemented("listReminders"));
  }

  logTime(_input: LogTimeInput): Promise<TimeEntryRecord> {
    return this.guard(async () => this.notImplemented("logTime"));
  }

  timeSummary(_input: TimeSummaryInput): Promise<TimeSummary> {
    return this.guard(async () => this.notImplemented("timeSummary"));
  }

  search(input: SearchInput): Promise<Page<SearchHit>> {
    return this.guard(() => this.searchInner(input));
  }

  whoami(): Promise<ActorRecord> {
    return this.guard(async () => ({ actor: await this.loadActor() }));
  }

  workspaceContext(): Promise<WorkspaceContext> {
    return this.guard(() => this.workspaceContextInner());
  }

  linkEntities(input: LinkEntitiesInput): Promise<LinkRecord> {
    return this.guard(() => this.linkEntitiesInner(input));
  }

  private async listClientsInner(input: ListClientsInput): Promise<Page<Client>> {
    const hierarchy = await this.hierarchy();
    const query = input.query?.trim();
    const items = this.clientFolders(hierarchy)
      .filter((folder) => {
        const client = toClient(folder);
        if (input.status && client.status !== input.status) return false;
        if (query && !includesFold(client.name, query)) return false;
        return true;
      })
      .map((folder) => toClient(folder));
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  private async createClientInner(input: CreateClientInput): Promise<ClientRecord> {
    const name = requireText(input.name, "name");
    if (isTemplateClientName(name)) {
      throw new StudioError("invalid", "Folder names starting with _TEMPLATE are reserved and are not created as clients.");
    }
    rejectClientFields(input);
    const hierarchy = await this.hierarchy();
    const created = await this.http.post<ClickUpFolder>(`/space/${encodeURIComponent(hierarchy.spaceId)}/folder`, { name });
    this.invalidateHierarchy();
    const folder = folderFromRaw(created, hierarchy.spaceId);
    if (!folder) throw new StudioError("invalid", "ClickUp did not return the new client folder.");
    return { client: toClient(folder) };
  }

  private async updateClientInner(input: UpdateClientInput): Promise<ClientRecord> {
    assertPatch(input, ["id"]);
    rejectClientFields(input);
    await this.requireClient(input.id);
    if (input.name !== undefined) {
      await this.http.put(`/folder/${encodeURIComponent(input.id)}`, { name: requireText(input.name, "name") });
      this.invalidateHierarchy();
    }
    return { client: toClient(await this.requireClient(input.id)) };
  }

  private async listProjectsInner(input: ListProjectsInput): Promise<Page<Project>> {
    const hierarchy = await this.hierarchy();
    if (input.clientId) await this.requireClient(input.clientId, hierarchy);
    const query = input.query?.trim();
    const includeArchived = input.status === "archived" || Boolean(query);
    const projects: Project[] = [];
    for (const folder of this.clientFolders(hierarchy)) {
      if (input.clientId && folder.id !== input.clientId) continue;
      const lists = await this.listsOnFolder(folder, includeArchived);
      for (const list of lists) {
        const hidden = isDefaultHiddenList(list);
        const queryHit = query ? matchesAny(query, [list.name, list.content]) : false;
        if (hidden && input.status !== "archived" && !queryHit) continue;
        if (input.status && projectStatusFromList(list) !== input.status) continue;
        if (query && !queryHit) continue;
        projects.push(toProject({ ...list, clientId: folder.id }));
      }
    }
    return paginate(sortByUpdatedDesc(projects), input.limit);
  }

  private async createProjectInner(input: CreateProjectInput): Promise<ProjectRecord> {
    rejectProjectFields(input);
    await this.requireClient(input.clientId);
    const name = requireText(input.name, "name");
    const body: Record<string, unknown> = { name };
    if (input.description !== undefined) body.content = requireText(input.description, "description");
    if (input.startDate !== undefined) body.start_date = clickUpMillisFromDay(assertDay(input.startDate, "startDate"));
    if (input.dueDate !== undefined) {
      body.due_date = clickUpMillisFromDay(assertDay(input.dueDate, "dueDate"));
      body.due_date_time = false;
    }
    const created = await this.http.post<ClickUpList>(`/folder/${encodeURIComponent(input.clientId)}/list`, body);
    this.invalidateHierarchy();
    const list = storedList(created, input.clientId);
    if (!list.id) throw new StudioError("invalid", "ClickUp did not return the new list.");
    return { project: toProject({ ...list, clientId: input.clientId }) };
  }

  private async updateProjectInner(input: UpdateProjectInput): Promise<ProjectRecord> {
    assertPatch(input, ["id"]);
    rejectProjectFields(input);
    const current = await this.requireList(input.id);
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = requireText(input.name, "name");
    if (input.description !== undefined) body.content = requireText(input.description, "description");
    if (input.startDate !== undefined) body.start_date = clickUpMillisFromDay(assertDay(input.startDate, "startDate"));
    if (input.dueDate !== undefined) {
      body.due_date = clickUpMillisFromDay(assertDay(input.dueDate, "dueDate"));
      body.due_date_time = false;
    }
    if (Object.keys(body).length > 0) {
      await this.http.put(`/list/${encodeURIComponent(input.id)}`, body);
      this.invalidateHierarchy();
    }
    return { project: toProject(await this.requireList(current.id)) };
  }

  private async listMilestonesInner(input: ListMilestonesInput): Promise<Page<Milestone>> {
    const list = await this.requireList(input.projectId);
    const raw = await this.tasksForLists([list.id]);
    const items = raw
      .filter((task) => isMilestoneTask(task))
      .map((task) => toMilestoneRecord(task, list.id))
      .filter((milestone) => !input.status || milestone.status === input.status);
    items.sort(
      (left, right) =>
        (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") || left.name.localeCompare(right.name),
    );
    return paginate(items, input.limit);
  }

  private async upsertMilestoneInner(input: UpsertMilestoneInput): Promise<MilestoneRecord> {
    if (input.id) {
      assertPatch(input, ["id"]);
      const existing = await this.fetchTask(input.id);
      if (!isMilestoneTask(existing)) throw new StudioError("not_found", `Milestone ${input.id} not found.`);
      const listId = await this.projectIdForTask(existing);
      if (input.projectId && input.projectId !== listId) {
        throw new StudioError("invalid", "Milestones cannot move between projects.");
      }
      await this.putTask(input.id, await this.milestonePatch(input, listId));
      const updated = await this.fetchTask(input.id);
      return { milestone: toMilestoneRecord(updated, listId) };
    }

    if (!input.projectId || !input.name?.trim()) {
      throw new StudioError(
        "invalid",
        "Provide id to update a milestone, or projectId and name to create or update by name.",
      );
    }
    const list = await this.requireList(input.projectId);
    const name = requireText(input.name, "name");
    const raw = await this.tasksForLists([list.id]);
    const match = raw.find(
      (task) => isMilestoneTask(task) && (task.name ?? "").trim().toLowerCase() === name.toLowerCase(),
    );
    if (match) {
      const id = clickUpId(match.id);
      await this.putTask(id, await this.milestonePatch({ ...input, name }, list.id));
      return { milestone: toMilestoneRecord(await this.fetchTask(id), list.id) };
    }

    const statuses = await this.statusesFor(list);
    const body: Record<string, unknown> = {
      name,
      tags: [MILESTONE_TAG],
      status: pickClickUpStatus(milestoneStatusToTaskStatus(input.status ?? "pending"), statuses),
      notify_all: false,
    };
    if (input.description !== undefined) {
      const description = requireText(input.description, "description");
      body.description = description;
      body.markdown_description = description;
    }
    if (input.dueDate !== undefined) {
      body.due_date = clickUpMillisFromDay(assertDay(input.dueDate, "dueDate"));
      body.due_date_time = false;
    }
    const created = await this.http.post<ClickUpTask>(`/list/${encodeURIComponent(list.id)}/task`, body);
    this.invalidateHierarchy();
    const createdId = clickUpId(created.id);
    if (!createdId) throw new StudioError("invalid", "ClickUp did not return the new milestone task.");
    return { milestone: toMilestoneRecord(created.name ? created : await this.fetchTask(createdId), list.id) };
  }

  private async listTasksInner(input: ListTasksInput): Promise<Page<Task>> {
    if (input.assigneeId) await this.requireMember(input.assigneeId);
    const listIds = await this.taskListIds(input);
    const allowed = new Set(listIds);
    const raw = await this.tasksForLists(listIds);
    const milestoneIds = new Set(raw.filter((task) => isMilestoneTask(task)).map((task) => clickUpId(task.id)));
    const query = input.query?.trim();
    const fallback = listIds.length === 1 ? (listIds[0] ?? "") : "";
    const items = raw
      .filter((task) => !isMilestoneTask(task))
      .map((task) => toTaskRecord(task, projectIdOf(task, fallback), milestoneIds))
      .filter((task) => {
        if (!task.projectId || !allowed.has(task.projectId)) return false;
        if (input.projectId && task.projectId !== input.projectId) return false;
        if (input.milestoneId && task.milestoneId !== input.milestoneId) return false;
        if (input.assigneeId && task.assigneeId !== input.assigneeId) return false;
        if (input.status && task.status !== input.status) return false;
        if (query && !matchesAny(query, [task.title, task.description])) return false;
        return true;
      });
    return paginate(sortByUpdatedDesc(items), input.limit);
  }

  private async getTaskInner(id: string): Promise<TaskRecord> {
    const task = await this.fetchTask(id);
    const projectId = await this.projectIdForTask(task);
    const parent = clickUpId(task.parent);
    const milestoneIds = new Set<string>();
    if (parent) {
      try {
        const parentTask = await this.fetchTask(parent);
        if (isMilestoneTask(parentTask)) milestoneIds.add(parent);
      } catch (error) {
        if (!(error instanceof StudioError) || !error.message.startsWith("Task ")) throw error;
      }
    }
    return {
      task: toTaskRecord(task, projectId, milestoneIds),
      comments: await this.fetchComments(id),
    };
  }

  private async createTaskInner(input: CreateTaskInput): Promise<TaskRecord> {
    const list = await this.requireList(input.projectId);
    if (input.assigneeId) await this.requireMember(input.assigneeId);
    if (input.milestoneId) await this.requireMilestoneOnList(input.milestoneId, list.id);
    const body: Record<string, unknown> = {
      name: requireText(input.title, "title"),
      status: pickClickUpStatus(input.status ?? "todo", await this.statusesFor(list)),
      priority: taskPriorityToClickUp(input.priority ?? "normal"),
      notify_all: false,
    };
    if (input.description !== undefined) {
      const description = requireText(input.description, "description");
      body.description = description;
      body.markdown_description = description;
    }
    if (input.assigneeId !== undefined) body.assignees = [clickUpUserId(input.assigneeId, "assigneeId")];
    if (input.dueDate !== undefined) {
      body.due_date = clickUpMillisFromDay(assertDay(input.dueDate, "dueDate"));
      body.due_date_time = false;
    }
    if (input.milestoneId !== undefined) body.parent = input.milestoneId;
    const created = await this.http.post<ClickUpTask>(`/list/${encodeURIComponent(list.id)}/task`, body);
    this.invalidateHierarchy();
    const createdId = clickUpId(created.id);
    if (!createdId) throw new StudioError("invalid", "ClickUp did not return the new task id.");
    const milestoneIds = input.milestoneId ? new Set([input.milestoneId]) : new Set<string>();
    const task = toTaskRecord(created.name ? created : await this.fetchTask(createdId), list.id, milestoneIds);
    return { task, comments: [] };
  }

  private async updateTaskInner(input: UpdateTaskInput): Promise<TaskRecord> {
    assertPatch(input, ["id"]);
    const existing = await this.fetchTask(input.id);
    const listId = await this.projectIdForTask(existing);
    const list = await this.requireList(listId);
    if (input.milestoneId) await this.requireMilestoneOnList(input.milestoneId, listId);
    if (input.assigneeId) await this.requireMember(input.assigneeId);
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.name = requireText(input.title, "title");
    if (input.description !== undefined) {
      const description = requireText(input.description, "description");
      body.description = description;
      body.markdown_description = description;
    }
    if (input.status !== undefined) body.status = pickClickUpStatus(input.status, await this.statusesFor(list));
    if (input.priority !== undefined) body.priority = taskPriorityToClickUp(input.priority);
    if (input.dueDate !== undefined) {
      body.due_date = clickUpMillisFromDay(assertDay(input.dueDate, "dueDate"));
      body.due_date_time = false;
    }
    if (input.milestoneId !== undefined) body.parent = input.milestoneId;
    if (input.assigneeId !== undefined) {
      const next = clickUpUserId(input.assigneeId, "assigneeId");
      const remove = (existing.assignees ?? [])
        .map((user) => clickUpId(user.id))
        .filter((id) => /^\d+$/.test(id))
        .map((id) => Number(id))
        .filter((id) => id !== next);
      body.assignees = { add: [next], rem: remove };
    }
    if (Object.keys(body).length > 0) await this.putTask(input.id, body);
    return this.getTaskInner(input.id);
  }

  private async commentOnTaskInner(input: CommentOnTaskInput): Promise<TaskCommentRecord> {
    const task = await this.fetchTask(input.taskId);
    await this.projectIdForTask(task);
    const body = requireText(input.body, "body");
    if (input.authorId) {
      const actor = await this.loadActor();
      if (input.authorId !== actor.id) {
        throw new StudioError(
          "invalid",
          `ClickUp comments are posted as the API token user (${actor.id}). Omit authorId or pass that member id.`,
        );
      }
    }
    const created = await this.http.post<ClickUpComment>(`/task/${encodeURIComponent(input.taskId)}/comment`, {
      comment_text: body,
      notify_all: false,
    });
    const comment = toCommentRecord(
      {
        ...created,
        comment_text: commentBody(created) || body,
        user: created.user ?? { id: (await this.loadActor()).id },
      },
      input.taskId,
      body,
    );
    if (!comment.id) comment.id = `comment_${input.taskId}_${Date.now()}`;
    return { comment };
  }

  private async deliveryStatusInner(projectId: string): Promise<DeliveryStatus> {
    const list = await this.requireList(projectId);
    const client = toClient(await this.requireClient(list.clientId));
    const raw = await this.tasksForLists([list.id]);
    const milestoneTasks = raw.filter((task) => isMilestoneTask(task));
    const milestoneIds = new Set(milestoneTasks.map((task) => clickUpId(task.id)));
    const milestones = milestoneTasks.map((task) => toMilestoneRecord(task, list.id));
    const tasks = raw
      .filter((task) => !isMilestoneTask(task))
      .map((task) => toTaskRecord(task, list.id, milestoneIds));
    const today = todayUtc();
    const openMilestones = milestones
      .filter((milestone) => milestone.status !== "done")
      .sort(
        (left, right) =>
          (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") || left.name.localeCompare(right.name),
      );
    const blockedTasks = tasks.filter((task) => task.status === "blocked");
    const overdue = milestones.some(
      (milestone) => milestone.status !== "done" && milestone.dueDate !== undefined && milestone.dueDate < today,
    );
    const project = toProject(list);
    let health: DeliveryStatus["health"] = "on_track";
    if (project.status === "delivered") health = "delivered";
    else if (blockedTasks.length > 0 || milestones.some((milestone) => milestone.status === "blocked")) health = "blocked";
    else if (overdue) health = "at_risk";
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

  private async listMembersInner(input: ListMembersInput): Promise<Page<Member>> {
    const query = input.query?.trim();
    const items = (await this.loadMembers())
      .filter((member) => {
        if (input.active !== undefined && member.active !== input.active) return false;
        if (query && !matchesAny(query, [member.name, member.email, member.role])) return false;
        return true;
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    return paginate(items, input.limit);
  }

  private async resolveMemberInner(input: ResolveMemberInput): Promise<MemberMatches> {
    const query = requireText(input.query, "query").toLowerCase();
    const matches = (await this.loadMembers()).filter(
      (member) =>
        member.email.toLowerCase() === query ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.role.toLowerCase().includes(query),
    );
    matches.sort((left, right) => {
      const rank = (member: Member) => (member.email.toLowerCase() === query ? 0 : 1);
      return rank(left) - rank(right) || left.name.localeCompare(right.name);
    });
    const page = paginate(matches, input.limit);
    return { matches: page.items, total: page.total };
  }

  private async searchInner(input: SearchInput): Promise<Page<SearchHit>> {
    const query = requireText(input.query, "query");
    const kinds = input.kinds ? new Set(input.kinds) : undefined;
    const hits: SearchHit[] = [];
    const hierarchy = await this.hierarchy();
    if (!kinds || kinds.has("client")) {
      for (const folder of this.clientFolders(hierarchy)) {
        pushHit(hits, "client", folder.id, folder.name, [], query);
      }
    }
    if (!kinds || kinds.has("project")) {
      for (const list of this.defaultLists(hierarchy)) {
        pushHit(hits, "project", list.id, list.name, [list.content], query);
      }
    }
    if (!kinds || kinds.has("member")) {
      for (const member of await this.loadMembers()) {
        pushHit(hits, "member", member.id, member.name, [member.email, member.role], query);
      }
    }
    if (!kinds || kinds.has("task") || kinds.has("milestone")) {
      const lists = this.defaultLists(hierarchy);
      const raw = await this.tasksForLists(lists.map((list) => list.id));
      for (const task of raw) {
        const milestone = isMilestoneTask(task);
        const kind = milestone ? "milestone" : "task";
        if (kinds && !kinds.has(kind)) continue;
        const listId = projectIdOf(task, "");
        if (!lists.some((list) => list.id === listId)) continue;
        const description = task.text_content ?? task.markdown_description ?? task.description ?? "";
        pushHit(hits, kind, clickUpId(task.id), task.name?.trim() || clickUpId(task.id), [description], query);
      }
    }
    hits.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
    return paginate(hits, input.limit);
  }

  private async workspaceContextInner(): Promise<WorkspaceContext> {
    const hierarchy = await this.hierarchy();
    const members = await this.loadMembers();
    const lists = this.defaultLists(hierarchy);
    return {
      workspace: { name: hierarchy.teamName || this.options.config.workspaceName, adapter: this.source },
      actor: await this.loadActor(),
      counts: {
        clients: this.clientFolders(hierarchy).length,
        projects: lists.length,
        milestones: 0,
        tasks: lists.reduce((sum, list) => sum + list.taskCount, 0),
        comments: 0,
        leads: 0,
        proposals: 0,
        members: members.length,
        docs: 0,
        reminders: 0,
        timeEntries: 0,
        links: 0,
      },
      integrations: this.options.config.integrations,
      persistence: "external",
    };
  }

  private async linkEntitiesInner(input: LinkEntitiesInput): Promise<LinkRecord> {
    if (input.fromKind !== "task" || input.toKind !== "task") {
      throw new StudioError("not_implemented", `clickup.linkEntities is not implemented. ${CLICKUP_MAPPING.linkEntities}`);
    }
    if (input.fromId === input.toId) throw new StudioError("invalid", "Cannot link a record to itself.");
    const relation = requireText(input.relation, "relation");
    await this.projectIdForTask(await this.fetchTask(input.fromId));
    await this.projectIdForTask(await this.fetchTask(input.toId));
    const existing = await this.findTaskLink(input.fromId, input.toId);
    if (existing) {
      return { link: { id: existing.id, from: { kind: "task", id: input.fromId }, to: { kind: "task", id: input.toId }, relation, createdAt: existing.createdAt } };
    }
    await this.http.post(`/task/${encodeURIComponent(input.fromId)}/link/${encodeURIComponent(input.toId)}`);
    const created = (await this.findTaskLink(input.fromId, input.toId)) ?? {
      id: `cu_link_${input.fromId}_${input.toId}`,
      createdAt: new Date().toISOString(),
    };
    return {
      link: {
        id: created.id,
        from: { kind: "task", id: input.fromId },
        to: { kind: "task", id: input.toId },
        relation,
        createdAt: created.createdAt,
      },
    };
  }

  private async taskListIds(input: ListTasksInput): Promise<string[]> {
    if (input.milestoneId) {
      const milestone = await this.fetchTask(input.milestoneId);
      if (!isMilestoneTask(milestone)) throw new StudioError("not_found", `Milestone ${input.milestoneId} not found.`);
      const listId = await this.projectIdForTask(milestone);
      if (input.projectId && input.projectId !== listId) {
        throw new StudioError("invalid", `Milestone ${input.milestoneId} does not belong to project ${input.projectId}.`);
      }
      return [listId];
    }
    if (input.projectId) return [(await this.requireList(input.projectId)).id];
    return this.defaultLists(await this.hierarchy()).map((list) => list.id);
  }

  private async milestonePatch(input: UpsertMilestoneInput, listId: string): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = requireText(input.name, "name");
    if (input.description !== undefined) {
      const description = requireText(input.description, "description");
      body.description = description;
      body.markdown_description = description;
    }
    if (input.status !== undefined) {
      const list = await this.requireList(listId);
      body.status = pickClickUpStatus(milestoneStatusToTaskStatus(input.status), await this.statusesFor(list));
    }
    if (input.dueDate !== undefined) {
      body.due_date = clickUpMillisFromDay(assertDay(input.dueDate, "dueDate"));
      body.due_date_time = false;
    }
    return body;
  }

  private async putTask(taskId: string, body: Record<string, unknown>): Promise<void> {
    if (Object.keys(body).length === 0) return;
    await this.http.put(`/task/${encodeURIComponent(taskId)}`, body);
    this.invalidateHierarchy();
  }

  private async fetchComments(taskId: string): Promise<TaskComment[]> {
    const body = await this.http.get<{ comments?: ClickUpComment[] }>(`/task/${encodeURIComponent(taskId)}/comment`);
    return (body.comments ?? [])
      .map((comment) => toCommentRecord(comment, taskId))
      .filter((comment) => comment.body.length > 0)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }

  private async fetchTask(id: string): Promise<ClickUpTask> {
    try {
      return await this.http.get<ClickUpTask>(`/task/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ClickUpApiError && error.status === 404) {
        throw new StudioError("not_found", `Task ${id} not found.`);
      }
      throw error;
    }
  }

  private async requireMilestoneOnList(id: string, listId: string): Promise<void> {
    const task = await this.fetchTask(id);
    if (!isMilestoneTask(task)) throw new StudioError("not_found", `Milestone ${id} not found.`);
    const taskList = clickUpId(task.list?.id);
    if (taskList && taskList !== listId) {
      throw new StudioError("invalid", `Milestone ${id} does not belong to project ${listId}.`);
    }
  }

  private async projectIdForTask(task: ClickUpTask): Promise<string> {
    const listId = clickUpId(task.list?.id);
    if (!listId) throw new StudioError("not_found", `Task ${clickUpId(task.id)} not found.`);
    await this.requireList(listId);
    return listId;
  }

  private async findTaskLink(fromId: string, toId: string): Promise<{ id: string; createdAt: string } | undefined> {
    const task = await this.fetchTask(fromId);
    const link = (task.linked_tasks ?? []).find((item) => clickUpId(item.task_id) === toId);
    if (!link) return undefined;
    return {
      id: clickUpId(link.link_id) || `cu_link_${fromId}_${toId}`,
      createdAt: timestampOrEpoch(link.date_created),
    };
  }

  private async tasksForLists(listIds: string[]): Promise<ClickUpTask[]> {
    const ids = [...new Set(listIds.filter((id) => id.length > 0))];
    if (ids.length === 0) return [];
    if (ids.length === 1) {
      const listId = ids[0];
      if (!listId) return [];
      return this.collectTasks(`/list/${encodeURIComponent(listId)}/task`, {
        archived: "false",
        include_closed: "true",
        subtasks: "true",
        order_by: "updated",
        reverse: "true",
      });
    }
    const tasks: ClickUpTask[] = [];
    for (let index = 0; index < ids.length; index += 20) {
      const chunk = ids.slice(index, index + 20);
      tasks.push(
        ...(await this.collectTasks(`/team/${encodeURIComponent(this.options.teamId)}/task`, {
          "list_ids[]": chunk,
          include_closed: "true",
          subtasks: "true",
          order_by: "updated",
          reverse: "true",
        })),
      );
    }
    return dedupeTasks(tasks);
  }

  private async collectTasks(path: string, query: ClickUpQuery): Promise<ClickUpTask[]> {
    const tasks: ClickUpTask[] = [];
    for (let page = 0; page < MAX_TASK_PAGES; page += 1) {
      const body = await this.http.get<{ tasks?: ClickUpTask[] }>(path, { ...query, page: String(page) });
      const batch = body.tasks ?? [];
      tasks.push(...batch);
      if (batch.length < TASK_PAGE_SIZE) return dedupeTasks(tasks);
    }
    console.error(`[lunarcore-mcp] ClickUp task scan stopped after ${MAX_TASK_PAGES * TASK_PAGE_SIZE} tasks for ${path}`);
    return dedupeTasks(tasks);
  }

  private async statusesFor(list: StoredList): Promise<ClickUpStatus[]> {
    if (list.statuses.length > 0) return list.statuses;
    const raw = await this.http.get<ClickUpList>(`/list/${encodeURIComponent(list.id)}`);
    list.statuses = raw.statuses ?? [];
    return list.statuses;
  }

  private async listsOnFolder(folder: StoredFolder, includeArchived: boolean): Promise<StoredList[]> {
    const visible = folder.lists.filter((list) => !list.archived);
    if (!includeArchived) return visible;
    if (!folder.archivedLists) {
      const body = await this.http.get<{ lists?: ClickUpList[] }>(`/folder/${encodeURIComponent(folder.id)}/list`, {
        archived: "true",
      });
      folder.archivedLists = (body.lists ?? []).map((list) => storedList(list, folder.id)).filter((list) => list.id);
    }
    return mergeStored(folder.lists, folder.archivedLists);
  }

  private async requireClient(id: string, hierarchy?: Hierarchy): Promise<StoredFolder> {
    const tree = hierarchy ?? (await this.hierarchy());
    const folder = tree.folders.find((item) => item.id === id);
    if (folder) {
      if (isTemplateClientName(folder.name)) {
        throw new StudioError("not_found", `Folder ${id} is a _TEMPLATE folder and is not a client.`);
      }
      return folder;
    }
    const loaded = await this.tryLoadFolder(id, tree.spaceId);
    if (!loaded) throw new StudioError("not_found", `Client ${id} not found.`);
    if (isTemplateClientName(loaded.name)) {
      throw new StudioError("not_found", `Folder ${id} is a _TEMPLATE folder and is not a client.`);
    }
    return loaded;
  }

  private async requireList(id: string): Promise<LocatedList> {
    const hierarchy = await this.hierarchy();
    for (const folder of this.clientFolders(hierarchy)) {
      const list = [...folder.lists, ...(folder.archivedLists ?? [])].find((item) => item.id === id);
      if (list) return { ...list, clientId: folder.id };
    }
    let raw: ClickUpList;
    try {
      raw = await this.http.get<ClickUpList>(`/list/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ClickUpApiError && error.status === 404) {
        throw new StudioError("not_found", `Project ${id} not found.`);
      }
      throw error;
    }
    const spaceId = clickUpId(raw.space?.id);
    if (spaceId && spaceId !== hierarchy.spaceId) throw new StudioError("not_found", `Project ${id} not found.`);
    const folderId = clickUpId(raw.folder?.id);
    if (!folderId) throw new StudioError("not_found", `Project ${id} not found.`);
    const folder =
      hierarchy.folders.find((item) => item.id === folderId) ?? (await this.tryLoadFolder(folderId, hierarchy.spaceId));
    if (!folder || isTemplateClientName(folder.name) || (folder.spaceId && folder.spaceId !== hierarchy.spaceId)) {
      throw new StudioError("not_found", `Project ${id} not found.`);
    }
    const list = storedList(raw, folder.id);
    if (!list.id) throw new StudioError("not_found", `Project ${id} not found.`);
    return { ...list, clientId: folder.id };
  }

  private async tryLoadFolder(id: string, spaceId: string): Promise<StoredFolder | undefined> {
    try {
      const raw = await this.http.get<ClickUpFolder>(`/folder/${encodeURIComponent(id)}`);
      const folder = folderFromRaw(raw, spaceId);
      if (!folder) return undefined;
      if (folder.spaceId && folder.spaceId !== spaceId) return undefined;
      return folder;
    } catch (error) {
      if (error instanceof ClickUpApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  private async loadActor(): Promise<Actor> {
    const user = await this.loadUser();
    const id = clickUpId(user.id);
    const member = (await this.loadMembers()).find((item) => item.id === id);
    return {
      id: id || "clickup_user",
      name: user.username?.trim() || member?.name || this.options.config.actor.name,
      email: user.email?.trim() || member?.email || this.options.config.actor.email,
      role: member?.role || this.options.config.actor.role,
    };
  }

  private async loadUser(): Promise<ClickUpUser> {
    if (this.userCache) return this.userCache;
    const body = await this.http.get<{ user?: ClickUpUser }>("/user");
    this.userCache = body.user ?? {};
    return this.userCache;
  }

  private async loadMembers(): Promise<Member[]> {
    const team = await this.loadTeam();
    return (team.members ?? [])
      .map((member) => member.user)
      .filter((user): user is ClickUpUser => Boolean(user && clickUpId(user.id)))
      .map((user) => toMember(user));
  }

  private async requireMember(id: string): Promise<Member> {
    const member = (await this.loadMembers()).find((item) => item.id === id);
    if (!member) throw new StudioError("not_found", `Member ${id} not found.`);
    return member;
  }

  private async loadTeam(): Promise<ClickUpTeam> {
    if (this.teamCache && Date.now() - this.teamCache.at < this.memberCacheTtlMs) return this.teamCache.team;
    try {
      const body = await this.http.get<{ team?: ClickUpTeam }>(`/team/${encodeURIComponent(this.options.teamId)}`);
      const team = body.team ?? {};
      this.teamCache = { at: Date.now(), team };
      return team;
    } catch (error) {
      if (error instanceof ClickUpApiError && error.status === 404) {
        throw new StudioError("invalid", `ClickUp team ${this.options.teamId} was not found. Check CLICKUP_TEAM_ID.`);
      }
      throw error;
    }
  }

  private async hierarchy(): Promise<Hierarchy> {
    const cached = this.hierarchyCache;
    if (cached && Date.now() - cached.at < this.cacheTtlMs) return cached.value;
    const generation = this.hierarchyGeneration;
    if (this.hierarchyInflight && this.hierarchyInflightGeneration === generation) return this.hierarchyInflight;
    const pending = this.loadHierarchy().then((value) => {
      if (this.hierarchyGeneration === generation) this.hierarchyCache = { at: Date.now(), value };
      return value;
    });
    this.hierarchyInflight = pending;
    this.hierarchyInflightGeneration = generation;
    void pending.finally(() => {
      if (this.hierarchyInflightGeneration === generation) this.hierarchyInflight = undefined;
    }).catch(() => undefined);
    return pending;
  }

  private async loadHierarchy(): Promise<Hierarchy> {
    const team = await this.loadTeam();
    const spaces = await this.loadSpaces();
    const normalized = spaces
      .map((space) => ({ id: clickUpId(space.id), name: space.name?.trim() || clickUpId(space.id) }))
      .filter((space) => space.id);
    const match = findClientSpace(normalized, { spaceId: this.options.spaceId, spaceName: this.options.spaceName });
    if (!match) {
      const names = normalized.map((space) => `${space.name} (${space.id})`).join(", ") || "none";
      const message = this.options.spaceId
        ? `CLICKUP_SPACE_ID=${this.options.spaceId} was not found in team ${this.options.teamId}. Spaces: ${names}.`
        : `ClickUp space "${this.options.spaceName}" was not found in team ${this.options.teamId}. Spaces: ${names}. Set CLICKUP_SPACE_ID to override.`;
      throw new StudioError("invalid", message);
    }
    const activeBody = await this.http.get<{ folders?: ClickUpFolder[] }>(
      `/space/${encodeURIComponent(match.id)}/folder`,
      { archived: "false" },
    );
    const archivedBody = await this.http.get<{ folders?: ClickUpFolder[] }>(
      `/space/${encodeURIComponent(match.id)}/folder`,
      { archived: "true" },
    );
    return {
      teamName: team.name?.trim() || this.options.config.workspaceName,
      spaceId: match.id,
      spaceName: match.name,
      folders: mergeFolderPayloads(activeBody.folders ?? [], archivedBody.folders ?? [], match.id),
    };
  }

  private async loadSpaces(): Promise<ClickUpSpace[]> {
    const active = await this.http.get<{ spaces?: ClickUpSpace[] }>(
      `/team/${encodeURIComponent(this.options.teamId)}/space`,
      { archived: "false" },
    );
    const activeSpaces = active.spaces ?? [];
    const normalized = activeSpaces
      .map((space) => ({ id: clickUpId(space.id), name: space.name?.trim() || clickUpId(space.id) }))
      .filter((space) => space.id);
    if (findClientSpace(normalized, { spaceId: this.options.spaceId, spaceName: this.options.spaceName })) {
      return activeSpaces;
    }
    const archived = await this.http.get<{ spaces?: ClickUpSpace[] }>(
      `/team/${encodeURIComponent(this.options.teamId)}/space`,
      { archived: "true" },
    );
    const seen = new Set(activeSpaces.map((space) => clickUpId(space.id)));
    const extra = (archived.spaces ?? []).filter((space) => !seen.has(clickUpId(space.id)));
    return [...activeSpaces, ...extra];
  }

  private invalidateHierarchy(): void {
    this.hierarchyGeneration += 1;
    this.hierarchyCache = undefined;
  }

  private clientFolders(hierarchy: Hierarchy): StoredFolder[] {
    return hierarchy.folders.filter((folder) => !isTemplateClientName(folder.name));
  }

  private defaultLists(hierarchy: Hierarchy): LocatedList[] {
    const lists: LocatedList[] = [];
    for (const folder of this.clientFolders(hierarchy)) {
      for (const list of folder.lists) {
        if (list.archived || isArchiveListName(list.name)) continue;
        lists.push({ ...list, clientId: folder.id });
      }
    }
    return lists;
  }

  private notImplemented(method: StudioMethod): never {
    throw new StudioError("not_implemented", `clickup.${method} is not implemented. ${CLICKUP_MAPPING[method]}`);
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StudioError) throw error;
      if (error instanceof ClickUpApiError) {
        if (error.status === 401 || error.status === 403) {
          throw new StudioError("invalid", "ClickUp authorization failed. Check CLICKUP_API_TOKEN and CLICKUP_TEAM_ID.");
        }
        if (error.status === 400) throw new StudioError("invalid", `ClickUp rejected the request: ${error.message}`);
        if (error.status === 429) {
          throw new StudioError("invalid", "ClickUp rate limit exceeded after retries. Try again shortly.");
        }
        if (error.status === 404) throw new StudioError("not_found", error.message || "ClickUp record not found.");
      }
      throw error;
    }
  }
}

export function createClickUpStudio(env: NodeJS.ProcessEnv = process.env, deps: ClickUpStudioDeps = {}): StudioOs {
  const token = env.CLICKUP_API_TOKEN?.trim();
  const teamId = env.CLICKUP_TEAM_ID?.trim();
  const missing = [token ? undefined : "CLICKUP_API_TOKEN", teamId ? undefined : "CLICKUP_TEAM_ID"].filter(
    (item): item is string => Boolean(item),
  );
  if (!token || !teamId) {
    throw new Error(
      `LUNARCORE_ADAPTER=clickup requires ${missing.join(" and ")}. ` +
        "Set CLICKUP_API_TOKEN to a ClickUp personal API token and CLICKUP_TEAM_ID to the workspace team id " +
        "(Lunarcore team id 9016194264).",
    );
  }
  const config = parseStudioConfig(env);
  const spaceId = env.CLICKUP_SPACE_ID?.trim() || undefined;
  return new ClickUpStudio(
    {
      token,
      teamId,
      ...(spaceId ? { spaceId } : {}),
      spaceName: deps.spaceName?.trim() || CLIENT_SPACE_NAME,
      config,
    },
    deps,
  );
}

function rejectClientFields(input: { industry?: unknown; primaryContact?: unknown; notes?: unknown; status?: string }): void {
  const fields: string[] = [];
  if (input.industry !== undefined) fields.push("industry");
  if (input.primaryContact !== undefined) fields.push("primaryContact");
  if (input.notes !== undefined) fields.push("notes");
  if (input.status !== undefined && input.status !== "active") fields.push("status");
  if (fields.length === 0) return;
  throw new StudioError(
    "not_implemented",
    `ClickUp client folders only store a name. Status is active unless the folder is already archived. Cannot write ${fields.join(", ")}.`,
  );
}

function rejectProjectFields(input: { phase?: unknown; status?: string }): void {
  const fields: string[] = [];
  if (input.phase !== undefined) fields.push("phase");
  if (input.status !== undefined && input.status !== "active" && input.status !== "planning") fields.push("status");
  if (fields.length === 0) return;
  throw new StudioError(
    "not_implemented",
    `ClickUp lists store a name, description, start date, and due date. Non-archived lists read back as active, and archiving is read-only. Cannot write ${fields.join(", ")}.`,
  );
}

function storedList(raw: ClickUpList, folderId: string): StoredList {
  const dueDate = dayFromClickUp(raw.due_date);
  const startDate = dayFromClickUp(raw.start_date);
  const taskCount = Number(raw.task_count ?? 0);
  return {
    id: clickUpId(raw.id),
    name: raw.name?.trim() || clickUpId(raw.id),
    content: raw.content?.trim() ?? "",
    archived: Boolean(raw.archived),
    taskCount: Number.isFinite(taskCount) ? taskCount : 0,
    statuses: raw.statuses ?? [],
    createdAt: timestampOrEpoch(raw.date_created),
    updatedAt: timestampOrEpoch(raw.date_updated ?? raw.date_created),
    folderId,
    ...(dueDate ? { dueDate } : {}),
    ...(startDate ? { startDate } : {}),
  };
}

function folderFromRaw(raw: ClickUpFolder, fallbackSpaceId: string): StoredFolder | undefined {
  const id = clickUpId(raw.id);
  if (!id) return undefined;
  const spaceId = clickUpId(raw.space?.id) || fallbackSpaceId;
  return {
    id,
    name: raw.name?.trim() || id,
    archived: Boolean(raw.archived),
    createdAt: timestampOrEpoch(raw.date_created),
    updatedAt: timestampOrEpoch(raw.date_updated ?? raw.date_created),
    spaceId,
    lists: (raw.lists ?? []).map((list) => storedList(list, id)).filter((list) => list.id),
  };
}

function mergeFolderPayloads(activeRows: ClickUpFolder[], archivedRows: ClickUpFolder[], spaceId: string): StoredFolder[] {
  const activeIds = new Set(activeRows.map((row) => clickUpId(row.id)).filter((id) => id.length > 0));
  const byId = new Map<string, ClickUpFolder>();
  for (const row of [...activeRows, ...archivedRows]) {
    const id = clickUpId(row.id);
    if (!id) continue;
    const previous = byId.get(id);
    if (!previous) {
      byId.set(id, row);
      continue;
    }
    byId.set(id, {
      ...previous,
      ...row,
      archived: Boolean(previous.archived || row.archived),
      lists: mergeRawLists(previous.lists, row.lists),
    });
  }
  const folders: StoredFolder[] = [];
  for (const [id, raw] of byId) {
    const folderSpace = clickUpId(raw.space?.id);
    if (folderSpace && folderSpace !== spaceId) continue;
    const onlyArchived = !activeIds.has(id);
    const folder = folderFromRaw({ ...raw, archived: Boolean(raw.archived) || onlyArchived }, spaceId);
    if (folder) folders.push(folder);
  }
  return folders;
}

function mergeRawLists(left: ClickUpList[] | undefined, right: ClickUpList[] | undefined): ClickUpList[] {
  const byId = new Map<string, ClickUpList>();
  for (const list of [...(left ?? []), ...(right ?? [])]) {
    const id = clickUpId(list.id);
    if (!id) continue;
    const previous = byId.get(id);
    if (!previous) byId.set(id, list);
    else if ((list.statuses?.length ?? 0) > (previous.statuses?.length ?? 0)) byId.set(id, { ...previous, ...list });
  }
  return [...byId.values()];
}

function mergeStored(left: StoredList[], right: StoredList[]): StoredList[] {
  const byId = new Map<string, StoredList>();
  for (const list of [...left, ...right]) {
    const previous = byId.get(list.id);
    if (!previous || (list.statuses.length > 0 && previous.statuses.length === 0)) byId.set(list.id, list);
  }
  return [...byId.values()];
}

function dedupeTasks(tasks: ClickUpTask[]): ClickUpTask[] {
  const byId = new Map<string, ClickUpTask>();
  for (const task of tasks) {
    const id = clickUpId(task.id);
    if (id && !byId.has(id)) byId.set(id, task);
  }
  return [...byId.values()];
}

function projectIdOf(task: ClickUpTask, fallback: string): string {
  return clickUpId(task.list?.id) || fallback;
}

function commentBody(comment: ClickUpComment): string {
  return (comment.comment_text ?? "").trim();
}

function pushHit(hits: SearchHit[], kind: string, id: string, title: string, fields: string[], query: string): void {
  const titleHit = includesFold(title, query);
  const fieldHits = fields.filter((field) => includesFold(field, query));
  const score = (titleHit ? 2 : 0) + fieldHits.length;
  if (score === 0 || !id) return;
  const source = titleHit ? title : (fieldHits[0] ?? title);
  hits.push({ kind, id, title, snippet: snippet(source), score });
}

function snippet(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}
