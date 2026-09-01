/**
 * Event expense repository. booth_fee is NEVER an expense row (it lives on the
 * event), so "Total Expenses" = booth_fee + Σ expense rows with no double count.
 */
import { db } from "@/lib/db/dexie";
import { createEntity, softDeleteEntity, updateEntity } from "./baseRepository";
import type { EventExpense } from "@/types";

export interface ExpenseInput {
  event_id: string;
  description: string;
  amount: number; // cents
  category: string | null;
  expense_date: string;
  notes: string | null;
}

export async function createExpense(input: ExpenseInput): Promise<EventExpense> {
  return createEntity("eventExpense", input);
}

export async function updateExpense(
  id: string,
  patch: Partial<Pick<EventExpense, "description" | "amount" | "category" | "expense_date" | "notes">>,
): Promise<EventExpense | null> {
  return updateEntity("eventExpense", id, patch);
}

export async function softDeleteExpense(id: string): Promise<void> {
  await softDeleteEntity("eventExpense", id);
}

export async function listExpensesForEvent(eventId: string, userId: string): Promise<EventExpense[]> {
  return db.eventExpenses
    .where("event_id")
    .equals(eventId)
    .filter((e) => e.user_id === userId && !e.deleted_at)
    .sortBy("expense_date");
}
