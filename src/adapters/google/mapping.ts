import type { StudioMethod } from "../../types/studio.js";

/**
 * Planned Google resource map for docs, Drive search, and Calendar reminders.
 * OAuth client id, secret, and refresh token come from GOOGLE_CLIENT_ID,
 * GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.
 *
 * Clients, delivery, pipeline, members, and time stay on ClickUp. A composite
 * StudioOs should delegate those methods.
 */
export const GOOGLE_MAPPING = {
  listClients: "Delegate to the ClickUp adapter.",
  getClient: "Delegate to the ClickUp adapter.",
  createClient: "Delegate to the ClickUp adapter.",
  updateClient: "Delegate to the ClickUp adapter.",
  searchClients: "Delegate to the ClickUp adapter.",
  listProjects: "Delegate to the ClickUp adapter.",
  getProject: "Delegate to the ClickUp adapter.",
  createProject: "Delegate to the ClickUp adapter.",
  updateProject: "Delegate to the ClickUp adapter.",
  listMilestones: "Delegate to the ClickUp adapter.",
  upsertMilestone: "Delegate to the ClickUp adapter.",
  listTasks: "Delegate to the ClickUp adapter.",
  getTask: "Delegate to the ClickUp adapter.",
  createTask: "Delegate to the ClickUp adapter.",
  updateTask: "Delegate to the ClickUp adapter.",
  commentOnTask: "Delegate to the ClickUp adapter.",
  deliveryStatus: "Delegate to the ClickUp adapter.",
  listLeads: "Delegate to the ClickUp adapter.",
  getLead: "Delegate to the ClickUp adapter.",
  createLead: "Delegate to the ClickUp adapter.",
  updateLead: "Delegate to the ClickUp adapter.",
  listProposals: "Delegate to the ClickUp adapter.",
  getProposal: "Delegate to the ClickUp adapter.",
  createProposal: "Delegate to the ClickUp adapter.",
  pipelineSummary: "Delegate to the ClickUp adapter.",
  listMembers: "Delegate to the ClickUp adapter. Directory lookup can be added later.",
  resolveMember: "Delegate to the ClickUp adapter.",
  searchDocs: "Drive files.list with a fullText or name query, scoped to the studio folder.",
  getDoc: "Docs documents.get for the Drive file id.",
  createDoc: "Docs documents.create, then move the file into the client or project folder.",
  createReminder: "Calendar events.insert on the studio calendar.",
  listReminders: "Calendar events.list ordered by start time.",
  logTime: "Delegate to the ClickUp adapter.",
  timeSummary: "Delegate to the ClickUp adapter.",
  search: "Drive files.list for docs, then delegate the remaining kinds to ClickUp.",
  whoami: "OAuth2 userinfo for the refresh token's account.",
  workspaceContext: "Report the connected Google account and calendar/drive ids alongside ClickUp team context.",
  linkEntities: "Drive file appProperties or a description link when one side is a doc. Otherwise delegate.",
} satisfies Record<StudioMethod, string>;
