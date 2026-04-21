// Core entity types for the Marketing Dashboard

export interface Status {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface Channel {
  id: string;
  name: string;
  color: string;
}

export interface Country {
  id: string;
  name: string;
  region: string;
  color: string;
  flag: string;
}

export interface Priority {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  trelloCheckItemId?: string;
  order?: number;
}

export interface Checklist {
  id: string;
  name: string;
  items: ChecklistItem[];
  trelloChecklistId?: string;
  order?: number;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  date: string;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  name: string;
  url?: string;
  data?: string;
  thumbnailUrl?: string;
  size?: number;
  date?: string;
}

export interface Task {
  id: string;
  actionId: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  month?: number;
  startDate?: string;
  dueDate?: string;
  budget?: number;
  order?: number;
  channels?: string[];
  countries?: string[];
  otherLabels?: Array<{ id: string; name: string }>;
  assignees?: string[];
  swimLane?: number; // Timeline vertical pinning (local-only, never pushed to Trello)
  checklist?: ChecklistItem[];
  checklists?: Checklist[];
  comments?: Comment[];
  attachments?: Attachment[];
  createdAt?: string;
  updatedAt?: string;
  orderUpdatedAt?: string;
  // Trello sync fields
  trelloCardId?: string;
  trelloCheckItemId?: string;
  trelloChecklistId?: string;
  trelloChecklistName?: string;
  trelloLastModified?: string;
  trelloArchived?: boolean;
  trelloItemDeleted?: boolean;
  _trelloBaseline?: Record<string, unknown>;
  _inheritChannels?: string[];
  _inheritCountries?: string[];
  _inheritOtherLabels?: string[];
}

export interface Action {
  id: string;
  name: string;
  categoryId: string;
  budget?: number;
  priority?: string;
  tags?: string[];
  status?: string;
  description?: string;
  startDate?: string;
  dueDate?: string;
  order?: number;
  countries?: string[];
  otherLabels?: Array<{ id: string; name: string }>;
  assignees?: string[];
  comments?: Comment[];
  attachments?: Attachment[];
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
  orderUpdatedAt?: string;
  // Trello sync fields
  trelloCardId?: string;
  trelloLastModified?: string;
  trelloArchived?: boolean;
  _trelloBaseline?: Record<string, unknown>;
  _inheritChannels?: string[];
  _inheritCountries?: string[];
  _inheritOtherLabels?: string[];
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  gradient?: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
  // Trello sync fields
  trelloListId?: string;
}

export interface LabelMapping {
  labelId: string;
  target: string;
  value: string;
}

export interface TrelloSync {
  boardId?: string;
  syncMode?: 'card-as-task' | 'card-as-action';
  lastSyncDate?: string;
  labelMappings?: LabelMapping[];
  pollingInterval?: number;
  _recentlyDeletedCardIds?: Array<{ id: string; at: string }>;
  _recentlyDeletedListIds?: Array<{ id: string; at: string }>;
}

export interface BoardMember {
  id: string;
  fullName: string;
  username?: string;
  avatarUrl?: string;
}

export interface Board {
  id: string;
  name: string;
  categories: Category[];
  actions: Action[];
  tasks: Task[];
  trelloSync?: TrelloSync;
  members?: BoardMember[];
}

export interface BoardData {
  version: 2;
  currentBoardId: string;
  boards: Board[];
}

export interface Filters {
  search: string;
  status: string[];
  priority: string[];
  category: string[];
  channel: string[];
  country: string[];
  member: string[];
  otherLabel: string[];
  showArchived?: boolean;
}
