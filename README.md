# Action Journal

一个基于 React + Vite 的行动记录应用。当前版本已经接入 Supabase 登录和云端同步，核心数据会在登录后保存到你自己的数据库里，而不是只存浏览器本地。

## 本地开发

1. 安装依赖：`npm install`
2. 创建 `.env.local`，填入 Supabase 项目变量：

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

3. 在 Supabase SQL Editor 执行 `supabase/schema.sql`
4. 启动开发环境：`npm run dev`

## 当前同步方式

- 登录后，数据会拆分写入多张业务表，例如 `goals`、`actions`、`writing_templates`、`daily_plans`
- 浏览器本地仍保留一份缓存，用于页面快速读取
- 旧版 localStorage 数据会在首次登录且云端为空时自动迁移到当前账号
- 如果用户以前已经使用过旧版 `app_states` 单表结构，首次登录也会自动迁移到多表结构
- 当切回标签页或重新聚焦窗口时，应用会主动从云端刷新一次
- 顶部会显示同步状态；如果写入失败，会给出重试按钮

## 后续建议

这一版已经切到多表结构，后续如果你要做更复杂的筛选、统计、实时协作或冲突控制，可以继续把同步策略从“全量替换写入”细化为按实体增量同步。
