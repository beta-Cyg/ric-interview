import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Slot, Subclass } from '../types';

const STORAGE_KEY = 'ric.cart.v1';

export interface CartItem {
  subclassId: number;
  courseCode: string;
  courseTitle: string;
  section: string | null;
  semester: string | null;
  instructor: string | null;
  slots: Slot[];
}

export type AddResult = 'added' | 'replaced' | 'duplicate';

interface CartContextValue {
  items: CartItem[];
  count: number;
  add: (course: { code: string; title: string }, subclass: Subclass) => AddResult;
  remove: (subclassId: number) => void;
  clear: () => void;
  hasSubclass: (subclassId: number) => boolean;
  subclassIdOf: (courseCode: string) => number | null;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStored(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStored);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // 隐私模式下写入会失败，忽略即可，不影响当前会话使用
    }
  }, [items]);

  const add = useCallback<CartContextValue['add']>((course, subclass) => {
    let result: AddResult = 'added';
    setItems((current) => {
      if (current.some((item) => item.subclassId === subclass.id)) {
        result = 'duplicate';
        return current;
      }
      const next: CartItem = {
        subclassId: subclass.id,
        courseCode: course.code,
        courseTitle: course.title,
        section: subclass.section,
        semester: subclass.semester,
        instructor: subclass.instructor,
        slots: subclass.slots ?? [],
      };
      // 同一门课只保留一个班次：换 section 是常见的决策动作，
      // 同时避免把「同一门课的两个 section」误报成时间冲突。
      const sameCourseIndex = current.findIndex(
        (item) => item.courseCode === course.code,
      );
      if (sameCourseIndex >= 0) {
        result = 'replaced';
        const copy = [...current];
        copy[sameCourseIndex] = next;
        return copy;
      }
      return [...current, next];
    });
    return result;
  }, []);

  const remove = useCallback((subclassId: number) => {
    setItems((current) => current.filter((item) => item.subclassId !== subclassId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.length,
      add,
      remove,
      clear,
      hasSubclass: (subclassId) => items.some((item) => item.subclassId === subclassId),
      subclassIdOf: (courseCode) =>
        items.find((item) => item.courseCode === courseCode)?.subclassId ?? null,
    }),
    [items, add, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) {
    throw new Error('useCart 必须在 CartProvider 内部使用');
  }
  return value;
}
