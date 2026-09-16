import type { ReactNode } from 'react';

// 轻量 Markdown 渲染器：仅支持常用子集，直接输出 React 节点，
// 避免 dangerouslySetInnerHTML 带来的 XSS 风险，也无需引入第三方依赖
// （前端用 pnpm --frozen-lockfile 安装，新增依赖需同步 lockfile，复杂度高）。
// 支持：标题(#~####)、加粗 **、** 斜体 *、行内代码 `、`、围栏代码块 ```、引用 >、
//       无序/有序列表、链接 [文本](http(s)://...)。
//
// 说明：该组件不追求完整 CommonMark 兼容，目标是覆盖 AI 对话回复里最常见的排版，
//       保证可读性即可。

const INLINE_RE =
  /(\*\*([^*]+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\))|(\*([^*]+?)\*)/g;

function renderInline(text: string, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let idx = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const key = `${prefix}-${idx++}`;
    if (m[1] !== undefined) {
      nodes.push(<strong key={key}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<code key={key} className="md-code">{m[4]}</code>);
    } else if (m[5] !== undefined) {
      nodes.push(
        <a key={key} href={m[7]} target="_blank" rel="noopener noreferrer">
          {m[6]}
        </a>,
      );
    } else if (m[8] !== undefined) {
      nodes.push(<em key={key}>{m[9]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

const isFence = (l: string) => /^```/.test(l);
const isHeading = (l: string) => /^(#{1,4})\s+/.test(l);
const isQuote = (l: string) => /^>\s?/.test(l);
const isUl = (l: string) => /^\s*[-*+]\s+/.test(l);
const isOl = (l: string) => /^\s*\d+\.\s+/.test(l);

function parseBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    if (isFence(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // 跳过结束的 ```
      out.push(
        <pre key={key++} className="md-pre">
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(
        <div key={key++} className={`md-h md-h${level}`}>
          {renderInline(h[2], `h${key}`)}
        </div>,
      );
      i++;
      continue;
    }

    // 引用
    if (isQuote(line)) {
      const buf: string[] = [];
      while (i < lines.length && isQuote(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        <blockquote key={key++} className="md-quote">
          {renderInline(buf.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // 无序列表
    if (isUl(line)) {
      const items: string[] = [];
      while (i < lines.length && isUl(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={key++} className="md-ul">
          {items.map((it, n) => (
            <li key={n}>{renderInline(it, `ul${key}-${n}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // 有序列表
    if (isOl(line)) {
      const items: string[] = [];
      while (i < lines.length && isOl(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(
        <ol key={key++} className="md-ol">
          {items.map((it, n) => (
            <li key={n}>{renderInline(it, `ol${key}-${n}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 段落：收集连续的非空、非块级起始行
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isFence(lines[i]) &&
      !isHeading(lines[i]) &&
      !isQuote(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="md-p">
        {renderInline(para.join(' '), `p${key}`)}
      </p>,
    );
  }

  return out;
}

export default function Markdown({ content }: { content: string }) {
  return <div className="markdown-body">{parseBlocks(content)}</div>;
}
