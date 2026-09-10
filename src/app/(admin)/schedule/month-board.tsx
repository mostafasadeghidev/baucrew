"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  DRAG_THRESHOLD,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  carry,
  drop as dropGhost,
  lift,
  zoneAtPoint,
} from "@/lib/card-lift";
import { useTranslations } from "next-intl";
import type { ComboboxOption } from "@/components/combobox";
import {
  copyScheduleEntry,
  createScheduleEntry,
  deleteScheduleEntry,
  moveScheduleEntry,
  updateScheduleEntry,
} from "./actions";
import { EntryDialog, type AbsenceHint, type BoardEntry, type DialogState } from "./entry-dialog";
import { btn } from "@/components/ui/button";
import { PagePanel } from "@/components/ui/page-panel";
import { ScheduleControls, ScheduleHeader } from "./schedule-header";

const MAX_PER_DAY = 5;

/**
 * Interactive month calendar: same dialog, create (+) and drag & drop as the
 * week board, on a compact grid. Mouse uses native HTML5 drag & drop; touch
 * pointers pick a chip up with a long-press.
 */
export function MonthBoard({
  weeks,
  monthKey,
  monthLabel,
  weekdayLabels,
  weekNumbers,
  todayIso,
  entries,
  prevHref,
  nextHref,
  currentHref,
  weekHref,
  mapHref,
  projects,
  employees,
  vehicles,
  absences = [],
}: {
  weeks: string[][];
  /** "yyyy-mm" of the displayed month (other days are dimmed). */
  monthKey: string;
  monthLabel: string;
  weekdayLabels: string[];
  weekNumbers: number[];
  todayIso: string;
  entries: BoardEntry[];
  prevHref: string;
  nextHref: string;
  currentHref: string;
  weekHref: string;
  mapHref: string;
  projects: ComboboxOption[];
  employees: ComboboxOption[];
  vehicles: ComboboxOption[];
  absences?: AbsenceHint[];
}) {
  const t = useTranslations("schedule");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();
  /** Today when it falls in this month, otherwise the month's first day. */
  const newEntryDate = todayIso.startsWith(monthKey) ? todayIso : `${monthKey}-01`;
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [boardError, setBoardError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const byDay = new Map<string, BoardEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  function errorText(key: string | undefined): string | null {
    if (!key) return null;
    if (key === "duplicateEntry") return t("duplicateEntry");
    if (key === "projectRequired") return t("projectRequired");
    return tc("saveFailed");
  }
  function moveTo(id: string, date: string, copy = false) {
    setDropTarget(null);
    setBoardError(null);
    startTransition(async () => {
      const result = copy
        ? await copyScheduleEntry(id, date)
        : await moveScheduleEntry(id, date);
      if (result.error) setBoardError(errorText(result.error));
    });
  }

  // Picking a chip up — the same gesture as the week board, and as the project
  // board: a mouse lifts after six pixels, a finger after resting a quarter of
  // a second, and what follows the pointer is the chip itself.
  const grab = useRef<{
    id: string;
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
    startX: number;
    startY: number;
    ghost: HTMLElement | null;
    el: HTMLElement;
  } | null>(null);
  const suppressClick = useRef(false);

  function cellAtPoint(x: number, y: number): string | null {
    return zoneAtPoint(x, y, "[data-day-column]", "dayColumn");
  }

  function pickUp(state: NonNullable<typeof grab.current>, pointerId: number) {
    state.active = true;
    state.ghost = lift(state.el);
    try {
      state.el.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }

  function onChipPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    entryId: string,
  ) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    const state = {
      id: entryId,
      timer: null as ReturnType<typeof setTimeout> | null,
      active: false,
      startX: e.clientX,
      startY: e.clientY,
      ghost: null as HTMLElement | null,
      el,
    };
    if (e.pointerType === "mouse") {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    } else {
      const pointerId = e.pointerId;
      state.timer = setTimeout(() => {
        if (grab.current !== state) return;
        pickUp(state, pointerId);
        if (navigator.vibrate) navigator.vibrate(15);
      }, LONG_PRESS_MS);
    }
    grab.current = state;
  }

  function onChipPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = grab.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (!state.active) {
      if (state.timer) {
        if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) {
          clearTimeout(state.timer);
          grab.current = null;
        }
        return;
      }
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      pickUp(state, e.pointerId);
    }
    e.preventDefault();
    carry(state.ghost, dx, dy);
    setDropTarget(cellAtPoint(e.clientX, e.clientY));
  }

  function onChipPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const state = grab.current;
    grab.current = null;
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    if (!state.active) return;
    dropGhost(state.ghost, state.el);
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 300);
    const target = cellAtPoint(e.clientX, e.clientY);
    // Ctrl / ⌘ on release duplicates the assignment onto that day.
    if (target) moveTo(state.id, target, e.ctrlKey || e.metaKey);
    else setDropTarget(null);
  }

  return (
    <div className="space-y-4">
      <ScheduleHeader
        title={t("title")}
        action={
          <button
            type="button"
            onClick={() => setDialog({ mode: "create", date: newEntryDate })}
            className={btn.primary}
          >
            {t("planEntry")}
          </button>
        }
      />

      <PagePanel className="space-y-3 p-4">
        <ScheduleControls
          view="month"
          weekHref={weekHref}
          monthHref={currentHref}
          mapHref={mapHref}
          viewLabels={{ week: t("viewWeek"), month: t("viewMonth"), map: t("viewMap") }}
          prevHref={prevHref}
          nextHref={nextHref}
          currentHref={currentHref}
          currentLabel={t("current")}
          prevLabel={t("prevMonth")}
          nextLabel={t("nextMonth")}
        >
          {/* Which month this is, where the week board says which week it
              is: on the sheet, not beside the page's name. */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="whitespace-nowrap text-sm font-semibold">{monthLabel}</span>
            {boardError && (
              <span role="alert" className="truncate text-xs font-medium text-danger">
                {boardError}
              </span>
            )}
          </div>
        </ScheduleControls>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="w-12 px-2 py-2 font-medium">KW</th>
              {weekdayLabels.map((l) => (
                <th key={l} className="px-2 py-2 font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => {
              const currentWeek = week.includes(todayIso);
              return (
                <tr
                  key={week[0]}
                  className={`border-b border-border last:border-b-0 ${
                    currentWeek
                      ? "bg-accent/[0.04] ring-1 ring-inset ring-accent/25"
                      : ""
                  }`}
                >
                  <td className="px-2 py-2 align-top">
                    <Link
                      href={`/schedule?week=${week[0]}`}
                      className="font-semibold text-accent hover:underline"
                    >
                      {weekNumbers[wi]}
                    </Link>
                  </td>
                  {week.map((day) => {
                    const dayEntries = byDay.get(day) ?? [];
                    const expanded = expandedDay === day;
                    const shown = expanded
                      ? dayEntries
                      : dayEntries.slice(0, MAX_PER_DAY);
                    const extra = dayEntries.length - shown.length;
                    const inMonth = day.slice(0, 7) === monthKey;
                    const isWeekend = [0, 6].includes(
                      new Date(`${day}T00:00:00.000Z`).getUTCDay(),
                    );
                    return (
                      <td
                        key={day}
                        data-day-column={day}
                        className={`group h-24 border-l border-border px-1.5 py-1.5 align-top transition-colors ${
                          inMonth ? "" : "bg-surface-hover/50 text-muted"
                        } ${isWeekend ? "bg-surface-hover/30" : ""} ${day === todayIso ? "bg-accent/5" : ""} ${
                          dropTarget === day
                            ? "ring-1 ring-inset ring-accent bg-accent/10"
                            : ""
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <Link
                            href={`/schedule?week=${week[0]}`}
                            className={`inline-block rounded px-1 text-[11px] font-semibold tabular-nums ${
                              day === todayIso
                                ? "bg-accent text-accent-foreground"
                                : ""
                            }`}
                          >
                            {Number(day.slice(8, 10))}
                          </Link>
                          {day >= todayIso && (
                            <button
                              type="button"
                              onClick={() =>
                                setDialog({ mode: "create", date: day })
                              }
                              title={t("addEntry")}
                              aria-label={t("addEntry")}
                              className="flex h-5 w-5 items-center justify-center rounded border border-border text-[11px] text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {shown.map((e) => (
                            <div
                              key={e.id}
                              role="button"
                              tabIndex={0}
                              onPointerDown={(ev) =>
                                onChipPointerDown(ev, e.id)
                              }
                              onPointerMove={onChipPointerMove}
                              onPointerUp={onChipPointerEnd}
                              onPointerCancel={onChipPointerEnd}
                              onClick={() => {
                                if (suppressClick.current) return;
                                setDialog({ mode: "edit", entry: e });
                              }}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter")
                                  setDialog({ mode: "edit", entry: e });
                              }}
                              style={{ touchAction: "pan-y" }}
                              title={[
                                e.projectName,
                                [e.startTime, e.endTime]
                                  .filter(Boolean)
                                  .join("–"),
                                e.vehicles.map((v) => v.name).join(", "),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              className={`cursor-grab truncate rounded px-1 py-0.5 hover:ring-1 hover:ring-accent active:cursor-grabbing ${
                                ["COMPLETED", "INVOICED", "PAID"].includes(
                                  e.projectStatus ?? "",
                                )
                                  ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                                  : e.hasConflict
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                    : "bg-accent/10 text-foreground"
                              }`}
                            >
                              {["COMPLETED", "INVOICED", "PAID"].includes(e.projectStatus ?? "") && "✓ "}
                              {e.hasConflict && "⚠ "}
                              {e.projectName}
                            </div>
                          ))}
                          {extra > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedDay(day)}
                              className="mt-0.5 block w-full rounded border border-dashed border-accent/60 bg-accent/5 px-1 py-0.5 text-center text-[11px] font-medium text-accent hover:bg-accent/15"
                            >
                              {t("moreEntries", { count: extra })}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </PagePanel>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
        <span>{t("dragHint")}</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-border bg-subtle px-1.5 py-0.5 font-sans text-[11px] font-medium text-foreground">
            Ctrl
          </kbd>
          <span>{t("dragCopyHint")}</span>
        </span>
      </p>

      {dialog.mode !== "closed" && (
        <EntryDialog
          key={
            dialog.mode === "edit" ? dialog.entry.id : `create-${dialog.date}`
          }
          dialog={dialog}
          projects={projects}
          employees={employees}
          vehicles={vehicles}
          absences={absences}
          pending={pending}
          onClose={() => setDialog({ mode: "closed" })}
          onSubmit={(input, entryId) => {
            startTransition(async () => {
              const result = entryId
                ? await updateScheduleEntry(entryId, input)
                : await createScheduleEntry(input);
              if (result.error) setBoardError(errorText(result.error));
              else setDialog({ mode: "closed" });
            });
          }}
          onDelete={(entryId) => {
            startTransition(async () => {
              await deleteScheduleEntry(entryId);
              setDialog({ mode: "closed" });
            });
          }}
        />
      )}
    </div>
  );
}
