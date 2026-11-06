/**
 * dsh-plugin-web-ux 的薄构建入口（双端）。
 *
 * 本包自 archived-session-delete 变更起是**双端**插件（delete-or-archive 变更再把单一的
 * 「删除」扩为「删除或移动到归档目录」）：宿主半不再只是空壳载体，它承载 Connection RPC
 * 通道 `/web-ux` 的 `preview-delete` / `delete-session` 两个端点（纯宿主工作——工作区注册
 * 表清理，加会话日志与投影缓存的删除或迁移），浏览器半在 provider 徽章旁提供侧栏处置入
 * 口及其确认弹窗。
 *
 * 宿主产物必须自包含：`Config` 用的 Schemastery（`@deepseek-ai/schemastery`，`archiveRoot`
 * 配置键的原生 schema）由构建**内联**进产物——`link:` 安装不会装被链接包的依赖，产物必须
 * 自包含才能加载；这也正是宿主运行时不解析任何 `@deepseek-ai/*` 的原因
 * （`test/bundle.test.ts` 的自包含断言守护这一点，见设计 A10）。
 *
 * 不开 `cjsRequireShim`：宿主产物里没有 `__require`（实测 0 次），banner 只会多一条
 * `node:module` import。
 */
import { buildPlugin } from '@dsh-plugins/build-kit'

await buildPlugin({ root: import.meta.dirname, cssClassPrefix: 'wux' })
