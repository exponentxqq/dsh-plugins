# Design

> 本文件承载阶段 1.7 代码级蓝图的深度契约(六字段逐断言);逐文件展开、证据锚全文与命令级细节以同目录落档副本 `code-design.md` 为权威(随档 `decisions.md` 为收敛留痕)。

## ① 触达面(概要;逐文件清单见 code-design.md ①)

- **代码与配置(根仓)**:`scripts/dsh-baseline.mjs`(基线常量 A1)、`pnpm-workspace.yaml`(豁免+probe overrides A2)、`pnpm-lock.yaml`(全量重装 A3)、六软插件 `package.json`(pin+软范围+schemastery A4)、multi-root `package.json`(devDeps+21 项 peer 裁剪 A5)、`src/compat/dsh-version.ts`(allowlist 11→3,A6)、四个插件 `lib/` 产物重建(A7/A8)、`scripts/upgrade-dsh.mjs`(新增 schemastery 推导,A10);检查器与测试零改动(A9/A10)。
- **文档(根仓)**:multi-root AGENTS.md H3(B1)、README 双语(B2)、ADR-0009 追加节(B3)、开发工作流(B4)、.agent/note 双语(B5)、根 README/AGENTS.md 历史漂移修正(B6);troubleshooting 与其余 ADR 不改(B7/B8)。
- **仓外(profile 数据目录)**:web profile 两个官方包升 `0.2.2-rc.1 --save-exact`(C1/C2);`chrome-devtools-mcp: 1.12.0` override 保留(C3,分歧点 Q-D)。

## ② 证据锚(核心锚点;全表见 code-design.md ②)

基线常量 `scripts/dsh-baseline.mjs:13`;升级引擎重写范围 `scripts/upgrade-dsh.mjs:145-175,197-235`;检查器七断言 `scripts/check-dsh-baseline.mjs:181-193,195-210,228-238`;allowlist `plugins/multi-root-workspace/src/compat/dsh-version.ts:34`;peer 枚举 `plugins/multi-root-workspace/package.json:94-117`;zod 契约 `package.json:231` + `.agent/note/dsh-compat-contract.md:140`;schemastery 声明 `plugins/{web-ux,session-tool-toggle,zcode-plan}/package.json:85/70/37`;profile 现状 `~/.dsh/profiles/web/package.json:31-32`。

## ③ 接口与数据形状(关键值;全量见 code-design.md ③)

- `DSH_BASELINE = '0.2.2-rc.1'`;`softDshRange('0.2.2-rc.1') = '>=0.2.2-rc.1 <0.3.0'`。
- `SUPPORTED_DSH_RELEASES = ['0.2.1-rc.2','0.2.1-rc.5','0.2.2-rc.1']`(数组顺序即 peer 串顺序);21 项 DSH peer = `'0.2.1-rc.2 || 0.2.1-rc.5 || 0.2.2-rc.1'`;cordis peer 不动。
- devDeps:七插件 DSH 系 → `0.2.2-rc.1`、cordis → `4.1.0`、schemastery(三插件)→ `3.19.0`;`dependencies.zod` 保持 `4.4.3`。
- 豁免:新增 `dsh-client-ui-context-menu@0.2.2-rc.1`、schemastery 行改 `3.19.0`、DSH 家族全量改 `0.2.2-rc.1`;新脚本 `schemasteryRequiredBy(target)` 解析候选 `dsh-tools` 声明(非单一 tilde/caret 抛错,与 `cordisRequiredBy` 同构)。
- profile 官方包两行 → 精确 `"0.2.2-rc.1"`(`--save-exact`)。

## ④ 决策记录(摘要;含被否方案与反例全文见 code-design.md ④ D1-D8)

- **D1 栈识别(硬记录)**:writer skill = **`dsh-plugin-writer`**,证据——七插件均为 DSH 组合包(src/index.ts 导出 name/inject/apply + cordis.patch.yml + dsh.bundle.patch),skill 的分层/复用/拆分规范作为本设计硬约束(执行侧与接续恢复从此读取,不依赖会话记忆)。
- D2 走既有升级车道(probe→提升→enforce),否决手工逐文件改。
- D3 裁剪与提升**一次编辑落定**,否决两步走(join 强绑定,中间态必红)。
- D4 zod 保持 `4.4.3`(契约伙伴 storage-domain/session-projection 仍 4.4.3),否决跟树升 4.6.7(note:140 事故重演)。
- D5 schemastery 纳入升级脚本、**从候选树推导**(落档分歧点 Q-C 已决,用户否决「维持人工」与「通用参数」)。
- D6 官方包用 `dsh plugin add --save-exact`,否决手改 profile manifest。
- D7 ADR-0009 追加新节保留历史,否决重写删史。
- D8 检查器与测试零改动(期望值从 allowlist 派生),否决手写第二份清单。
- 收敛决策(decisions.md):不发版 + 官方包一并升级(Q1)、文档漂移顺带修正(Q2)、矩阵裁剪(Q4/Q5:11→3)。
- 执行环境:直用主工作区(2026-11-06 衔接裁定:模式=auto、引擎=subagent;用户在「存在并行变更 worktree」判据命中下明确选择直用,覆盖隔离推荐)。主检出 main;装配:无需补装(依赖已齐),验证命令一律容器内执行 `docker exec dsh sh -lc 'cd /home/xuqinqin/develop/person/dsh-plugins && …'`,环境变量写在容器内层;无环境错开;创建于 2026-11-06。预期漂移留痕:tasks 2.1 前置「仅原 3 个 openspec 脏文件」已被其会话以 7b16103 收走,执行期以「0 脏文件」为基线记录。

## ⑤ 逐任务组要点(与 tasks.md 分组一一对应;命令级断言见 code-design.md ⑤)

1. **升级脚本增强**:upgrade-dsh.mjs 增 `schemasteryRequiredBy` + repoint 分支(先于 probe,probe 依赖推导)。
2. **probe 升级与探测**:容器内 `dsh:upgrade 0.2.2-rc.1 --probe` → `install --no-frozen-lockfile --config.minimumReleaseAge=0` → `DSH_MULTI_ROOT_COMPAT=warn verify:all`(环境变量必须写在容器内层命令)。
3. **形状核对与必要适配**:cordis 4.1.0(typecheck/kernel:probe/smoke 为证据面)、zod 解析 4.4.3、schemastery 3.19.0 单一、SESSION_FORMAT_VERSION=4、context-menu 只记录不接入;零适配则记录结论进 ADR 追加节。
4. **支持矩阵裁剪提升**:dsh-version.ts 11→3 + 21 项 peer 同串 + compat:check;仍带 probe overrides,不得提交。
5. **收口对账**:去 overrides → `install --frozen-lockfile` → `dsh:check` 按输出补豁免(新增 context-menu/schemastery,删消失包)直至全绿。
6. **全量验证**:enforce `verify:all` + 仓库级 lint/typecheck/test/build/docs:check/dsh:check;lib diff 只许四插件,project-mcp/user-commands/workspace-config lib 零 diff。
7. **文档同步**:B1-B6 逐处替换(真源→派生顺序);docs:check 双语配对。
8. **web profile 实测**:记录基线 → `plugin add --save-exact` 两官方包 → 非中断验收(incompatible=0、multi-root- 行 11、版本四行核对、bundles=20)。
9. **重启后验收**:操作者会话外 `docker restart dsh`(分歧点 Q-A),agent 核对启动日志零拒绝 + UI 冒烟。

## ⑥ 设计假设与未决项

- 假设 A1-A11 全表见 code-design.md ⑥(A11 已按分歧点 Q-F 事实修正:容器内 node 24.21.0 满足 dsh 新 engines,偏差仅宿主包装链 volta 22.18.0)。
- 未决项:无——设计线 6 条待决与阶段 1.5 四项决策全部在落档分歧点提问定案(见 decisions.md 落档轮)。
- 阶段 1.75 界面演示:未触发(C1 不成立,命中排除表「纯后端 / CLI / 数据迁移 / 配置 / 脚本」,见 code-design.md 附录)。

## 触达仓清单

全部代码/文档改动在根仓 `/home/xuqinqin/develop/person/dsh-plugins`;官方包升级落在 dsh 容器内 profile 数据目录(`~/.dsh/profiles/web/`,非仓库文件,经 `docker exec dsh dsh plugin` 操作)。
