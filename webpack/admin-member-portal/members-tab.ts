/**
 * Admin → Member Portal → Members (member sign-in design §11.2, A7, §10.1):
 * the lists of who may sign in, who has, whose email stops them, recent family
 * confirmations and the family emails the 7.9.0 upgrade could not move. Each
 * list reads GET /admin/api/member-portal/lists/{list} a page at a time.
 */
import {
  escapeAttribute,
  escapeHtml,
  familyLink,
  getJSON,
  muted,
  onTabShown,
  type PageResult,
  personLink,
  root,
  type ServerColumn,
  serverTable,
  t,
} from "./server-table";

interface PersonRow {
  personId: number;
  name: string;
  familyId: number | null;
  familyName: string;
  email: string;
  lastSignInDisplay: string;
  lastMethodLabel: string | null;
  lastActivityDisplay: string;
  problem?: string;
  problemLabel?: string;
  sharedWith?: Array<{ personId: number; name: string }>;
  unconfirmedEmail: string | null;
  unconfirmedSource: string | null;
  unconfirmedSourceLabel: string | null;
  unconfirmedAt: string | null;
}

interface ConfirmationRow {
  familyId: number;
  familyName: string;
  confirmedAtDisplay: string;
  personId: number | null;
  personName: string | null;
  methodLabel: string | null;
  viaLabel: string;
  result: string;
  resultLabel: string;
}

interface NotMovedRow {
  familyId: number;
  familyName: string;
  email: string;
  reason: string | null;
  reasonLabel: string;
  holderId: number | null;
  holderName: string | null;
  dateDisplay: string;
}

interface ListSummary {
  [list: string]: unknown;
  emailProblems: Record<string, number>;
  familyEmailMoves: Record<string, number>;
}

type AnyRow = PersonRow | ConfirmationRow | NotMovedRow;

const TABLE_ID = "memberListTable";

let currentList = "may-sign-in";
let currentProblem = "";
let table: DataTablesApi | null = null;

const email = (row: PersonRow): string =>
  row.email ? `<span class="text-break">${escapeHtml(row.email)}</span>` : muted(t("None"));
const lastSignIn = (row: PersonRow): string =>
  row.lastSignInDisplay ? escapeHtml(row.lastSignInDisplay) : muted(t("Never"));

const personMenu = (row: PersonRow): string =>
  window.CRM?.renderPersonActionMenu?.(row.personId, row.name, { familyId: row.familyId ?? undefined }) ?? "";

const familyMenu = (row: { familyId: number; familyName: string }): string =>
  window.CRM?.renderFamilyActionMenu?.(row.familyId, row.familyName) ?? "";

const nameColumn: ServerColumn<PersonRow> = {
  title: t("Name"),
  render: (row) => personLink(row.personId, row.name),
  priority: 1,
};
const familyColumn: ServerColumn<PersonRow> = {
  title: t("Family"),
  render: (row) => familyLink(row.familyId, row.familyName),
  priority: 5,
};
const menuColumn: ServerColumn<PersonRow> = {
  title: "",
  render: personMenu,
  className: "text-end w-1 no-export",
  priority: 2,
};

function problemCell(row: PersonRow): string {
  const label = `<span class="badge bg-warning text-white">${escapeHtml(row.problemLabel ?? "")}</span>`;
  if (row.problem === "shared_email" && row.sharedWith?.length) {
    const others = row.sharedWith.map((other) => personLink(other.personId, other.name)).join(", ");
    return `${label}<div class="small mt-1">${escapeHtml(t("Also used by"))}: ${others}</div>`;
  }
  if (row.problem === "email_unconfirmed") {
    return `${label}<div class="small text-secondary mt-1">${escapeHtml(row.unconfirmedSourceLabel ?? "")}</div>`;
  }
  return label;
}

/**
 * What staff can do about the row. An unconfirmed address is confirmed on the
 * person's page, after checking who the person is (§9); the cell carries the
 * person and the address so a Confirm button can be added here.
 */
export function attentionFixCell(row: PersonRow): string {
  const attributes = `data-cy="attention-fix" data-person-id="${row.personId}" data-problem="${escapeAttribute(row.problem ?? "")}" data-email="${escapeAttribute(row.unconfirmedEmail ?? "")}"`;
  const href = `${root()}/people/view/${row.personId}`;
  const label =
    row.problem === "email_unconfirmed"
      ? t("Check and confirm")
      : row.problem === "shared_email"
        ? t("Give each person their own email")
        : t("Add an email");
  const target = row.problem === "email_unconfirmed" ? href : `${root()}/PersonEditor.php?PersonID=${row.personId}`;
  return `<div ${attributes}><a class="btn btn-sm btn-outline-primary" href="${escapeAttribute(target)}">${escapeHtml(label)}</a></div>`;
}

const LISTS: Record<string, { description: () => string; columns: () => ServerColumn<AnyRow>[] }> = {
  "may-sign-in": {
    description: () =>
      t("The sign-in rules let them in, and each has their own email that nobody else who may sign in uses."),
    columns: () =>
      [
        nameColumn,
        familyColumn,
        { title: t("Email"), render: email, priority: 3 },
        { title: t("Last sign-in"), render: lastSignIn, priority: 4 },
        menuColumn,
      ] as ServerColumn<AnyRow>[],
  },
  "signed-in-recently": {
    description: () => t("Everyone who signed in to the Member Portal in the last 30 days, newest first."),
    columns: () =>
      [
        nameColumn,
        familyColumn,
        { title: t("Last sign-in"), render: lastSignIn, priority: 3 },
        { title: t("How"), render: (row: PersonRow) => escapeHtml(row.lastMethodLabel ?? ""), priority: 6 },
        {
          title: t("Last seen in the portal"),
          render: (row: PersonRow) => (row.lastActivityDisplay ? escapeHtml(row.lastActivityDisplay) : muted("—")),
          priority: 7,
        },
        menuColumn,
      ] as ServerColumn<AnyRow>[],
  },
  "never-signed-in": {
    description: () => t("They may sign in but never have."),
    columns: () =>
      [
        nameColumn,
        familyColumn,
        { title: t("Email"), render: email, priority: 3 },
        menuColumn,
      ] as ServerColumn<AnyRow>[],
  },
  "email-attention": {
    description: () =>
      t(
        "The sign-in rules let them in, but their email does not: they have none, share it with someone else who may sign in, or it is not confirmed yet.",
      ),
    columns: () =>
      [
        nameColumn,
        { title: t("Problem"), render: problemCell, priority: 3 },
        { title: t("Email"), render: email, priority: 5 },
        { title: t("What to do"), render: attentionFixCell, priority: 4 },
        menuColumn,
      ] as ServerColumn<AnyRow>[],
  },
  "families-confirmed": {
    description: () =>
      t("Families a member confirmed in the last 30 days, from the Member Portal or the emailed verification link."),
    columns: () =>
      [
        { title: t("Family"), render: (row: ConfirmationRow) => familyLink(row.familyId, row.familyName), priority: 1 },
        { title: t("Confirmed"), render: (row: ConfirmationRow) => escapeHtml(row.confirmedAtDisplay), priority: 3 },
        {
          title: t("By"),
          render: (row: ConfirmationRow) =>
            row.personId ? personLink(row.personId, row.personName) : muted(row.viaLabel),
          priority: 4,
        },
        {
          title: t("Result"),
          render: (row: ConfirmationRow) =>
            row.result === "no-change"
              ? `<span class="badge bg-success text-white">${escapeHtml(row.resultLabel)}</span>`
              : `<span class="badge bg-warning text-white">${escapeHtml(row.resultLabel)}</span>`,
          priority: 5,
        },
        { title: "", render: familyMenu, className: "text-end w-1 no-export", priority: 2 },
      ] as ServerColumn<AnyRow>[],
  },
  "family-emails-not-moved": {
    description: () =>
      t(
        "The 7.9.0 upgrade gave each family email to a person. These it could not, so it left a note in the family's timeline instead.",
      ),
    columns: () =>
      [
        { title: t("Family"), render: (row: NotMovedRow) => familyLink(row.familyId, row.familyName), priority: 1 },
        {
          title: t("Family email"),
          render: (row: NotMovedRow) => `<span class="text-break">${escapeHtml(row.email)}</span>`,
          priority: 3,
        },
        {
          title: t("Why"),
          render: (row: NotMovedRow) =>
            escapeHtml(row.reasonLabel) +
            (row.holderId ? `<div class="small mt-1">${personLink(row.holderId, row.holderName)}</div>` : ""),
          priority: 4,
        },
        { title: "", render: familyMenu, className: "text-end w-1 no-export", priority: 2 },
      ] as ServerColumn<AnyRow>[],
  },
};

function load(start: number, length: number, search: string): Promise<PageResult<AnyRow>> {
  return getJSON<PageResult<AnyRow>>(`member-portal/lists/${currentList}`, {
    start,
    length,
    search,
    problem: currentList === "email-attention" ? currentProblem : "",
  });
}

function showList(list: string): void {
  const definition = LISTS[list];
  const tableElement = document.getElementById(TABLE_ID) as HTMLTableElement | null;
  if (!definition || !tableElement) {
    return;
  }
  currentList = list;

  for (const button of document.querySelectorAll<HTMLButtonElement>("#memberListPicker [data-list]")) {
    const active = button.dataset.list === list;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  const title = document.getElementById("memberListTitle");
  const picked = document.querySelector<HTMLElement>(`#memberListPicker [data-list="${list}"] span:first-child`);
  if (title && picked) {
    title.textContent = picked.textContent?.trim() ?? "";
  }
  const description = document.getElementById("memberListDescription");
  if (description) {
    description.textContent = definition.description();
  }
  document.getElementById("memberListProblemBar")?.classList.toggle("d-none", list !== "email-attention");
  document.getElementById("memberListMoveCounts")?.classList.toggle("d-none", list !== "family-emails-not-moved");

  table = serverTable<AnyRow>(tableElement, definition.columns(), load);
}

async function loadSummary(): Promise<void> {
  let summary: ListSummary;
  try {
    summary = await getJSON<ListSummary>("member-portal/lists");
  } catch {
    return;
  }
  for (const badge of document.querySelectorAll<HTMLElement>("[data-count-for]")) {
    const count = summary[badge.dataset.countFor ?? ""];
    badge.textContent = typeof count === "number" ? String(count) : "";
  }
  for (const badge of document.querySelectorAll<HTMLElement>("[data-problem-count]")) {
    badge.textContent = String(summary.emailProblems?.[badge.dataset.problemCount ?? ""] ?? 0);
  }
  for (const cell of document.querySelectorAll<HTMLElement>("[data-move-count]")) {
    cell.textContent = String(summary.familyEmailMoves?.[cell.dataset.moveCount ?? ""] ?? 0);
  }
}

export function wireMembersTab(): void {
  const picker = document.getElementById("memberListPicker");
  if (!picker) {
    return;
  }

  picker.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-list]");
    if (button?.dataset.list && button.dataset.list !== currentList) {
      showList(button.dataset.list);
    }
  });

  document.getElementById("memberListProblems")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-problem]");
    if (!button) {
      return;
    }
    currentProblem = button.dataset.problem ?? "";
    for (const other of document.querySelectorAll<HTMLButtonElement>("#memberListProblems [data-problem]")) {
      other.classList.toggle("active", other === button);
    }
    table?.draw();
  });

  onTabShown("portal-members-tab", () => {
    void loadSummary();
    showList(currentList);
  });
}
