import type { StudioMethod } from "../../types/studio.js";
import type {
  Client,
  ClientStatus,
  Member,
  Milestone,
  MilestoneStatus,
  Project,
  ProjectStatus,
  Task,
  TaskComment,
  TaskPriority,
  TaskStatus,
} from "../../types/entities.js";
import { StudioError } from "../../types/errors.js";
import type { ClickUpComment, ClickUpStatus, ClickUpTask, ClickUpUser } from "./api-types.js";

/**
 * ClickUp resource map for the Lunarcore workspace.
 *
 * Team id comes from CLICKUP_TEAM_ID (Lunarcore: 9016194264). The token in
 * CLICKUP_API_TOKEN is sent as the raw Authorization header. Base URL:
 * https://api.clickup.com/api/v2
 *
 * Space: "Client Work" (known id 90166903137), overridable with CLICKUP_SPACE_ID.
 * Each folder in that space is a client. Folders whose names start with
 * `_TEMPLATE` are skipped. Each list in a client folder is a project, because
 * StudioOs tasks belong to a project and ClickUp tasks belong to a list.
 * Lists named `_archive*` or flagged archived are hidden from default reads
 * and come back when a caller passes status `archived`, a query that matches
 * the list, or the list id.
 *
 * Docs, reminders, and calendar stay on the Google adapter. Pipeline and time
 * have no Client Work equivalent in v1 and return not_implemented.
 */
export const CLICKUP_MAPPING = {
  listClients: "Folders in the Client Work space (GET /space/{space_id}/folder). Skip names starting with _TEMPLATE. Status is active unless the folder is archived.",
  getClient: "GET /folder/{folder_id}. _TEMPLATE folders are not clients.",
  createClient: "POST /space/{space_id}/folder. Only the name is stored. industry, primaryContact, notes, and non-active statuses are not_implemented.",
  updateClient: "PUT /folder/{folder_id} for name. Archiving and profile fields are not_implemented.",
  searchClients: "Filter Client Work folders by name. _TEMPLATE folders are excluded.",
  listProjects: "Lists inside client folders (included on GET /space/{space_id}/folder, with GET /folder/{folder_id}/list?archived=true when archived lists are requested). Each list is a project. Default reads skip archived lists and names starting with _archive.",
  getProject: "GET /list/{list_id}. Explicit ids include _archive lists.",
  createProject: "POST /folder/{folder_id}/list. Name, description (list content), start date, and due date are stored. A non-archived list reads back as active (planning is accepted as that). phase and archived are not_implemented.",
  updateProject: "PUT /list/{list_id} for name, content, start_date, and due_date. phase and status changes other than active/planning are not_implemented.",
  listMilestones: "Tasks in the project list tagged milestone, or with an affirmative milestone custom field. Status is mapped from the ClickUp task status.",
  upsertMilestone: "POST or PUT /task with the milestone tag. Match an existing milestone task by name when id is omitted. There is no separate ClickUp milestone resource.",
  listTasks: "GET /list/{list_id}/task or GET /team/{team_id}/task. Milestone-tagged tasks are returned as milestones, not as tasks. Subtasks parented to a milestone set milestoneId.",
  getTask: "GET /task/{task_id} plus GET /task/{task_id}/comment.",
  createTask: "POST /list/{list_id}/task. Status and priority are mapped onto the list's ClickUp statuses. parent is the milestone task when milestoneId is set.",
  updateTask: "PUT /task/{task_id}. The task stays on its list. Assignees use ClickUp's add/rem shape.",
  commentOnTask: "POST /task/{task_id}/comment as the token user. authorId must be omitted or equal that user.",
  deliveryStatus: "Derived from the list's milestone-tagged tasks and the other tasks on that list. Health is blocked, else at_risk when a milestone is overdue, else on_track. ClickUp lists have no delivered status.",
  listLeads: "Not implemented. Client Work has no leads list; v1 does not invent pipeline data.",
  getLead: "Not implemented. Client Work has no leads list.",
  createLead: "Not implemented. Client Work has no leads list.",
  updateLead: "Not implemented. Client Work has no leads list.",
  listProposals: "Not implemented. Client Work has no proposals list.",
  getProposal: "Not implemented. Client Work has no proposals list.",
  createProposal: "Not implemented. Client Work has no proposals list.",
  pipelineSummary: "Not implemented. Pipeline is not mapped onto Client Work.",
  listMembers: "Members on GET /team/{team_id}. Role is owner, admin, member, or guest.",
  resolveMember: "Match those team members by email, then name or role.",
  searchDocs: "Not implemented. Docs stay on the Google adapter; ClickUp Docs are not the system of record.",
  getDoc: "Not implemented. Docs stay on the Google adapter.",
  createDoc: "Not implemented. Docs stay on the Google adapter.",
  createReminder: "Not implemented. Reminders stay on Google Calendar.",
  listReminders: "Not implemented. Reminders stay on Google Calendar.",
  logTime: "Not implemented. ClickUp time entries are not mapped in v1.",
  timeSummary: "Not implemented. ClickUp time entries are not mapped in v1.",
  search: "Clients, projects, and members from the cached hierarchy, plus task and milestone names from GET /team/{team_id}/task (capped scan).",
  whoami: "GET /user. Role comes from the matching team member.",
  workspaceContext: "GET /team/{team_id} and the Client Work folder cache. Task counts use ClickUp list task_count. Milestone, comment, pipeline, doc, reminder, time, and link totals are 0 because ClickUp has no cheap counter for them.",
  linkEntities: "POST /task/{task_id}/link/{links_to} when both sides are tasks. ClickUp does not store the relation label. Other pairs are not implemented.",
} satisfies Record<StudioMethod, string>;

/** Lunarcore delivery space. Lookup by this name unless CLICKUP_SPACE_ID is set. */
export const CLIENT_SPACE_NAME = "Client Work";

/** Known Client Work space id, used when the name is missing and no override is set. */
export const KNOWN_CLIENT_SPACE_ID = "90166903137";

export const MILESTONE_TAG = "milestone";

/** Stay under ClickUp's 100 requests/minute token limit. */
export const MIN_REQUEST_INTERVAL_MS = 600;

/** Folder/list hierarchy is reused across tool calls. */
export const HIERARCHY_CACHE_MS = 60_000;

export const MEMBER_CACHE_MS = 5 * 60_000;

/** ClickUp returns at most 100 tasks per page. */
export const TASK_PAGE_SIZE = 100;

/** Stop scanning after this many pages so a search cannot walk the API forever. */
export const MAX_TASK_PAGES = 20;

const EPOCH = "1970-01-01T00:00:00.000Z";

const PRIORITY_TO_CLICKUP: Record<TaskPriority, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

const ROLE_BY_ID: Record<number, string> = {
  1: "owner",
  2: "admin",
  3: "member",
  4: "guest",
};

export interface NamedSpace {
  id: string;
  name: string;
}

export function findClientSpace(
  spaces: readonly NamedSpace[],
  options: { spaceId?: string; spaceName?: string; knownSpaceId?: string },
): NamedSpace | undefined {
  if (options.spaceId) return spaces.find((space) => space.id === options.spaceId);
  const spaceName = (options.spaceName ?? CLIENT_SPACE_NAME).toLowerCase();
  const knownSpaceId = options.knownSpaceId ?? KNOWN_CLIENT_SPACE_ID;
  return (
    spaces.find((space) => space.name.toLowerCase() === spaceName) ??
    spaces.find((space) => space.id === knownSpaceId)
  );
}

export function isTemplateClientName(name: string): boolean {
  return name.trim().toLowerCase().startsWith("_template");
}

export function isArchiveListName(name: string): boolean {
  return name.trim().toLowerCase().startsWith("_archive");
}

export function isDefaultHiddenList(list: { name: string; archived: boolean }): boolean {
  return list.archived || isArchiveListName(list.name);
}

export function clientStatusFromArchived(archived: boolean): ClientStatus {
  return archived ? "archived" : "active";
}

export function projectStatusFromList(list: { name: string; archived: boolean }): ProjectStatus {
  return isDefaultHiddenList(list) ? "archived" : "active";
}

export function clickUpStatusToTaskStatus(
  status: { status?: string; type?: string } | null | undefined,
): TaskStatus {
  const type = (status?.type ?? "").toLowerCase();
  const name = status?.status ?? "";
  if (type === "closed" || type === "done") return "done";
  if (/block|stuck|waiting|on[\s_-]?hold/i.test(name)) return "blocked";
  if (type === "custom" || /in[\s_-]?progress|doing|review|wip|started|working/i.test(name)) return "in_progress";
  return "todo";
}

export function taskStatusToMilestoneStatus(status: TaskStatus): MilestoneStatus {
  if (status === "todo") return "pending";
  return status;
}

export function milestoneStatusToTaskStatus(status: MilestoneStatus): TaskStatus {
  if (status === "pending") return "todo";
  return status;
}

export function pickClickUpStatus(target: TaskStatus, statuses: readonly ClickUpStatus[]): string {
  const available = statuses.map((status) => status.status).filter((status) => status.trim().length > 0);
  if (available.length === 0) {
    throw new StudioError("invalid", "The ClickUp list has no statuses, so the task status cannot be set.");
  }
  const findName = (pattern: RegExp): string | undefined =>
    statuses.find((status) => pattern.test(status.status))?.status;
  const findType = (...types: string[]): string | undefined =>
    statuses.find((status) => types.includes((status.type ?? "").toLowerCase()))?.status;

  let match: string | undefined;
  if (target === "done") {
    match = findName(/^(done|complete|completed|closed)$/i) ?? findType("closed", "done");
  } else if (target === "blocked") {
    match = findName(/block|stuck|waiting|on[\s_-]?hold/i);
  } else if (target === "in_progress") {
    match =
      findName(/in[\s_-]?progress|doing|started|working|wip/i) ??
      statuses.find((status) => {
        const type = (status.type ?? "").toLowerCase();
        if (type === "closed" || type === "done" || type === "open" || type === "unstarted") return false;
        return !/block|stuck|waiting|on[\s_-]?hold/i.test(status.status);
      })?.status;
  } else {
    match = findName(/to[\s_-]?do|todo|backlog|not started|^open$/i) ?? findType("open", "unstarted");
  }
  if (!match) {
    throw new StudioError(
      "invalid",
      `No ClickUp status matches "${target}". Available: ${available.join(", ")}.`,
    );
  }
  return match;
}

export function taskPriorityToClickUp(priority: TaskPriority): number {
  return PRIORITY_TO_CLICKUP[priority];
}

export function clickUpPriorityToTaskPriority(
  priority: { id?: string | number; priority?: string } | null | undefined,
): TaskPriority {
  const name = priority?.priority?.toLowerCase();
  if (name === "urgent" || name === "high" || name === "normal" || name === "low") return name;
  const id = String(priority?.id ?? "");
  if (id === "1") return "urgent";
  if (id === "2") return "high";
  if (id === "3") return "normal";
  if (id === "4") return "low";
  return "normal";
}

export function memberRole(user: ClickUpUser): string {
  const role = typeof user.role === "number" ? ROLE_BY_ID[user.role] : undefined;
  return role ?? "member";
}

export function isMilestoneTask(task: Pick<ClickUpTask, "tags" | "custom_fields">): boolean {
  if ((task.tags ?? []).some((tag) => (tag.name ?? "").trim().toLowerCase() === MILESTONE_TAG)) return true;
  for (const field of task.custom_fields ?? []) {
    if (!/milestone/i.test(field.name ?? "")) continue;
    if (isAffirmative(field.value)) return true;
  }
  return false;
}

export function taskDescription(task: Pick<ClickUpTask, "markdown_description" | "text_content" | "description">): string | undefined {
  const raw = task.markdown_description ?? task.text_content ?? task.description ?? "";
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

export function commentText(comment: Pick<ClickUpComment, "comment_text" | "comment">): string {
  const direct = comment.comment_text?.trim();
  if (direct) return direct;
  return (comment.comment ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export function isoFromClickUp(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const ms = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return new Date(ms).toISOString();
}

export function dayFromClickUp(value: string | number | null | undefined): string | undefined {
  return isoFromClickUp(value)?.slice(0, 10);
}

export function clickUpMillisFromDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function timestampOrEpoch(value: string | number | null | undefined): string {
  return isoFromClickUp(value) ?? EPOCH;
}

export function clickUpId(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text === "null" ? "" : text;
}

export function clickUpUserId(id: string, field: string): number {
  if (!/^\d+$/.test(id)) throw new StudioError("invalid", `${field} must be a ClickUp user id.`);
  return Number(id);
}

export function toClient(folder: {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}): Client {
  return {
    id: folder.id,
    name: folder.name,
    status: clientStatusFromArchived(folder.archived),
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export function toProject(list: {
  id: string;
  name: string;
  content: string;
  archived: boolean;
  dueDate?: string;
  startDate?: string;
  createdAt: string;
  updatedAt: string;
  clientId: string;
}): Project {
  return {
    id: list.id,
    clientId: list.clientId,
    name: list.name,
    status: projectStatusFromList(list),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    ...(list.content ? { description: list.content } : {}),
    ...(list.startDate ? { startDate: list.startDate } : {}),
    ...(list.dueDate ? { dueDate: list.dueDate } : {}),
  };
}

export function toMember(user: ClickUpUser): Member {
  const id = clickUpId(user.id);
  return {
    id,
    name: user.username?.trim() || user.email?.trim() || id,
    email: user.email?.trim() ?? "",
    role: memberRole(user),
    active: true,
  };
}

export function toTaskRecord(
  task: ClickUpTask,
  projectId: string,
  milestoneIds: ReadonlySet<string>,
): Task {
  const parent = clickUpId(task.parent);
  const milestoneId = parent && milestoneIds.has(parent) ? parent : undefined;
  const assignee = task.assignees?.find((user) => clickUpId(user.id));
  const description = taskDescription(task);
  const dueDate = dayFromClickUp(task.due_date);
  return {
    id: clickUpId(task.id),
    projectId,
    title: task.name?.trim() || clickUpId(task.id),
    status: clickUpStatusToTaskStatus(task.status),
    priority: clickUpPriorityToTaskPriority(task.priority),
    createdAt: timestampOrEpoch(task.date_created),
    updatedAt: timestampOrEpoch(task.date_updated ?? task.date_created),
    ...(milestoneId ? { milestoneId } : {}),
    ...(description ? { description } : {}),
    ...(assignee ? { assigneeId: clickUpId(assignee.id) } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
}

export function toMilestoneRecord(task: ClickUpTask, projectId: string): Milestone {
  const description = taskDescription(task);
  const dueDate = dayFromClickUp(task.due_date);
  return {
    id: clickUpId(task.id),
    projectId,
    name: task.name?.trim() || clickUpId(task.id),
    status: taskStatusToMilestoneStatus(clickUpStatusToTaskStatus(task.status)),
    createdAt: timestampOrEpoch(task.date_created),
    updatedAt: timestampOrEpoch(task.date_updated ?? task.date_created),
    ...(description ? { description } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
}

export function toCommentRecord(comment: ClickUpComment, taskId: string, fallbackBody?: string): TaskComment {
  const author = clickUpId(comment.user?.id);
  const body = commentText(comment) || fallbackBody || "";
  return {
    id: clickUpId(comment.id),
    taskId,
    body,
    createdAt: timestampOrEpoch(comment.date ?? comment.date_created),
    ...(author ? { authorId: author } : {}),
  };
}

function isAffirmative(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return !/^(false|no|0|off)$/i.test(trimmed);
  }
  return false;
}
