import { useMemo, useState } from 'react';
import { Button, Grid, Tag, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import SlotSchedule from './SlotSchedule';
import { useCart } from '../store/cart';
import type { Subclass } from '../types';

const COLLAPSE_THRESHOLD = 5;

interface Props {
  courseCode: string;
  courseTitle: string;
  subclasses: Subclass[];
}

export default function SubclassList({ courseCode, courseTitle, subclasses }: Props) {
  const { items, add, remove, hasSubclass, subclassIdOf } = useCart();
  const [expanded, setExpanded] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

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

  const statusTag = (subclass: Subclass) => {
    if (hasSubclass(subclass.id)) return <Tag color="default">已选</Tag>;
    return subclass.is_active ? <Tag color="green">可选</Tag> : <Tag>停开</Tag>;
  };

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
      render: (_, subclass) => <SlotSchedule slots={subclass.slots} />,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 90,
      render: (_active: boolean, subclass) => statusTag(subclass),
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
        const replacesOther = subclassIdOf(courseCode) !== null;
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
      {isMobile ? (
        <div className="subclass-cards">
          {visible.map((sc) => {
            const selected = hasSubclass(sc.id);
            const replacesOther = subclassIdOf(courseCode) !== null;
            return (
              <div key={sc.id} className={`subclass-card${selected ? ' is-selected' : ''}`}>
                <div className="subclass-card-head">
                  <span className="subclass-section">{sc.section || '—'}</span>
                  <div className="subclass-card-tags">
                    <span className="subclass-sem">{sc.semester || '—'}</span>
                    {statusTag(sc)}
                  </div>
                </div>
                <div className="subclass-row">
                  <span>教师</span>
                  <div>{sc.instructor || '—'}</div>
                </div>
                <div className="subclass-row">
                  <span>上课时间</span>
                  <div>
                    <SlotSchedule slots={sc.slots} />
                  </div>
                </div>
                <div className="subclass-actions">
                  {selected ? (
                    <Button size="small" danger block onClick={() => remove(sc.id)}>
                      移出选课篮
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      type="primary"
                      block
                      disabled={!sc.is_active}
                      onClick={() => add({ code: courseCode, title: courseTitle }, sc)}
                    >
                      {replacesOther ? '切换为此班次' : '加入选课篮'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Table<Subclass>
          columns={columns}
          dataSource={visible}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 760 }}
        />
      )}

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
