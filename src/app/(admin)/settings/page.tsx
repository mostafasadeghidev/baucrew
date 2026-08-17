import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { getBranding } from "@/lib/branding";
import {
  createCategory,
  updateCategory,
  updateCompanyName,
  updatePrepTab,
  updateRainThreshold,
} from "./actions";
import { getRainThreshold } from "@/lib/weather";
import { getPrepTabConfig } from "@/lib/prep-tab-db";
import { ALL_PROJECT_STATUSES } from "@/lib/prep-tab";
import { LogoUploader } from "./logo-uploader";
import { BackupRestore } from "./backup-restore";
import { SavedForm } from "@/components/saved-form";
import { ParamTabs } from "@/components/param-tabs";

const inputClass =
  "block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const { tab: tabParam } = await searchParams;
  const tab = ["accounts", "categories", "data"].includes(tabParam ?? "")
    ? (tabParam as string)
    : "";
  const [t, tNav, tRoles, tc, tImport, tStatus, tProjects] = await Promise.all([
    getTranslations("settings"),
    getTranslations("nav"),
    getTranslations("roles"),
    getTranslations("common"),
    getTranslations("importTrello"),
    getTranslations("status"),
    getTranslations("projects"),
  ]);

  const [users, categories, branding] = await Promise.all([
    db.user.findMany({
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ active: "desc" }, { username: "asc" }],
    }),
    db.workCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    getBranding(),
  ]);

  const [rainThreshold, prepTab] = await Promise.all([
    getRainThreshold(),
    getPrepTabConfig(),
  ]);
  const systemUsers = users.filter((u) => !u.employee);
  const privileged = users.filter(
    (u) => u.role === "ADMIN" || u.canViewFinancials,
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {tNav("settings")}
      </h1>

      <ParamTabs
        ariaLabel={tNav("settings")}
        tabs={[
          { value: "", label: t("tabGeneral") },
          { value: "accounts", label: t("tabAccounts") },
          { value: "categories", label: t("tabCategories") },
          { value: "data", label: t("tabData") },
        ]}
      />

      {tab === "accounts" && (
        <div className="space-y-8">
          {/* System accounts (not linked to an employee) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {t("usersUnlinkedTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {t("usersUnlinkedHint")}
                </p>
              </div>
              <Link
                href="/settings/users/new"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
              >
                {t("newUser")}
              </Link>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">{t("username")}</th>
                    <th className="px-4 py-3 font-medium">{t("role")}</th>
                    <th className="px-4 py-3 font-medium">
                      {t("financialAccess")}
                    </th>
                    <th className="px-4 py-3 font-medium">{tc("active")}</th>
                    <th className="px-4 py-3 text-right font-medium">
                      {tc("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {systemUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-medium">{u.username}</td>
                      <td className="px-4 py-3">{tRoles(u.role)}</td>
                      <td className="px-4 py-3">
                        {u.role === "ADMIN" || u.canViewFinancials ? "✓" : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.active
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300"
                          }`}
                        >
                          {u.active ? tc("active") : tc("inactive")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/settings/users/${u.id}`}
                          className="text-accent hover:underline"
                        >
                          {tc("edit")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Privileged accounts overview (admins + financial access), read-only */}
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{t("privilegedTitle")}</h2>
              <p className="mt-0.5 text-xs text-muted">{t("privilegedHint")}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">{t("username")}</th>
                    <th className="px-4 py-3 font-medium">
                      {t("linkedEmployeeCol")}
                    </th>
                    <th className="px-4 py-3 font-medium">{t("role")}</th>
                    <th className="px-4 py-3 font-medium">
                      {t("financialAccess")}
                    </th>
                    <th className="px-4 py-3 font-medium">{tc("active")}</th>
                    <th className="px-4 py-3 text-right font-medium">
                      {tc("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {privileged.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-medium">{u.username}</td>
                      <td className="px-4 py-3 text-muted">
                        {u.employee
                          ? `${u.employee.firstName} ${u.employee.lastName}`.trim()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.role === "ADMIN"
                              ? "bg-red-500/15 text-red-700 dark:text-red-400"
                              : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400"
                          }`}
                        >
                          {tRoles(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          €
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.active ? tc("active") : tc("inactive")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={
                            u.employee
                              ? `/employees/${u.employee.id}`
                              : `/settings/users/${u.id}`
                          }
                          className="text-accent hover:underline"
                        >
                          {u.employee ? t("openEmployee") : tc("edit")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "" && (
        <div className="space-y-8">
          {/* Branding */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("companyNameTitle")}</h2>
            <SavedForm
              action={updateCompanyName}
              className="flex max-w-2xl flex-wrap items-center gap-2"
            >
              <input
                name="companyName"
                defaultValue={branding.companyName}
                maxLength={100}
                aria-label={t("companyNameTitle")}
                className={`${inputClass} min-w-64 flex-1`}
              />
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
              >
                {tc("save")}
              </button>
            </SavedForm>
            <p className="text-xs text-muted">{t("companyNameHint")}</p>
          </section>

          {/* Logo */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("logoTitle")}</h2>
            <LogoUploader hasLogo={branding.hasLogo} />
          </section>

          {/* Weather */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("weatherTitle")}</h2>
            <SavedForm
              action={updateRainThreshold}
              className="flex max-w-2xl flex-wrap items-center gap-2"
            >
              <label htmlFor="rainThreshold" className="text-sm">
                {t("weatherThresholdLabel")}
              </label>
              <input
                id="rainThreshold"
                name="rainThreshold"
                type="number"
                min={0}
                max={100}
                step={5}
                defaultValue={rainThreshold}
                className={`${inputClass.replace('w-full', '')} w-24`}
              />
              <span className="text-sm text-muted">%</span>
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
              >
                {tc("save")}
              </button>
            </SavedForm>
            <p className="max-w-2xl text-xs text-muted">{t("weatherHint")}</p>
          </section>

          {/* Project list: "Zur Vorbereitung" tab */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("prepTabTitle")}</h2>
            <p className="max-w-2xl text-xs text-muted">{t("prepTabHint")}</p>
            <SavedForm
              action={updatePrepTab}
              className="max-w-2xl space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={prepTab.enabled}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {t("prepTabEnabled")}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="prepTabLabel" className="text-sm">
                  {t("prepTabLabel")}
                </label>
                <input
                  id="prepTabLabel"
                  name="label"
                  type="text"
                  maxLength={40}
                  defaultValue={prepTab.label}
                  placeholder={tProjects("tabPreparation")}
                  className={`${inputClass.replace('w-full', '')} w-64`}
                />
              </div>
              <fieldset>
                <legend className="text-sm">{t("prepTabStatuses")}</legend>
                <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {ALL_PROJECT_STATUSES.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        name={`status_${s}`}
                        defaultChecked={prepTab.statuses.includes(s)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      {tStatus(s)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="unscheduledOnly"
                  defaultChecked={prepTab.unscheduledOnly}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {t("prepTabUnscheduledOnly")}
              </label>
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
              >
                {tc("save")}
              </button>
            </SavedForm>
          </section>
        </div>
      )}

      {tab === "data" && (
        <div className="space-y-8">
          {/* Backup & restore */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("backupTitle")}</h2>
            <BackupRestore />
          </section>

          {/* Audit log */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("auditTitle")}</h2>
            <p className="text-xs text-muted">{t("auditHint")}</p>
            <Link
              href="/settings/audit"
              className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              {t("openAudit")}
            </Link>
          </section>

          {/* Import */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{tImport("title")}</h2>
            <Link
              href="/settings/import-trello"
              className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              {tImport("settingsLink")}
            </Link>
          </section>
        </div>
      )}

      {tab === "categories" && (
        <div className="space-y-8">
          {/* Work categories */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("categoriesTitle")}</h2>
            <div className="max-w-2xl space-y-2">
              {categories.map((c) => (
                <SavedForm
                  key={c.id}
                  action={updateCategory.bind(null, c.id)}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2"
                >
                  <input
                    name="nameDe"
                    defaultValue={c.nameDe}
                    required
                    aria-label={t("nameDe")}
                    className={`${inputClass} min-w-40 flex-1`}
                  />
                  <input
                    name="nameEn"
                    defaultValue={c.nameEn}
                    required
                    aria-label={t("nameEn")}
                    className={`${inputClass} min-w-40 flex-1`}
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 px-1 text-sm">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={c.active}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    {tc("active")}
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
                  >
                    {tc("save")}
                  </button>
                </SavedForm>
              ))}

              <SavedForm
                action={createCategory}
                resetOnSave
                className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-surface p-2"
              >
                <input
                  name="nameDe"
                  placeholder={t("nameDe")}
                  required
                  className={`${inputClass} min-w-40 flex-1`}
                />
                <input
                  name="nameEn"
                  placeholder={t("nameEn")}
                  required
                  className={`${inputClass} min-w-40 flex-1`}
                />
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
                >
                  {t("addCategory")}
                </button>
              </SavedForm>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
