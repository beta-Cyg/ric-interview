import { Button, Tag, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCart } from '../store/cart';
import type { Subclass } from '../types';
import { formatSlot } from '../utils/schedule';

interface Props {
  courseCode: string;
  courseTitle: string;
  subclasses: Subclass[];
}

export default function SubclassList({ courseCode, courseTitle, subclasses }: Props) {
  const { add, remove, hasSubclass, subclassIdOf } = useCart();

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
      render: (active: boolean) =>
        active ? <Tag color="green">可选</Tag> : <Tag>停开</Tag>,
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
    <Table<Subclass>
      columns={columns}
      dataSource={subclasses}
      rowKey="id"
      pagination={false}
      size="small"
    />
  );
}
