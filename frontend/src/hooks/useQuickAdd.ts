import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { fetchCourse } from '../api';
import { useCart } from '../store/cart';

/**
 * 统一的「快速加入选课篮」逻辑：
 * - 单班次课程：直接加入（已是同课则替换班次，完全重复则提示已在篮中）
 * - 多班次课程：跳转到详情页「班次时间」让用户选 section
 * 列表页与 AI 助手页共用，避免逻辑重复。
 */
export function useQuickAdd() {
  const navigate = useNavigate();
  const { add } = useCart();
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(new Set());

  const quickAdd = useCallback(
    async (code: string) => {
      const upper = code.toUpperCase();
      setPendingCodes((prev) => new Set(prev).add(upper));
      try {
        const detail = await fetchCourse(upper);
        const active = detail.subclasses.filter((item) => item.is_active);
        if (active.length === 0) {
          message.warning(`${upper} 暂无可排班次，无法加入选课篮`);
          return;
        }
        if (active.length > 1) {
          message.info(`${upper} 有 ${active.length} 个班次，请在「班次时间」中选择`);
          navigate(`/course/${upper}?tab=subclass`);
          return;
        }
        const result = add({ code: detail.code, title: detail.title }, active[0]);
        if (result === 'duplicate') {
          message.info(`${detail.code} 已在选课篮`);
        } else if (result === 'replaced') {
          message.success(`已切换 ${detail.code} 的班次为 ${active[0].section ?? ''}`);
        } else {
          message.success(`已加入 ${detail.code} ${active[0].section ?? ''}`);
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加入失败');
      } finally {
        setPendingCodes((prev) => {
          const next = new Set(prev);
          next.delete(upper);
          return next;
        });
      }
    },
    [add, navigate],
  );

  return { quickAdd, pendingCodes };
}
