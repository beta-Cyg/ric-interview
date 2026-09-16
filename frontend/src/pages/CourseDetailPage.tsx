import {
  Alert,
  Button,
  Card,
  Descriptions,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  const rating = total === 0 ? '—' : `${Math.round((course.liked_count / total) * 100)}%`;
  const inCart = items.find((item) => item.courseCode === course.code);
  const activeSubclasses = course.subclasses.filter((item) => item.is_active);

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ paddingLeft: 0 }}
          >
            返回课程列表
          </Button>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            {course.code} {course.title}
            {inCart && (
              <Tag color="success" style={{ marginLeft: 12, fontSize: 13 }}>
                已选 {inCart.section ?? ''}
              </Tag>
            )}
          </Typography.Title>
        </div>

        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="开课院系" span={2}>
            {course.offer_dept || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="前置要求" span={2}>
            {course.requirement || '无'}
          </Descriptions.Item>
          <Descriptions.Item label="课程简介" span={2}>
            {course.description || '暂无简介'}
          </Descriptions.Item>
          <Descriptions.Item label="评价数">{course.reviewed_count}</Descriptions.Item>
          <Descriptions.Item label="好评率">{rating}</Descriptions.Item>
          <Descriptions.Item label="可选班次" span={2}>
            {activeSubclasses.length} / {course.subclasses.length}
          </Descriptions.Item>
        </Descriptions>

        <Card title="成绩分布" size="small">
          <GradeDistributionChart data={course.grade_distribution} />
        </Card>

        <Card title="课程负担六维" size="small">
          <FeatureVotesPanel data={course.feature_votes} />
        </Card>

        <Card title={`班次与上课时间（共 ${course.subclasses.length} 个）`} size="small">
          <SubclassList
            courseCode={course.code}
            courseTitle={course.title}
            subclasses={course.subclasses}
          />
        </Card>

        <Card title={`课程评价（${course.reviews.length}）`} size="small">
          <ReviewList reviews={course.reviews} />
        </Card>
      </Space>
    </div>
  );
}
