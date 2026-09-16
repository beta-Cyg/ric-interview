import {
  Alert,
  Avatar,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { RobotOutlined, UserOutlined, SendOutlined } from '@ant-design/icons';
import { useMemo, useRef, useState } from 'react';
import { fetchAssistant, type AssistantReply } from '../api';
import { useCart } from '../store/cart';
import Markdown from '../components/Markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  mode?: AssistantReply['mode'];
  note?: string;
}

const SUGGESTIONS = [
  '帮我评估一下这些课的整体难度和工作量',
  '这几门课会不会有时间冲突或跨校区奔波？',
  '有没有早八？能不能帮我换掉最累的安排',
  '哪门相对「水」一点，适合拿来凑学分？',
];

export default function AssistantPage() {
  const { items } = useCart();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const subclassIds = useMemo(() => items.map((item) => item.subclassId), [items]);
  const courseCodes = useMemo(() => items.map((item) => item.courseCode), [items]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) {
      return;
    }
    const next: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const reply = await fetchAssistant({ message: question, subclassIds, courseCodes });
      setMessages([
        ...next,
        { role: 'assistant', content: reply.reply, mode: reply.mode, note: reply.note },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败';
      setMessages([
        ...next,
        { role: 'assistant', content: `抱歉，出错了：${message}`, mode: 'offline' },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  return (
    <div className="assistant-page">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            AI 选课助手
          </Typography.Title>
          <Typography.Text type="secondary">
            用自然语言问它选课问题，例如「这几门会不会撞课」「有没有早八」。
            {items.length > 0
              ? `当前已把选课篮里的 ${items.length} 门课作为上下文传给它。`
              : '提示：把课程加入选课篮后，助手能结合你的实际排课给建议。'}
          </Typography.Text>
        </div>

        <Card className="assistant-chat" styles={{ body: { padding: 16 } }}>
          {messages.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有对话，试试下面的问题或自己输入"
            />
          ) : (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`chat-row chat-row-${message.role}`}
                >
                  <Avatar
                    className="chat-avatar"
                    icon={message.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  />
                  <div className="chat-bubble">
                    {message.role === 'assistant' && message.mode && (
                      <Tag
                        color={message.mode === 'ai' ? 'blue' : 'default'}
                        style={{ marginBottom: 6 }}
                      >
                        {message.mode === 'ai' ? '大模型' : '离线概览'}
                      </Tag>
                    )}
                    {message.role === 'assistant' ? (
                      <Markdown content={message.content} />
                    ) : (
                      <div className="chat-text">{message.content}</div>
                    )}
                    {message.note && (
                      <Typography.Text type="secondary" className="chat-note">
                        {message.note}
                      </Typography.Text>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="chat-row chat-row-assistant">
                  <Avatar className="chat-avatar" icon={<RobotOutlined />} />
                  <div className="chat-bubble">
                    <Spin size="small" /> <span style={{ marginLeft: 8, color: '#8c8c8c' }}>思考中…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </Space>
          )}
        </Card>

        {items.length === 0 && (
          <Alert
            type="info"
            showIcon
            message="选课篮是空的"
            description="助手仍能用通用经验回答问题；把课程加入选课篮后，它会结合真实成绩与排课数据给出更精准的建议。"
          />
        )}

        <Space wrap>
          {SUGGESTIONS.map((suggestion) => (
            <Tooltip key={suggestion} title="点一下直接提问">
              <Button size="small" onClick={() => send(suggestion)} disabled={loading}>
                {suggestion}
              </Button>
            </Tooltip>
          ))}
        </Space>

        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入你的问题，回车发送"
            value={input}
            disabled={loading}
            onChange={(event) => setInput(event.target.value)}
            onPressEnter={() => send(input)}
            status={loading ? 'warning' : undefined}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={loading}
            onClick={() => send(input)}
          >
            发送
          </Button>
        </Space.Compact>
      </Space>
    </div>
  );
}
