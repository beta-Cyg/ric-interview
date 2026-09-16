# RIC 课程平台 Starter

这是一个用于 RIC 程序员招募项目题的最小基础项目。前端与后端已经分开：

```text
ric-course-starter/
├── frontend/   React 前端
└── backend/    Go API、SQLite 数据库及原始数据
```

项目只演示以下数据链路：

```text
React 前端 → Go API → SQLite 本地数据库
```

页面和功能刻意保持简单。候选人的主要任务是在此基础上改进前端设计并实现新的产品功能。

## 环境要求

- Node.js 20 或以上
- pnpm 10
- Go 1.21 或以上

## 启动后端

打开第一个终端：

```bash
cd backend
go run main.go
```

首次启动时，后端会自动读取 `backend/data/ric_course_sample_dataset.json`，并建立本地 SQLite 数据库。

如需清空并重新导入数据：

```bash
cd backend
go run main.go --init-db
```

## 启动前端

打开第二个终端：

```bash
cd frontend
pnpm install
pnpm dev
```

启动后访问：<http://localhost:5173>

本地 API 地址：

- `GET http://127.0.0.1:3001/api/health`
- `GET http://127.0.0.1:3001/api/courses`

## 项目内容

- 前端：React、TypeScript、Vite、Ant Design
- 后端：Go 标准库 HTTP 服务
- 数据库：SQLite
- 数据：10 门课程、1,226 条评价及 59 个当前班次

课程评价和班次已经导入数据库，但 Starter 不提供相应页面或接口。候选人可以根据自己的功能设计扩展数据库和 API。

## Starter 没有实现的功能

- 登录、账号及权限
- 搜索、筛选和排序
- 课程详情、比较和冲突检查
- 收藏、评价发布、点赞和翻译
- 课表生成及编辑
- 移动端适配、动画、主题和国际化
- 正式部署、CI/CD 或 RIC 内部服务接入

本项目不包含 RIC 正式平台的源代码、密钥、服务地址或 Git 历史，也不应连接任何正式环境。
