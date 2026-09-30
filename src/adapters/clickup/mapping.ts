import type { StudioMethod } from "../../types/studio.js";

/**
 * Planned ClickUp resource map. The live adapter should satisfy StudioOs
 * using the team in CLICKUP_TEAM_ID and the token in CLICKUP_API_TOKEN.
 * Base URL: https://api.clickup.com/api/v2
 *
 * Docs, reminders, and calendar stay on the Google adapter. A composite
 * StudioOs should delegate those methods rather than forcing them into tasks.
 */
export const CLICKUP_MAPPING = {
  listClients: "Folders in the Clients space (GET /space/{space_id}/folder).",
  getClient: "GET /folder/{folder_id}. Store the Lunarcore id in the folder content until a custom field exists.",
  createClient: "POST /space/{space_id}/folder.",
  updateClient: "PUT /folder/{folder_id}.",
  searchClients: "List folders in the Clients space and filter by name.",
  listProjects: "Lists inside the client folder (GET /folder/{folder_id}/list).",
  getProject: "GET /list/{list_id}.",
  createProject: "POST /folder/{folder_id}/list.",
  updateProject: "PUT /list/{list_id}.",
  listMilestones: "Tasks tagged milestone in the project list (GET /list/{list_id}/task).",
  upsertMilestone: "POST or PUT a task tagged milestone. Match an existing milestone task by name when id is omitted.",
  listTasks: "GET /list/{list_id}/task, optionally filtered by parent milestone, assignee, and status.",
  getTask: "GET /task/{task_id} plus GET /task/{task_id}/comment.",
  createTask: "POST /list/{list_id}/task. Set parent to the milestone task when milestoneId is set.",
  updateTask: "PUT /task/{task_id}.",
  commentOnTask: "POST /task/{task_id}/comment.",
  deliveryStatus: "Derive from the project list's milestone and task statuses. No single ClickUp endpoint.",
  listLeads: "Tasks in the Pipeline space Leads list.",
  getLead: "GET /task/{task_id} for a lead task.",
  createLead: "POST /list/{leads_list_id}/task.",
  updateLead: "PUT /task/{task_id} for a lead task.",
  listProposals: "Tasks in the Pipeline space Proposals list.",
  getProposal: "GET /task/{task_id} for a proposal task.",
  createProposal: "POST /list/{proposals_list_id}/task and link it to the lead task.",
  pipelineSummary: "Aggregate lead and proposal tasks in the Pipeline space.",
  listMembers: "Members on GET /team/{team_id}.",
  resolveMember: "Match team members by email, then name.",
  searchDocs: "Delegate to the Google adapter. ClickUp Docs are not the system of record.",
  getDoc: "Delegate to the Google adapter.",
  createDoc: "Delegate to the Google adapter.",
  createReminder: "Delegate to Google Calendar.",
  listReminders: "Delegate to Google Calendar.",
  logTime: "POST /team/{team_id}/time_entries.",
  timeSummary: "GET /team/{team_id}/time_entries and group by assignee and task location.",
  search: "GET /team/{team_id}/task filtered by name, then join clients and projects locally.",
  whoami: "GET /user.",
  workspaceContext: "GET /team/{team_id} plus local counts once records are mapped.",
  linkEntities: "POST /task/{task_id}/link/{links_to} when both sides are tasks. Other pairs need a side table.",
} satisfies Record<StudioMethod, string>;
