export type AdminRole = "admin" | "support_agent";

export type AdminProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AdminRole;
  role_label?: string | null;
  is_blocked: boolean;
  permissions: Record<string, boolean>;
};

export type ColumnConfig = {
  key: string;
  label: {
    ar: string;
    en: string;
  };
  tone?: "money" | "status" | "date" | "long" | "json";
};

export type RowAction =
  | "approve_merchant"
  | "reject_merchant"
  | "approve_branch"
  | "reject_branch"
  | "block_user"
  | "unblock_user"
  | "set_user_password"
  | "toggle_active"
  | "edit_row";

export type SectionConfig = {
  id: string;
  href: string;
  icon: string;
  title: {
    ar: string;
    en: string;
  };
  description: {
    ar: string;
    en: string;
  };
  mode: "dashboard" | "table" | "support" | "reports" | "settings" | "catalog" | "broadcast" | "staff";
  source?: string;
  sourceKind?: "view" | "table" | "rpc";
  orderBy?: string;
  searchKeys?: string[];
  columns?: ColumnConfig[];
  actions?: RowAction[];
  rowIdKey?: string;
  editableTable?: string;
  editableFields?: string[];
  allowedRoles?: AdminRole[];
  supportPermission?: string;
  hidden?: boolean;
};

export type AdminActionRequest = {
  action: string;
  table?: string;
  id?: string;
  values?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};
