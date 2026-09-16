import { useMemo, useState } from 'react';
import { Button, Tag, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCart } from '../store/cart';
import type { Subclass } from '../types';
import { formatSlot } from '../utils/schedule';

const COLLAPSE_THRESHOLD = 5;

interface Props {
  courseCode: string;
  courseTitle: string;
  subclasses: Subclass[];
}

export default function SubclassList({ courseCode, courseTitle, subclasses }: Props) {
  const { items, add, remove, hasSubclass, subclassIdOf } = useCart();
  const [expanded, setExpanded] = useState(false);

  // 折叠时优先露出对用户有用的行：已选 > 可选 > 停开。
  // 否则用户选了靠后的班次，一收起就看不见，也找不到「移出」按钮。
  const ordered = useMemo(() => {
    const rank = (item: Subclass) => {
      if (hasSubclass(item.id)) return 0;
      return item.is_active ? 1 : 2;
    };
    return [...subclasses].sort((a, b) => rank(a) - rank(b));
  }, [subclasses, items, hasSubclass]);

  const collapsible = ordered.length > COLLAPSE_THRESHOLD;
  const collapsed = collapsible && !expanded;
  const visible = collapsed ? ordered.slice(0, COLLAPSE_THRESHOLD) : ordered;

  const columns: ColumnsType<Subclass> = [
    { title: '学期', dataIndex: 'semester', width: 150, render: (value: string | null) => value || '—' },
    { title: '班次', dataIndex: 'section', width: 90, render: (value: string | null) => value || '—' },
    {
      title: '教师',
      dataIndex: 'instructor',
      width: 160,
      render: (value: string | null) => value || '—',
    },
    {
      title: '上课时间',
      key: 'slots',
      render: (_, subclass) =>
        subclass.slots.length === 0 ? (
          <span>—</span>
        ) : (
          <div>
            {subclass.slots.map((slot, index) => (
              <div key={index}>{formatSlot(slot)}</div>
            ))}
          </div>
        ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 90,
      render: (active: boolean, subclass) => {
        if (hasSubclass(subclass.id)) {
          return <Tag color="blue">已选</Tag>;
        }
        return active ? <Tag color="green">可选</Tag> : <Tag>停开</Tag>;
      },
    },
    {
      title: '操作',
      width: 120,
      render: (_, subclass) => {
        const selected = hasSubclass(subclass.id);
        if (selected) {
          return (
            <Button size="small" danger onClick={() => remove(subclass.id)}>
              移出选课篮
            </Button>
          );
        }
        const replacesOther =
          subclassIdOf(courseCode) !== null;
        return (
          <Button
            size="small"
            type="primary"
            disabled={!subclass.is_active}
            onClick={() => {
              add({ code: courseCode, title: courseTitle }, subclass);
            }}
          >
            {replacesOther ? '切换为此班次' : '加入选课篮'}
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <Table<Subclass>
        columns={columns}
        dataSource={visible}
        rowKey="id"
        pagination={false}
        size="small"
      />
      {collapsible && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Button type="link" onClick={() => setExpanded((value) => !value)}>
            {collapsed
              ? `展开全部 ${ordered.length} 个班次（已隐藏 ${ordered.length - COLLAPSE_THRESHOLD} 个）`
              : '收起班次列表'}
          </Button>
        </div>
      )}
    </div>
  );
}
