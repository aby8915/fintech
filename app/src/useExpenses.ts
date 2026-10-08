import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { call } from "./api";

export type Expense = {
  id: string; amount_minor: number; currency: string; category: string;
  expense_date: string; merchant: string | null; note: string | null; source: string;
};

export function useMonthExpenses(month: string) {
  const [items, setItems] = useState<Expense[] | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    try {
      setItems((await call<{ items: Expense[] }>(`/expenses?month=${month}`)).items);
      setError(false);
    } catch {
      setError(true);
    }
  }, [month]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { items, error, reload };
}
