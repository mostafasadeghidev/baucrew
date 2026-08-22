"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { SavedForm } from "@/components/saved-form";
import { DeleteButton } from "@/components/delete-button";
import { btn } from "@/components/ui/button";
import {
  createChecklistTemplate,
  deleteChecklistTemplate,
  updateChecklistTemplate,
} from "./actions";

const inputClass =
  "block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring";

export type ChecklistTemplateRow = {
  id: string;
  name: string;
  active: boolean;
  items: string[];
};

/** Reusable site checklists: name plus one line per point. */
export function ChecklistTemplates({
  templates,
}: {
  templates: ChecklistTemplateRow[];
}) {
  const t = useTranslations("checklists");
  const tc = useTranslations("common");
  const [adding, setAdding] = useState(templates.length === 0);

  return (
    <div className="space-y-4">
      {templates.length === 0 && (
        <p className="text-sm text-muted">{t("templateNone")}</p>
      )}

      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className="space-y-2 rounded-lg border border-border p-3"
        >
          <SavedForm
            id={`checklist-tpl-${tpl.id}`}
            action={updateChecklistTemplate.bind(null, tpl.id)}
            className="space-y-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                name="name"
                defaultValue={tpl.name}
                required
                aria-label={t("templateName")}
                className={`${inputClass} min-w-52 flex-1`}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={tpl.active}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {tc("active")}
              </label>
            </div>
            <textarea
              name="items"
              rows={Math.min(12, Math.max(3, tpl.items.length + 1))}
              defaultValue={tpl.items.join("\n")}
              aria-label={t("templateItems")}
              className={`${inputClass} font-mono text-xs`}
            />
          </SavedForm>
          {/* Outside the form above: a form inside a form is invalid HTML. */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              form={`checklist-tpl-${tpl.id}`}
              className={btn.primarySm}
            >
              {tc("save")}
            </button>
            <span className="ml-auto">
              <DeleteButton
                action={deleteChecklistTemplate.bind(null, tpl.id)}
                label={tc("delete")}
                confirmMessage={`${tpl.name} — ${tc("delete")}?`}
              />
            </span>
          </div>
        </div>
      ))}

      {adding ? (
        <SavedForm
          action={createChecklistTemplate}
          className="space-y-2 rounded-lg border border-dashed border-border p-3"
        >
          <input
            name="name"
            required
            placeholder={t("templateName")}
            className={inputClass}
          />
          <textarea
            name="items"
            rows={5}
            placeholder={t("templateItems")}
            className={`${inputClass} font-mono text-xs`}
          />
          <div className="flex items-center gap-2">
            <button type="submit" className={btn.primarySm}>
              {t("templateAdd")}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className={btn.outlineSm}
            >
              {tc("cancel")}
            </button>
          </div>
        </SavedForm>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={btn.outlineSm}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("templateAdd")}
        </button>
      )}
    </div>
  );
}
