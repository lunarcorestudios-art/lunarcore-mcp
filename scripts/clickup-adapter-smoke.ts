import { createClickUpStudio } from "../dist/adapters/clickup/clickup-studio.js";
import { createStudio } from "../dist/adapters/create-studio.js";
import {
  clickUpStatusToTaskStatus,
  findClientSpace,
  isArchiveListName,
  isMilestoneTask,
  isTemplateClientName,
  pickClickUpStatus,
} from "../dist/adapters/clickup/mapping.js";
import { StudioError } from "../dist/types/errors.js";

const TOKEN = "test-token";
const TEAM = "9016194264";
const SPACE = "90166903137";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function utcMillis(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return String(date.getTime());
}

const STATUSES = [
  { status: "to do", type: "open" },
  { status: "in progress", type: "custom" },
  { status: "blocked", type: "custom" },
  { status: "complete", type: "closed" },
];

interface MockTask {
  id: string;
  name: string;
  description: string;
  statusName: string;
  priority: number | null;
  assigneeIds: number[];
  tags: string[];
  parent: string | null;
  listId: string;
  folderId: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  customFields: Array<{ name: string; value: unknown }>;
  links: Array<{ task_id: string; link_id: string; date_created: string }>;
}

interface MockList {
  id: string;
  name: string;
  content: string;
  archived: boolean;
  folderId: string;
  taskCount: number;
  dueDate?: string | null;
  startDate?: string | null;
}

interface MockFolder {
  id: string;
  name: string;
  archived: boolean;
  lists: MockList[];
}

function exerciseMapping(): void {
  assert(
    findClientSpace(
      [
        { id: "1", name: "Other" },
        { id: SPACE, name: "Client Work" },
      ],
      {},
    )?.id === SPACE,
    "space lookup should prefer the Client Work name",
  );
  assert(
    findClientSpace([{ id: SPACE, name: "Delivery" }], { spaceName: "Client Work" })?.id === SPACE,
    "known space id should be the fallback",
  );
  assert(
    findClientSpace([{ id: "abc", name: "Client Work" }], { spaceId: "abc" })?.id === "abc",
    "CLICKUP_SPACE_ID should win",
  );
  assert(findClientSpace([{ id: "abc", name: "Other" }], { spaceId: "missing" }) === undefined, "missing space id");
  assert(clickUpStatusToTaskStatus({ status: "complete", type: "closed" }) === "done", "closed type");
  assert(clickUpStatusToTaskStatus({ status: "blocked", type: "custom" }) === "blocked", "blocked name");
  assert(clickUpStatusToTaskStatus({ status: "in progress", type: "custom" }) === "in_progress", "in progress");
  assert(clickUpStatusToTaskStatus({ status: "to do", type: "open" }) === "todo", "open type");
  assert(
    pickClickUpStatus("blocked", [
      { status: "to do", type: "open" },
      { status: "blocked", type: "custom" },
    ]) === "blocked",
    "pick blocked status",
  );
  assert(isTemplateClientName("_TEMPLATE New Client"), "template prefix");
  assert(!isTemplateClientName("Template Co"), "template must use the underscore prefix");
  assert(isArchiveListName("_archive 2024"), "archive prefix");
  assert(isMilestoneTask({ tags: [{ name: "Milestone" }] }), "milestone tag");
  assert(isMilestoneTask({ custom_fields: [{ name: "Milestone", value: true }] }), "milestone custom field");
  assert(!isMilestoneTask({ custom_fields: [{ name: "Milestone", value: false }] }), "false milestone field");
}

function createMock(): { fetchImpl: typeof fetch; state: { folders: MockFolder[]; tasks: MockTask[]; comments: Map<string, Array<{ id: string; body: string; userId: number; date: string }>>; folderPosts: number; auths: string[] } } {
  const now = String(Date.now());
  const folders: MockFolder[] = [
    {
      id: "f_banwa",
      name: "Banwa Wellness Spa",
      archived: false,
      lists: [
        { id: "l_active", name: "Active Deliverables", content: "Current work", archived: false, folderId: "f_banwa", taskCount: 4 },
        { id: "l_calendar", name: "Content Calendar", content: "", archived: false, folderId: "f_banwa", taskCount: 3 },
        { id: "l_revisions", name: "Revisions", content: "", archived: false, folderId: "f_banwa", taskCount: 2 },
        { id: "l_archive_name", name: "_archive 2024", content: "Old shoots", archived: false, folderId: "f_banwa", taskCount: 1 },
      ],
    },
    {
      id: "f_template",
      name: "_TEMPLATE New Client",
      archived: false,
      lists: [{ id: "l_template", name: "Active Deliverables", content: "", archived: false, folderId: "f_template", taskCount: 0 }],
    },
  ];
  const archivedFolders: MockFolder[] = [
    {
      id: "f_old",
      name: "Old Client",
      archived: true,
      lists: [{ id: "l_old", name: "Projects", content: "", archived: false, folderId: "f_old", taskCount: 0 }],
    },
  ];
  const archivedLists: MockList[] = [
    { id: "l_archived", name: "Old Campaigns", content: "Shelved", archived: true, folderId: "f_banwa", taskCount: 1 },
  ];
  const tasks: MockTask[] = [
    task("t_edit", "Edit reel", "l_active", "f_banwa", "in progress", 2, [42], [], null, utcMillis(1), "Cut the hero"),
    task("t_launch", "Launch film", "l_active", "f_banwa", "to do", null, [], ["milestone"], null, utcMillis(-1), ""),
    task("t_score", "Temp score", "l_active", "f_banwa", "blocked", null, [], [], null, null, ""),
    task("t_child", "Child cut", "l_active", "f_banwa", "to do", null, [42], [], "t_launch", null, ""),
    task("t_lock", "Calendar lock", "l_calendar", "f_banwa", "complete", null, [], ["milestone"], null, utcMillis(3), ""),
    task("t_posts", "Schedule posts", "l_calendar", "f_banwa", "complete", null, [], [], null, null, ""),
    task("t_brand", "Brand film", "l_calendar", "f_banwa", "to do", null, [], [], null, utcMillis(5), ""),
    task("t_review", "Client review", "l_revisions", "f_banwa", "to do", null, [], ["milestone"], null, utcMillis(-1), ""),
    task("t_notes", "Notes", "l_revisions", "f_banwa", "to do", null, [], [], null, null, ""),
  ];
  tasks.find((item) => item.id === "t_brand")!.customFields = [{ name: "Milestone", value: true }];
  const comments = new Map<string, Array<{ id: string; body: string; userId: number; date: string }>>();
  let sequence = 100;
  const state = { folders, tasks, comments, folderPosts: 0, auths: [] as string[] };

  function allFolders(): MockFolder[] {
    return [...folders, ...archivedFolders];
  }

  function folderLists(folder: MockFolder, archived: boolean): MockList[] {
    if (folder.id === "f_banwa" && archived) return archivedLists;
    if (archived) return [];
    return folder.lists;
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const auth = header(init, "authorization");
    state.auths.push(auth ?? "");
    if (auth !== TOKEN) return json({ err: "Token invalid" }, 401);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const path = url.pathname.replace("/api/v2", "");

    if (path === "/user" && method === "GET") {
      return json({ user: { id: 42, username: "Ada Lovelace", email: "ada@lunarcore.studio" } });
    }
    if (path === `/team/${TEAM}` && method === "GET") {
      return json({
        team: {
          id: TEAM,
          name: "Lunarcore Studios",
          members: [
            { user: { id: 42, username: "Ada Lovelace", email: "ada@lunarcore.studio", role: 2 } },
            { user: { id: 7, username: "Guest Editor", email: "guest@example.com", role: 4 } },
          ],
        },
      });
    }
    if (path === `/team/${TEAM}/space` && method === "GET") {
      return json({ spaces: [{ id: SPACE, name: "Client Work" }] });
    }
    if (path === `/space/${SPACE}/folder` && method === "GET") {
      const archived = url.searchParams.get("archived") === "true";
      const source = archived ? archivedFolders : folders;
      return json({ folders: source.map((folder) => folderJson(folder, folderLists(folder, false))) });
    }
    if (path === `/space/${SPACE}/folder` && method === "POST") {
      state.folderPosts += 1;
      const folder: MockFolder = { id: `f_${sequence++}`, name: String(body.name), archived: false, lists: [] };
      folders.push(folder);
      return json(folderJson(folder, []));
    }

    const folderList = /^\/folder\/([^/]+)\/list$/.exec(path);
    if (folderList && method === "GET") {
      const folder = allFolders().find((item) => item.id === folderList[1]);
      if (!folder) return json({ err: "Folder not found" }, 404);
      return json({ lists: folderLists(folder, url.searchParams.get("archived") === "true").map(listJson) });
    }
    if (folderList && method === "POST") {
      const folder = allFolders().find((item) => item.id === folderList[1]);
      if (!folder) return json({ err: "Folder not found" }, 404);
      const list: MockList = {
        id: `l_${sequence++}`,
        name: String(body.name),
        content: typeof body.content === "string" ? body.content : "",
        archived: false,
        folderId: folder.id,
        taskCount: 0,
        dueDate: (body.due_date as string | number | null | undefined) ?? null,
        startDate: (body.start_date as string | number | null | undefined) ?? null,
      };
      folder.lists.push(list);
      return json(listJson(list));
    }

    const folderPath = /^\/folder\/([^/]+)$/.exec(path);
    if (folderPath && method === "GET") {
      const folder = allFolders().find((item) => item.id === folderPath[1]);
      if (!folder) return json({ err: "Folder not found" }, 404);
      return json(folderJson(folder, folder.lists));
    }
    if (folderPath && method === "PUT") {
      const folder = allFolders().find((item) => item.id === folderPath[1]);
      if (!folder) return json({ err: "Folder not found" }, 404);
      if (typeof body.name === "string") folder.name = body.name;
      return json(folderJson(folder, folder.lists));
    }

    const listPath = /^\/list\/([^/]+)$/.exec(path);
    if (listPath && method === "GET") {
      const list = findList(listPath[1] ?? "", allFolders(), archivedLists);
      if (!list) return json({ err: "List not found" }, 404);
      return json(listJson(list));
    }
    if (listPath && method === "PUT") {
      const list = findList(listPath[1] ?? "", allFolders(), archivedLists);
      if (!list) return json({ err: "List not found" }, 404);
      if (typeof body.name === "string") list.name = body.name;
      if (typeof body.content === "string") list.content = body.content;
      if (body.due_date !== undefined) list.dueDate = body.due_date as string | number | null;
      if (body.start_date !== undefined) list.startDate = body.start_date as string | number | null;
      return json(listJson(list));
    }

    const listTasks = /^\/list\/([^/]+)\/task$/.exec(path);
    if (listTasks && method === "GET") {
      const listId = listTasks[1] ?? "";
      return json({ tasks: pageTasks(tasks.filter((item) => item.listId === listId), url) });
    }
    if (listTasks && method === "POST") {
      const list = findList(listTasks[1] ?? "", allFolders(), archivedLists);
      if (!list) return json({ err: "List not found" }, 404);
      const statusName = String(body.status ?? "");
      if (!STATUSES.some((status) => status.status === statusName)) return json({ err: `Status ${statusName} not found` }, 400);
      const created = task(
        `t_${sequence++}`,
        String(body.name),
        list.id,
        list.folderId,
        statusName,
        typeof body.priority === "number" ? body.priority : null,
        Array.isArray(body.assignees) ? body.assignees.map(Number) : [],
        Array.isArray(body.tags) ? body.tags.map(String) : [],
        typeof body.parent === "string" ? body.parent : null,
        body.due_date === undefined ? null : String(body.due_date),
        typeof body.description === "string" ? body.description : "",
      );
      tasks.push(created);
      list.taskCount += 1;
      return json(taskJson(created));
    }

    if (path === `/team/${TEAM}/task` && method === "GET") {
      const wanted = url.searchParams.getAll("list_ids[]");
      const matched = tasks.filter((item) => wanted.length === 0 || wanted.includes(item.listId));
      return json({ tasks: pageTasks(matched, url) });
    }

    const taskPath = /^\/task\/([^/]+)$/.exec(path);
    if (taskPath && method === "GET") {
      const found = tasks.find((item) => item.id === taskPath[1]);
      if (!found) return json({ err: "Task not found" }, 404);
      return json(taskJson(found));
    }
    if (taskPath && method === "PUT") {
      const found = tasks.find((item) => item.id === taskPath[1]);
      if (!found) return json({ err: "Task not found" }, 404);
      if (typeof body.name === "string") found.name = body.name;
      if (typeof body.description === "string") found.description = body.description;
      if (typeof body.status === "string") found.statusName = body.status;
      if (typeof body.priority === "number") found.priority = body.priority;
      if (body.due_date !== undefined) found.dueDate = String(body.due_date);
      if (typeof body.parent === "string") found.parent = body.parent;
      const assignees = body.assignees as { add?: number[]; rem?: number[] } | undefined;
      if (assignees && !Array.isArray(assignees)) {
        const remove = new Set(assignees.rem ?? []);
        found.assigneeIds = [...found.assigneeIds.filter((id) => !remove.has(id)), ...(assignees.add ?? [])];
      }
      found.updatedAt = String(Date.now());
      return json(taskJson(found));
    }

    const commentPath = /^\/task\/([^/]+)\/comment$/.exec(path);
    if (commentPath && method === "GET") {
      const taskId = commentPath[1] ?? "";
      if (!tasks.some((item) => item.id === taskId)) return json({ err: "Task not found" }, 404);
      return json({
        comments: (comments.get(taskId) ?? []).map((comment) => ({
          id: comment.id,
          comment_text: comment.body,
          user: { id: comment.userId },
          date: comment.date,
        })),
      });
    }
    if (commentPath && method === "POST") {
      const taskId = commentPath[1] ?? "";
      if (!tasks.some((item) => item.id === taskId)) return json({ err: "Task not found" }, 404);
      const comment = { id: `c_${sequence++}`, body: String(body.comment_text ?? ""), userId: 42, date: now };
      const existing = comments.get(taskId) ?? [];
      existing.push(comment);
      comments.set(taskId, existing);
      return json({ id: comment.id, date: comment.date, user: { id: 42 } });
    }

    const linkPath = /^\/task\/([^/]+)\/link\/([^/]+)$/.exec(path);
    if (linkPath && method === "POST") {
      const from = tasks.find((item) => item.id === linkPath[1]);
      const to = tasks.find((item) => item.id === linkPath[2]);
      if (!from || !to) return json({ err: "Task not found" }, 404);
      const linkId = `lnk_${from.id}_${to.id}`;
      if (!from.links.some((link) => link.task_id === to.id)) {
        from.links.push({ task_id: to.id, link_id: linkId, date_created: now });
        to.links.push({ task_id: from.id, link_id: linkId, date_created: now });
      }
      return json({});
    }

    return json({ err: `unhandled ${method} ${path}` }, 404);
  };

  return { fetchImpl, state };
}

function task(
  id: string,
  name: string,
  listId: string,
  folderId: string,
  statusName: string,
  priority: number | null,
  assigneeIds: number[],
  tags: string[],
  parent: string | null,
  dueDate: string | null,
  description: string,
): MockTask {
  return {
    id,
    name,
    description,
    statusName,
    priority,
    assigneeIds,
    tags,
    parent,
    listId,
    folderId,
    dueDate,
    createdAt: "1700000000000",
    updatedAt: "1700000001000",
    customFields: [],
    links: [],
  };
}

function statusOf(name: string): { status: string; type: string } {
  return STATUSES.find((status) => status.status === name) ?? { status: name, type: "custom" };
}

function priorityOf(priority: number | null): { id: string; priority: string } | null {
  if (priority === 1) return { id: "1", priority: "urgent" };
  if (priority === 2) return { id: "2", priority: "high" };
  if (priority === 3) return { id: "3", priority: "normal" };
  if (priority === 4) return { id: "4", priority: "low" };
  return null;
}

function taskJson(item: MockTask): Record<string, unknown> {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    text_content: item.description,
    status: statusOf(item.statusName),
    date_created: item.createdAt,
    date_updated: item.updatedAt,
    due_date: item.dueDate,
    priority: priorityOf(item.priority),
    assignees: item.assigneeIds.map((id) => ({ id })),
    tags: item.tags.map((name) => ({ name })),
    parent: item.parent,
    list: { id: item.listId },
    folder: { id: item.folderId },
    custom_fields: item.customFields,
    linked_tasks: item.links,
  };
}

function listJson(list: MockList): Record<string, unknown> {
  return {
    id: list.id,
    name: list.name,
    content: list.content,
    archived: list.archived,
    task_count: list.taskCount,
    due_date: list.dueDate ?? null,
    start_date: list.startDate ?? null,
    folder: { id: list.folderId },
    space: { id: SPACE, name: "Client Work" },
    statuses: STATUSES,
  };
}

function folderJson(folder: MockFolder, lists: MockList[]): Record<string, unknown> {
  return {
    id: folder.id,
    name: folder.name,
    archived: folder.archived,
    space: { id: SPACE, name: "Client Work" },
    lists: lists.map(listJson),
    date_updated: folder.archived ? "1600000000000" : "1710000000000",
  };
}

function findList(id: string, folders: MockFolder[], archivedLists: MockList[]): MockList | undefined {
  for (const folder of folders) {
    const list = folder.lists.find((item) => item.id === id);
    if (list) return list;
  }
  return archivedLists.find((item) => item.id === id);
}

function pageTasks(tasks: MockTask[], url: URL): Record<string, unknown>[] {
  const page = Number(url.searchParams.get("page") ?? "0");
  return tasks.slice(page * 100, page * 100 + 100).map(taskJson);
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? record[key] : undefined;
}

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function expectError(fn: () => Promise<unknown>, code: string): Promise<StudioError> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof StudioError, `expected StudioError, got ${String(error)}`);
    assert(error.code === code, `expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  throw new Error(`expected ${code}`);
}

export async function exerciseClickUpAdapter(): Promise<void> {
  exerciseMapping();

  let missing: unknown;
  try {
    createClickUpStudio({});
  } catch (error) {
    missing = error;
  }
  assert(missing instanceof Error && /CLICKUP_API_TOKEN/.test(missing.message) && /CLICKUP_TEAM_ID/.test(missing.message), String(missing));
  let refused = false;
  try {
    createStudio({ LUNARCORE_ADAPTER: "clickup" });
  } catch (error) {
    refused = true;
    assert(error instanceof Error && /CLICKUP_API_TOKEN/.test(error.message), String(error));
  }
  assert(refused, "createStudio should refuse clickup without credentials");

  const env = {
    LUNARCORE_ADAPTER: "clickup",
    CLICKUP_API_TOKEN: TOKEN,
    CLICKUP_TEAM_ID: TEAM,
    LUNARCORE_WORKSPACE_NAME: "From Env",
    LUNARCORE_ACTOR_NAME: "Env Actor",
  };
  const mock = createMock();
  const studio = createClickUpStudio(env, { fetchImpl: mock.fetchImpl, minIntervalMs: 0, cacheTtlMs: 60_000 });
  assert(studio.source === "clickup", "clickup source");

  const clients = await studio.listClients({});
  const clientNames = clients.items.map((item) => item.name);
  assert(clientNames.includes("Banwa Wellness Spa"), "Banwa missing");
  assert(clientNames.includes("Old Client"), "archived client missing");
  assert(!clientNames.some((name) => name.startsWith("_TEMPLATE")), "template folder leaked into clients");
  assert(clients.items.find((item) => item.name === "Banwa Wellness Spa")?.status === "active", "Banwa status");
  assert(clients.items.find((item) => item.name === "Old Client")?.status === "archived", "old client status");
  const activeClients = await studio.listClients({ status: "active" });
  assert(activeClients.items.every((item) => item.status === "active"), "active filter");
  await expectError(() => studio.getClient({ id: "f_template" }), "not_found");

  const projects = await studio.listProjects({ clientId: "f_banwa" });
  const projectNames = projects.items.map((item) => item.name);
  assert(projectNames.includes("Active Deliverables"), projectNames.join(","));
  assert(projectNames.includes("Content Calendar") && projectNames.includes("Revisions"), projectNames.join(","));
  assert(!projectNames.some((name) => name.startsWith("_archive")), `archive list leaked: ${projectNames.join(",")}`);
  assert(!projectNames.includes("Old Campaigns"), "archived list leaked into the default project list");
  assert(projects.items.every((item) => item.clientId === "f_banwa" && item.status === "active"), "project client");

  const archivedProjects = await studio.listProjects({ clientId: "f_banwa", status: "archived" });
  const archivedNames = archivedProjects.items.map((item) => item.name).sort();
  assert(archivedNames.includes("_archive 2024") && archivedNames.includes("Old Campaigns"), archivedNames.join(","));
  const queried = await studio.listProjects({ query: "_archive" });
  assert(queried.items.some((item) => item.id === "l_archive_name"), "query should reveal _archive lists");
  const archivedById = await studio.getProject({ id: "l_archived" });
  assert(archivedById.project.status === "archived", "explicit archived list id");
  await expectError(() => studio.getProject({ id: "l_template" }), "not_found");

  const tasks = await studio.listTasks({ projectId: "l_active" });
  const titles = tasks.items.map((item) => item.title);
  assert(titles.includes("Edit reel") && titles.includes("Temp score") && titles.includes("Child cut"), titles.join(","));
  assert(!titles.includes("Launch film"), "milestone task leaked into task list");
  const child = tasks.items.find((item) => item.id === "t_child");
  assert(child?.milestoneId === "t_launch", "child should point at the milestone");
  const reel = tasks.items.find((item) => item.id === "t_edit");
  assert(reel?.status === "in_progress" && reel.priority === "high" && reel.assigneeId === "42", JSON.stringify(reel));
  const assigned = await studio.listTasks({ projectId: "l_active", assigneeId: "42" });
  assert(assigned.items.map((item) => item.id).sort().join(",") === "t_child,t_edit", assigned.items.map((item) => item.id).join(","));
  const underMilestone = await studio.listTasks({ milestoneId: "t_launch" });
  assert(underMilestone.items.length === 1 && underMilestone.items[0]?.id === "t_child", "milestone filter");

  const milestones = await studio.listMilestones({ projectId: "l_active" });
  assert(milestones.items.length === 1 && milestones.items[0]?.id === "t_launch", "tagged milestone");
  assert(milestones.items[0]?.status === "pending", "open milestone reads as pending");
  const calendarMilestones = await studio.listMilestones({ projectId: "l_calendar" });
  assert(calendarMilestones.items.some((item) => item.id === "t_brand"), "custom field milestone");
  assert(calendarMilestones.items.some((item) => item.id === "t_lock" && item.status === "done"), "closed milestone");

  const blocked = await studio.deliveryStatus({ id: "l_active" });
  assert(blocked.health === "blocked", `expected blocked, got ${blocked.health}`);
  assert(blocked.tasks.blocked.some((item) => item.id === "t_score"), "blocked task missing");
  assert(blocked.client.id === "f_banwa", "delivery client");
  const atRisk = await studio.deliveryStatus({ id: "l_revisions" });
  assert(atRisk.health === "at_risk", `expected at_risk, got ${atRisk.health}`);
  const calm = await studio.deliveryStatus({ id: "l_calendar" });
  assert(calm.health === "on_track", `expected on_track, got ${calm.health}`);

  const members = await studio.listMembers({});
  assert(members.items.some((item) => item.id === "42" && item.role === "admin"), "admin member");
  assert(members.items.some((item) => item.email === "guest@example.com" && item.role === "guest"), "guest member");
  const resolved = await studio.resolveMember({ query: "ada@lunarcore.studio" });
  assert(resolved.matches[0]?.id === "42", "exact email wins");
  const inactive = await studio.listMembers({ active: false });
  assert(inactive.total === 0, "ClickUp members in the team payload are active");

  const who = await studio.whoami();
  assert(who.actor.id === "42" && who.actor.email === "ada@lunarcore.studio", JSON.stringify(who.actor));
  assert(who.actor.name === "Ada Lovelace", "whoami should use the ClickUp user");
  const context = await studio.workspaceContext();
  assert(context.workspace.adapter === "clickup", "workspace adapter");
  assert(context.workspace.name === "Lunarcore Studios", "workspace name should be the ClickUp team");
  assert(context.persistence === "external", "clickup persistence");
  assert(context.counts.clients === 2, `clients ${context.counts.clients}`);
  assert(context.counts.projects === 4, `projects ${context.counts.projects}`);
  assert(!JSON.stringify(context).includes(TOKEN), "workspace context leaked the token");
  assert(mock.state.auths.every((value) => value === TOKEN), "Authorization must be the raw token");

  const clientHits = await studio.search({ query: "Banwa", kinds: ["client", "task"] });
  assert(clientHits.items.some((item) => item.kind === "client" && item.id === "f_banwa"), "search client");
  assert(!clientHits.items.some((item) => item.kind === "task"), "kind filter leaked tasks");
  const taskHits = await studio.search({ query: "Edit reel" });
  assert(taskHits.items.some((item) => item.kind === "task" && item.id === "t_edit"), "search task");

  const createdClient = await studio.createClient({ name: "Mori & Mill" });
  assert(createdClient.client.status === "active", "new client");
  const renamed = await studio.updateClient({ id: createdClient.client.id, name: "Mori and Mill" });
  assert(renamed.client.name === "Mori and Mill", "client rename");
  await expectError(() => studio.updateClient({ id: "f_banwa", notes: "nope" }), "not_implemented");
  assert((await studio.getClient({ id: "f_banwa" })).client.name === "Banwa Wellness Spa", "rejected client write changed the name");
  await expectError(() => studio.createClient({ name: "_TEMPLATE Sneaky" }), "invalid");

  const createdProject = await studio.createProject({
    clientId: createdClient.client.id,
    name: "Active Deliverables",
    status: "planning",
    description: "Launch set",
    dueDate: "2026-12-01",
  });
  assert(createdProject.project.status === "active", "planning reads back as active");
  assert(createdProject.project.description === "Launch set", "list content");
  await expectError(
    () => studio.updateProject({ id: "l_active", phase: "edit", name: "Should Not Stick" }),
    "not_implemented",
  );
  assert((await studio.getProject({ id: "l_active" })).project.name === "Active Deliverables", "rejected project write");

  const createdTask = await studio.createTask({
    projectId: createdProject.project.id,
    title: "Cut stills",
    status: "blocked",
    priority: "urgent",
    assigneeId: "42",
  });
  assert(createdTask.task.status === "blocked" && createdTask.task.priority === "urgent", JSON.stringify(createdTask.task));
  assert(createdTask.task.assigneeId === "42", "assignee");
  const comment = await studio.commentOnTask({ taskId: createdTask.task.id, body: "Use the wide shot.", authorId: "42" });
  assert(comment.comment.body === "Use the wide shot.", "comment body");
  await expectError(
    () => studio.commentOnTask({ taskId: createdTask.task.id, body: "no", authorId: "7" }),
    "invalid",
  );
  const updated = await studio.updateTask({ id: createdTask.task.id, status: "done" });
  assert(updated.task.status === "done", "task status update");
  assert(updated.comments.some((item) => item.body === "Use the wide shot."), "task get kept the comment");

  const milestone = await studio.upsertMilestone({ projectId: "l_revisions", name: "Shoot day", dueDate: "2026-11-02" });
  const again = await studio.upsertMilestone({ projectId: "l_revisions", name: "Shoot day", status: "in_progress" });
  assert(again.milestone.id === milestone.milestone.id, "upsert by name duplicated the milestone");
  assert(again.milestone.status === "in_progress", "milestone status");

  const link = await studio.linkEntities({
    fromKind: "task",
    fromId: "t_edit",
    toKind: "task",
    toId: "t_score",
    relation: "depends_on",
  });
  const linkAgain = await studio.linkEntities({
    fromKind: "task",
    fromId: "t_edit",
    toKind: "task",
    toId: "t_score",
    relation: "depends_on",
  });
  assert(linkAgain.link.id === link.link.id, "task link should be idempotent");
  await expectError(
    () => studio.linkEntities({ fromKind: "task", fromId: "t_edit", toKind: "task", toId: "t_edit", relation: "self" }),
    "invalid",
  );
  await expectError(
    () => studio.linkEntities({ fromKind: "client", fromId: "f_banwa", toKind: "task", toId: "t_edit", relation: "for" }),
    "not_implemented",
  );
  await expectError(() => studio.listLeads({}), "not_implemented");
  await expectError(() => studio.createDoc({ title: "Brief", body: "Nope" }), "not_implemented");
  await expectError(() => studio.logTime({ memberId: "42", minutes: 30 }), "not_implemented");
  await expectError(() => studio.pipelineSummary(), "not_implemented");

  const wrongSpace = createClickUpStudio(
    { ...env, CLICKUP_SPACE_ID: "missing-space" },
    { fetchImpl: mock.fetchImpl, minIntervalMs: 0, cacheTtlMs: 0 },
  );
  const spaceError = await expectError(() => wrongSpace.listClients({}), "invalid");
  assert(/CLICKUP_SPACE_ID=missing-space/.test(spaceError.message), spaceError.message);
  assert(/Client Work/.test(spaceError.message), spaceError.message);

  const fallback = createClickUpStudio(env, {
    fetchImpl: mock.fetchImpl,
    minIntervalMs: 0,
    cacheTtlMs: 60_000,
    spaceName: "Renamed Space",
  });
  const fallbackClients = await fallback.listClients({ limit: 1 });
  assert(fallbackClients.total >= 1, "known space id should resolve when the name does not match");

  await exerciseRateLimit();
  await exerciseLiveClickUp();
}

async function exerciseRateLimit(): Promise<void> {
  let userCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const auth = header(init, "authorization");
    if (auth !== TOKEN) return json({ err: "Token invalid" }, 401);
    if (url.includes("/user")) {
      userCalls += 1;
      if (userCalls === 1) return json({ err: "Rate limit reached" }, 429, { "retry-after": "0" });
      return json({ user: { id: 42, username: "Ada Lovelace", email: "ada@lunarcore.studio" } });
    }
    if (url.includes(`/team/${TEAM}`)) {
      return json({
        team: {
          id: TEAM,
          name: "Lunarcore Studios",
          members: [{ user: { id: 42, username: "Ada Lovelace", email: "ada@lunarcore.studio", role: 2 } }],
        },
      });
    }
    return json({ err: "not found" }, 404);
  };
  const studio = createClickUpStudio(
    { LUNARCORE_ADAPTER: "clickup", CLICKUP_API_TOKEN: TOKEN, CLICKUP_TEAM_ID: TEAM },
    { fetchImpl, minIntervalMs: 0 },
  );
  const who = await studio.whoami();
  assert(who.actor.id === "42", "rate limit retry should still resolve whoami");
  assert(userCalls >= 2, "429 should be retried");
}

async function exerciseLiveClickUp(): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  const teamId = process.env.CLICKUP_TEAM_ID?.trim();
  if (!token || !teamId) {
    console.log("clickup live skipped (CLICKUP_API_TOKEN or CLICKUP_TEAM_ID unset)");
    return;
  }
  const studio = createClickUpStudio(process.env);
  assert(studio.source === "clickup", "live source");
  const clients = await studio.listClients({ limit: 20 });
  assert(clients.items.every((item) => !item.name.startsWith("_TEMPLATE")), "live template folder leaked");
  const members = await studio.listMembers({ limit: 20 });
  assert(members.total >= 1, "live workspace has no members");
  const who = await studio.whoami();
  assert(who.actor.id.length > 0 && who.actor.email.includes("@"), "live whoami");
  const context = await studio.workspaceContext();
  assert(context.persistence === "external" && context.workspace.adapter === "clickup", "live workspace");
  assert(!JSON.stringify(context).includes(token), "live workspace context leaked the token");
  console.log(`clickup live ok (${clients.total} clients, ${members.total} members)`);
}
