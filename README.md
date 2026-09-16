# RIC 选课规划器（Course Planner）

面向 HKU 内地本科生的选课规划原型：在官方 Starter（React + Go + SQLite）基础上，
做了一条「浏览课程 → 看详情/评价 → 加选课篮 → 查冲突与通勤 → AI 给建议」的完整产品链路。

> 这是 RIC 2026–2027 程序员个人面试附加题 Task 1 的本地可运行原型，仅用于演示产品思路。

## 已实现功能

- **课程列表**：关键词搜索、按院系筛选、按评价数 / 好评率排序。
- **课程详情**：课程简介、成绩分布柱状图、六维考核方式（期末 / 论文 / 项目 / 展示 / 考勤 / 辅导课）、
  学生评价列表（按点赞排序）、班次列表（超过 5 个自动折叠，可展开）。
- **选课篮（周课表）**：
  - 把课程加入选课篮（同一门课只保留一个班次，换 section 即替换）。
  - 周课表视图，支持按学期、按教学周切换；可选「整学期合并」或单周。
  - **强冲突检测**：同一时段两门课时间重叠 → 标红报错。
  - **通勤提示**（仅提示不阻断）：换教室间隔 < 15 分钟、跨校区（本部 ↔ 百周年）间隔 < 20 分钟。
- **班次时间展示**：按「周几 / 时间 / 教室 / 校区」归约，并标注适用日期区间（如 `9/7 - 10/5`）。
- **AI 选课助手**：自然语言提问，后端调用 DeepSeek 生成建议；未配置 Key 或调用失败（超时 / 限流）
  时**自动回落**到基于成绩分布、考核方式与上课时间的离线中文概览，保证「离线也有用」。

## 技术栈与架构

```text
React (Vite + TypeScript + Ant Design)  ──/api──►  Go 标准库 HTTP  ──►  SQLite（只读，运行时）
       前端开发服务器 :5173                        后端 :3001
```

- 前端通过 Vite dev proxy 把 `/api` 转发到后端，规避跨域。
- 选课篮仅存浏览器 `localStorage`（无登录，符合隐私最小化设计）。
- 后端首次启动把官方数据集导入 SQLite；数据集**不纳入 Git 仓库**（见下方「数据说明」）。

## 环境要求

- Node.js ≥ 20、pnpm 10
- Go ≥ 1.23（后端用了 `errors.Is` 等；Docker 镜像用 golang:1.24）
- Docker + Docker Compose（推荐，开箱即用）

## 快速开始（Docker，推荐）

```bash
# 在项目根目录
docker compose up --build
```

- 前端：<http://localhost:5173>
- 后端 API：<http://localhost:3001/api/health>

停止：`docker compose down`

> 注意：后端挂载了 `./backend` 并启用了 air 热重载；改 Go 代码后若未生效，可执行
> `docker restart ric-backend` 强制重建。

## 本地开发（不用 Docker）

后端：

```bash
cd backend
go run main.go            # 首次自动建库
go run main.go --init-db  # 清空并重新导入
```

前端（另开终端）：

```bash
cd frontend
pnpm install
pnpm dev
```

## AI 助手配置

在 `backend/.env` 中填入 DeepSeek 密钥即可启用大模型模式（缺省为离线概览）：

```env
DEEPSEEK_API_KEY=你的key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

`.env` 已在 `.gitignore` 中，不会进入版本库。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 + 库内课程 / 评价 / 班次计数 |
| GET | `/api/courses?q=&dept=&sort=` | 课程列表（搜索 / 筛选 / 排序） |
| GET | `/api/departments` | 开课院系下拉 |
| GET | `/api/courses/{code}` | 课程详情（成绩、六维、评价、班次） |
| POST | `/api/conflicts` | 传 `subclassIds` 做冲突 / 通勤检测 |
| POST | `/api/assistant` | 传 `message` + 选课篮 `subclassIds`，返回 AI / 离线建议 |

## 数据说明

官方提供的 `ric_course_sample_dataset.json` 因 RIC 数据保密要求**不纳入 Git 仓库**。
clone 本项目后，需自行把 Starter 中的 `backend/data/ric_course_sample_dataset.json` 放到
`backend/data/` 目录，再启动后端（会自动建库）。本仓库仅包含源码、`.gitignore` 已忽略
`*.sqlite` 与数据集文件。

## 目录结构

```text
ric-course-starter/
├── backend/        Go API、SQLite 建库、AI 助手、.env（密钥）
├── frontend/       React 前端（页面 / 组件 / 工具 / 选课篮状态）
└── docker-compose.yml
```

## 演示要点（面试用）

1. 课程列表搜索「ACCT」并按评价数排序，进入课程详情看成绩分布与评价。
2. 把 ACCT1101 与 SCNC1112 加入选课篮，周课表出现**硬冲突**高亮。
3. 切换「按周」观察 reading week 等无课周。
4. 打开 AI 选课助手，问「这几门会不会撞课 / 有没有早八」，观察大模型与离线两种模式。
