/** Subset of ClickUp REST API v2 payloads this adapter reads and writes. */

export interface ClickUpStatus {
  id?: string;
  status: string;
  type?: string;
  orderindex?: number;
  color?: string;
}

export interface ClickUpPriority {
  id?: string | number;
  priority?: string;
  color?: string;
}

export interface ClickUpUser {
  id?: string | number;
  username?: string;
  email?: string;
  role?: number;
  color?: string;
  initials?: string;
}

export interface ClickUpMember {
  user?: ClickUpUser;
}

export interface ClickUpTag {
  name?: string;
}

export interface ClickUpCustomField {
  id?: string;
  name?: string;
  type?: string;
  value?: unknown;
}

export interface ClickUpTaskLink {
  task_id?: string | number;
  link_id?: string | number;
  date_created?: string | number;
}

export interface ClickUpTask {
  id?: string | number;
  name?: string;
  description?: string | null;
  text_content?: string | null;
  markdown_description?: string | null;
  status?: { status?: string; type?: string } | null;
  date_created?: string | number | null;
  date_updated?: string | number | null;
  due_date?: string | number | null;
  start_date?: string | number | null;
  priority?: ClickUpPriority | null;
  assignees?: ClickUpUser[];
  tags?: ClickUpTag[];
  parent?: string | number | null;
  list?: { id?: string | number; name?: string };
  folder?: { id?: string | number; name?: string };
  space?: { id?: string | number };
  custom_fields?: ClickUpCustomField[];
  linked_tasks?: ClickUpTaskLink[];
}

export interface ClickUpList {
  id?: string | number;
  name?: string;
  content?: string | null;
  archived?: boolean;
  due_date?: string | number | null;
  start_date?: string | number | null;
  task_count?: string | number | null;
  folder?: { id?: string | number; name?: string; hidden?: boolean; access?: boolean };
  space?: { id?: string | number; name?: string };
  statuses?: ClickUpStatus[];
  date_created?: string | number | null;
  date_updated?: string | number | null;
}

export interface ClickUpFolder {
  id?: string | number;
  name?: string;
  archived?: boolean;
  hidden?: boolean;
  space?: { id?: string | number; name?: string };
  lists?: ClickUpList[];
  task_count?: string | number | null;
  date_created?: string | number | null;
  date_updated?: string | number | null;
}

export interface ClickUpSpace {
  id?: string | number;
  name?: string;
  archived?: boolean;
}

export interface ClickUpComment {
  id?: string | number;
  comment_text?: string | null;
  comment?: Array<{ text?: string }>;
  user?: { id?: string | number; username?: string };
  date?: string | number;
  date_created?: string | number;
}

export interface ClickUpTeam {
  id?: string | number;
  name?: string;
  members?: ClickUpMember[];
}
