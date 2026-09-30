import type {
  Client,
  Doc,
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
import { nowIso, todayUtc } from "./support.js";

export interface SeedRecords {
  members: Member[];
  clients: Client[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  comments: TaskComment[];
  leads: Lead[];
  proposals: Proposal[];
  docs: Doc[];
  reminders: Reminder[];
  timeEntries: TimeEntry[];
  links: EntityLink[];
}

function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Realistic studio records so list/get/search work before any writes. */
export function seedRecords(now = nowIso()): SeedRecords {
  const members: Member[] = [
    {
      id: "mem_iris",
      name: "Iris Chen",
      email: "iris@lunarcore.studio",
      role: "Creative Director",
      active: true,
    },
    {
      id: "mem_julian",
      name: "Julian Park",
      email: "julian@lunarcore.studio",
      role: "Producer",
      active: true,
    },
  ];

  const clients: Client[] = [
    {
      id: "cli_helios",
      name: "Helios Atelier",
      status: "active",
      industry: "fashion",
      primaryContact: { name: "Mara Voss", email: "mara@helios.example" },
      notes: "Quiet luxury. Prefers natural light and no voiceover.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "cli_northline",
      name: "Northline Audio",
      status: "active",
      industry: "music",
      primaryContact: { name: "Evan Brooks", email: "evan@northline.example" },
      notes: "Listening room relaunch. Site plus a short spatial-audio piece.",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const projects: Project[] = [
    {
      id: "prj_helios_ss26",
      clientId: "cli_helios",
      name: "Helios SS26 Lookbook Film",
      status: "active",
      phase: "Production",
      startDate: day(-14),
      dueDate: day(21),
      description: "60s master and 15s cutdown for the spring lookbook.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "prj_northline_site",
      clientId: "cli_northline",
      name: "Northline Listening Room Site",
      status: "planning",
      phase: "Discovery",
      startDate: todayUtc(),
      dueDate: day(45),
      description: "Marketing site for the new listening room.",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const milestones: Milestone[] = [
    {
      id: "mls_helios_cut",
      projectId: "prj_helios_ss26",
      name: "Rough cut",
      status: "in_progress",
      dueDate: day(5),
      description: "Internal rough cut for the Helios review.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "mls_helios_delivery",
      projectId: "prj_helios_ss26",
      name: "Final delivery",
      status: "pending",
      dueDate: day(21),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "mls_northline_ia",
      projectId: "prj_northline_site",
      name: "Information architecture",
      status: "pending",
      dueDate: day(10),
      createdAt: now,
      updatedAt: now,
    },
  ];

  const tasks: Task[] = [
    {
      id: "tsk_helios_grade",
      projectId: "prj_helios_ss26",
      milestoneId: "mls_helios_cut",
      title: "Color grade selects",
      description: "Grade the hero selects before the rough cut locks.",
      status: "in_progress",
      assigneeId: "mem_iris",
      dueDate: day(4),
      priority: "high",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tsk_helios_music",
      projectId: "prj_helios_ss26",
      milestoneId: "mls_helios_cut",
      title: "Temp score pass",
      description: "Waiting on licensed stems from the client.",
      status: "blocked",
      assigneeId: "mem_julian",
      dueDate: day(3),
      priority: "urgent",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tsk_northline_sitemap",
      projectId: "prj_northline_site",
      milestoneId: "mls_northline_ia",
      title: "Sitemap draft",
      status: "todo",
      assigneeId: "mem_julian",
      dueDate: day(8),
      priority: "normal",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const comments: TaskComment[] = [
    {
      id: "cmt_helios_music",
      taskId: "tsk_helios_music",
      authorId: "mem_julian",
      body: "Blocked on client stems. Chase Mara if nothing arrives before the rough cut.",
      createdAt: now,
    },
  ];

  const leads: Lead[] = [
    {
      id: "led_vesper",
      name: "Vesper Ceramics",
      company: "Vesper Ceramics",
      email: "hello@vesper.example",
      source: "referral",
      stage: "qualified",
      ownerId: "mem_iris",
      notes: "Wants a brand film for the spring collection.",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const proposals: Proposal[] = [
    {
      id: "prp_vesper",
      leadId: "led_vesper",
      title: "Vesper brand film",
      status: "draft",
      amount: 18000,
      currency: "USD",
      summary: "Short film and stills for the spring collection.",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const docs: Doc[] = [
    {
      id: "doc_helios_brief",
      title: "Helios SS26 creative brief",
      body: "Lookbook film. Quiet luxury, natural light, no voiceover. Deliver a 60s master and a 15s cutdown.",
      kind: "brief",
      clientId: "cli_helios",
      projectId: "prj_helios_ss26",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const reminders: Reminder[] = [
    {
      id: "rem_helios_review",
      title: "Helios rough-cut review",
      dueAt: `${day(1)}T15:00:00.000Z`,
      assigneeId: "mem_julian",
      related: { kind: "project", id: "prj_helios_ss26" },
      notes: "Internal review before sending to Mara.",
      createdAt: now,
    },
  ];

  const timeEntries: TimeEntry[] = [
    {
      id: "tim_helios_grade",
      memberId: "mem_iris",
      projectId: "prj_helios_ss26",
      taskId: "tsk_helios_grade",
      minutes: 90,
      date: todayUtc(),
      note: "Selects pass",
      createdAt: now,
    },
  ];

  const links: EntityLink[] = [
    {
      id: "lnk_helios_brief",
      from: { kind: "doc", id: "doc_helios_brief" },
      to: { kind: "project", id: "prj_helios_ss26" },
      relation: "brief_for",
      createdAt: now,
    },
  ];

  return {
    members,
    clients,
    projects,
    milestones,
    tasks,
    comments,
    leads,
    proposals,
    docs,
    reminders,
    timeEntries,
    links,
  };
}
