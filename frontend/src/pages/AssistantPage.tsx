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
import { UserOutlined, SendOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAssistant, type AssistantReply } from '../api';
import { useCart } from '../store/cart';
import { useQuickAdd } from '../hooks/useQuickAdd';
import Markdown from '../components/Markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  mode?: AssistantReply['mode'];
  note?: string;
}

// 对话记录缓存 key（与选课篮 ric.cart.v1 同源 localStorage）
const CHAT_KEY = 'ric.assistant.chat.v1';

function loadChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (m): m is ChatMessage =>
          m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
      );
    }
  } catch {
    // 解析失败则忽略缓存，回到空对话
  }
  return [];
}

const SUGGESTIONS = [
  '帮我评估一下这些课的整体难度和工作量',
  '这几门课会不会有时间冲突或跨校区奔波？',
  '有没有早八？能不能帮我换掉最累的安排',
  '哪门相对「水」一点，适合拿来凑学分？',
];

// 课程代码格式：4 个字母 + 4 个数字（如 ACCT1101），全量数据已验证一致。
const COURSE_CODE_RE = /\b[A-Za-z]{4}\d{4}\b/g;

function extractCourseCodes(text: string): string[] {
  const found = text.match(COURSE_CODE_RE);
  if (!found) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of found) {
    const code = raw.toUpperCase();
    if (!seen.has(code)) {
      seen.add(code);
      result.push(code);
    }
  }
  // 一个气泡里最多渲染 8 个，避免回复里罗列过多代码时拥挤。
  return result.slice(0, 8);
}

// 助手回复里若提到课程代码，在其下方渲染「加入选课篮」按钮（轻量版直接加课）。
function AssistantCourseActions({
  content,
  onAdd,
  isInCart,
  pendingCodes,
}: {
  content: string;
  onAdd: (code: string) => void;
  isInCart: (code: string) => boolean;
  pendingCodes: Set<string>;
}) {
  const codes = extractCourseCodes(content);
  if (codes.length === 0) return null;
  return (
    <div className="chat-actions">
      {codes.map((code) =>
        isInCart(code) ? (
          <Tag key={code} color="success" style={{ marginInlineEnd: 8 }}>
            已加入 {code}
          </Tag>
        ) : (
          <Button
            key={code}
            size="small"
            type="primary"
            loading={pendingCodes.has(code)}
            onClick={() => onAdd(code)}
            style={{ marginInlineEnd: 8, marginBottom: 4 }}
          >
            加入选课篮（{code}）
          </Button>
        ),
      )}
    </div>
  );
}

export default function AssistantPage() {
  const { items, subclassIdOf } = useCart();
  const { quickAdd, pendingCodes } = useQuickAdd();
  const [messages, setMessages] = useState<ChatMessage[]>(loadChat);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 每次对话变化都落盘到浏览器 localStorage，刷新后仍能看到历史。
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
    } catch {
      // 容量超限等异常静默忽略，不影响聊天本身
    }
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
  };

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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
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
          {messages.length > 0 && (
            <Button size="small" onClick={clearChat}>
              清空对话
            </Button>
          )}
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
                    className={`chat-avatar${message.role === 'assistant' ? ' chat-avatar-assistant' : ''}`}
                    src={message.role === 'assistant' ? '/deepseek-logo.svg' : undefined}
                    icon={message.role === 'user' ? <UserOutlined /> : undefined}
                  />
                  <div className="chat-bubble">
                    {message.role === 'assistant' && message.mode && (
                      <Tag
                        style={{
                          marginBottom: 6,
                          color: message.mode === 'ai' ? '#1f1f1f' : '#8c8c8c',
                          borderColor: message.mode === 'ai' ? '#1f1f1f' : '#d9d9d9',
                        }}
                      >
                        {message.mode === 'ai' ? '大模型' : '离线概览'}
                      </Tag>
                    )}
                    {message.role === 'assistant' ? (
                      <>
                        <Markdown content={message.content} />
                        <AssistantCourseActions
                          content={message.content}
                          onAdd={quickAdd}
                          isInCart={(code) => subclassIdOf(code) !== null}
                          pendingCodes={pendingCodes}
                        />
                      </>
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
                  <Avatar className="chat-avatar chat-avatar-assistant" src="/deepseek-logo.svg" />
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
