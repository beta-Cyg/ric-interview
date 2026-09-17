import {
  Alert,
  Button,
  Card,
  Descriptions,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchCourse } from '../api';
import FeatureVotesPanel from '../components/FeatureVotes';
import GradeDistributionChart from '../components/GradeDistribution';
import ReviewList from '../components/ReviewList';
import SubclassList from '../components/SubclassList';
import { useCart } from '../store/cart';
import type { CourseDetail as CourseDetailData } from '../types';

export default function CourseDetailPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { items } = useCart();
  const [searchParams] = useSearchParams();

  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 从课程列表点「加入选课篮」（多班次）跳转而来时，自动打开「班次时间」一栏
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(tabParam === 'subclass' ? 'subclass' : 'overview');
  useEffect(() => {
    setActiveTab(tabParam === 'subclass' ? 'subclass' : 'overview');
  }, [tabParam, code]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCourse(code)
      .then((data) => {
        if (!active) return;
        setCourse(data);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : '课程加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (error || !course) {
    return (
      <div>
        <Alert type="error" message={error || '课程不存在'} />
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/')}>
          返回课程列表
        </Button>
      </div>
    );
  }

  const total = course.liked_count + course.disliked_count;
  const ratingValue = total === 0 ? -1 : course.liked_count / total;
  const rating = total === 0 ? '—' : `${Math.round((course.liked_count / total) * 100)}%`;
  const ratingColor =
    ratingValue < 0 ? '#bfbfbf' :
    ratingValue * 100 >= 85 ? '#52c41a' :
    ratingValue * 100 >= 60 ? '#faad14' :
    '#ff4d4f';
  const inCart = items.find((item) => item.courseCode === course.code);
  const activeSubclasses = course.subclasses.filter((item) => item.is_active);

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card className="detail-hero" styles={{ body: { padding: '20px 24px' } }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ paddingLeft: 0, marginBottom: 8 }}
          >
            返回课程列表
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="detail-code-chip">{course.code}</span>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {course.title}
            </Typography.Title>
            {inCart && (
              <Tag
                style={{
                  color: '#0F6E56',
                  background: '#E1F5EE',
                  borderColor: '#9FE1CB',
                  fontSize: 13,
                  marginInlineStart: 0,
                }}
              >
                已选 {inCart.section ?? ''}
              </Tag>
            )}
          </div>
          <div className="detail-metrics">
            <div className="detail-metric">
              <div className="detail-metric-label">好评率</div>
              <div className="detail-metric-value" style={{ color: ratingColor }}>{rating}</div>
            </div>
            <div className="detail-metric">
              <div className="detail-metric-label">评价数</div>
              <div className="detail-metric-value">{course.reviewed_count}</div>
            </div>
            <div className="detail-metric">
              <div className="detail-metric-label">可选班次</div>
              <div className="detail-metric-value">
                {activeSubclasses.length}
                <span className="detail-metric-sub"> / {course.subclasses.length}</span>
              </div>
            </div>
          </div>
        </Card>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: '概览',
              children: (
                <Card size="small">
                  <Descriptions bordered column={{ xs: 1, md: 2 }} size="small">
                    <Descriptions.Item label="开课院系" span={2}>
                      {course.offer_dept || '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="前置要求" span={2}>
                      {course.requirement || '无'}
                    </Descriptions.Item>
                    <Descriptions.Item label="课程简介" span={2}>
                      {course.description || '暂无简介'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              ),
            },
            {
              key: 'grade',
              label: '成绩分布',
              children: (
                <Card size="small" title="成绩分布">
                  <GradeDistributionChart data={course.grade_distribution} />
                </Card>
              ),
            },
            {
              key: 'burden',
              label: '课程负担',
              children: (
                <Card size="small" title="课程负担六维">
                  <FeatureVotesPanel data={course.feature_votes} />
                </Card>
              ),
            },
            {
              key: 'subclass',
              label: '班次时间',
              children: (
                <Card
                  size="small"
                  title={`班次与上课时间（共 ${course.subclasses.length} 个）`}
                >
                  <SubclassList
                    courseCode={course.code}
                    courseTitle={course.title}
                    subclasses={course.subclasses}
                  />
                </Card>
              ),
            },
            {
              key: 'reviews',
              label: '课程评价',
              children: (
                <Card size="small" title={`课程评价（${course.reviews.length}）`}>
                  <ReviewList reviews={course.reviews} />
                </Card>
              ),
            },
          ]}
        />
      </Space>
    </div>
  );
}
