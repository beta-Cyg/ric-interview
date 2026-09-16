# RIC 选课规划器（Course Planner）

面向 HKU 内地本科生的选课规划原型：在官方 Starter（React + Go + SQLite）基础上，
做了一条「浏览课程 → 看详情/评价 → 加选课篮 → 查冲突与通勤 → AI 给建议」的完整产品链路。

> 这是 RIC 2026–2027 程序员个人面试附加题 Task 1 的本地可运行原型，仅用于演示产品思路。

## 已实现功能

- **课程列表**：模糊搜索（容错拼写、按相关度排序，基于 fuse.js）、按院系筛选、按评价数 / 好评率排序。
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
- 后端首次启动会尝试把官方数据集导入 SQLite；本项目已把构建好的种子库 `backend/data/ric-courses.sqlite` 提交进仓库，clone 后可直接运行，无需重新放置数据集（见下方「数据说明」）。

## 环境要求

- Node.js ≥ 20、pnpm 10
- Go ≥ 1.23（后端用了 `errors.Is` 等；Docker 镜像用 golang:1.24）
- Docker + Docker Compose（推荐，开箱即用）

## 快速开始（Docker，推荐）

一键安装（推荐）：

```bash
bash scripts/setup.sh
```

或手动：

```bash
# 在项目根目录
docker compose up --build
```

- 前端：<http://localhost:5173>
- 后端 API：<http://localhost:3001/api/health>

停止：`docker compose down`

### Docker 配置详解

`docker-compose.yml` 定义两个服务，均通过 bind mount 挂载源码、用容器热重载，改动代码通常无需重新构建镜像（新增依赖除外）：

| 服务 | 镜像 | 端口 | 说明 |
| --- | --- | --- | --- |
| `backend` | `golang:1.24-alpine` + air | `3001` | Go 标准库 HTTP 服务，挂载 `./backend`；air 监听改动自动重启。密钥来自 `backend/.env`（缺省走离线概览）。 |
| `frontend` | `node:22-bookworm-slim` + Vite | `5173` | React 开发服务器，挂载 `./frontend`；`API_PROXY_TARGET=http://backend:3001` 把 `/api` 代理到后端，规避跨域。 |

挂载与缓存卷：

- 源码 bind mount：`./backend:/app`、`./frontend:/app`——改代码即时反映。
- Go 模块缓存：`go-mod`、`go-build` 命名卷，加速重复构建。
- 前端依赖：`/app/node_modules` 匿名卷——**依赖装进容器而非宿主机**，这也是下面「新增前端依赖」必须重建容器的原因。

#### 新增前端依赖后必须重建容器

`node_modules` 在容器内匿名卷中，直接刷新浏览器不会重新安装依赖；新增的包（如 `fuse.js`）会报
`Failed to resolve import "fuse.js"`。正确做法：

```bash
docker compose rm -sfv frontend        # 删除容器 + 旧的 node_modules 匿名卷
docker compose up -d --build frontend   # 重建镜像并执行 pnpm install
```

> 前端 `Dockerfile` 已用 `pnpm install`（非 `--frozen-lockfile`），即使 `pnpm-lock.yaml`
> 缺失或过旧也能正常拉取依赖，`docker compose up --build` 不会因 lockfile 不一致而失败。
>
> 后端改动 Go 代码后若未生效，执行 `docker restart ric-backend` 强制让 air 重建。

## 本地开发（不用 Docker）

后端：

```bash
cd backend
go run .            # 首次自动建库（基于已提交的种子库，无需数据集）
go run . --init-db  # 清空并重新导入（需先放置官方数据集 json）
```

前端（另开终端）：

```bash
cd frontend
pnpm install
pnpm dev
```

## AI 助手配置

后端读取 `backend/.env` 启用 DeepSeek 大模型模式（缺省为离线概览）。仓库已提交一份**不含密钥**的模板 `backend/.env.example`，克隆后复制并填入 Key 即可：

```bash
cp backend/.env.example backend/.env
# 然后编辑 backend/.env，把 DEEPSEEK_API_KEY 换成你的真实 Key
```

```env
DEEPSEEK_API_KEY=你的key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

> `backend/.env` 已在 `.gitignore` 中（`backend/.env.example` 不受影响、正常提交），含密钥的 `.env` **永远不会进入版本库**；未配置 Key 或调用失败时，AI 助手自动回落到离线概览。

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

- 官方提供的 `ric_course_sample_dataset.json` 因 RIC 数据保密要求**不纳入 Git 仓库**（已在 `.gitignore` 中忽略）。
- **种子数据库 `backend/data/ric-courses.sqlite` 已提交进仓库**：基于官方数据集首次导入生成
  （`journal_mode=delete`，库自包含、`integrity_check=ok`），clone 后可直接运行，无需重新放置数据集或手动建库。
- 若你拿到官方数据集想重建库：把 `ric_course_sample_dataset.json` 放到 `backend/data/`，执行
  `docker compose run --rm backend go run . --init-db`（或本地 `cd backend && go run . --init-db`）即可清空并重新导入。

## 目录结构

```text
ric-course-starter/
├── backend/        Go API、SQLite 建库、AI 助手、.env（密钥，已被忽略）、.env.example（不含密钥的模板）
├── frontend/       React 前端（页面 / 组件 / 工具 / 选课篮状态）
├── scripts/        setup.sh 一键安装脚本（Docker）
└── docker-compose.yml
```

> 面试演示脚本（环境准备、分步演示流程、UI 亮点）单独维护在仓库外的 `DEMO_NOTES.md`，不随本仓库提交，便于按需更新。
