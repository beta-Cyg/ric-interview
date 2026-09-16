import { Alert, Card, Typography } from 'antd';

export default function AssistantPage() {
  return (
    <div>
      <Typography.Title level={3}>AI 选课助手</Typography.Title>
      <Card size="small">
        <Alert
          type="info"
          showIcon
          message="功能开发中"
          description="将支持用自然语言提问（例如「我想选 5 门课，不要太硬，避开早八」），后端调用 DeepSeek 生成建议。未配置 Key 或调用超时时会回落到基于成绩分布与六维统计的离线摘要。"
        />
      </Card>
    </div>
  );
}
