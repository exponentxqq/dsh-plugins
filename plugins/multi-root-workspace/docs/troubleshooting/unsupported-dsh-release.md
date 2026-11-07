# DSH 版本在支持范围外（插件的 provider 不启动）

## 症状

出现下列任意一组：

- 插件装上了，但**行为完全等同于未安装**：`/workspace-folders` 存在或不存在都不影响，附加根一个都不授予，沙箱只认主根；
- 日志里有插件装载失败，错误文本（`DshCompatUnsupportedError` 的 message）开头是：

  ```text
  multi-root workspace: DSH <version> is outside the supported range.
  ```

- 或者：

  ```text
  multi-root workspace: this installation mixes several DSH releases.
  ```

- 或者：

  ```text
  multi-root workspace: required DSH packages are not installed.
  ```

- 在仓库里跑 `pnpm compat:check` 直接失败，指出运行时基线副本派生的范围 / `dsh.engines.dsh` / DSH peer 范围 / 已安装树之间某两者不一致；
- `pnpm install` 时出现 `@deepseek-ai/dsh-*` 的 unmet peer dependency 警告。

## 根本原因

本插件替换的是工作区围栏本身，并且 `src/dialects.ts` 是**靠观测 `super.confine` 产出的 argv 形状**识别内核 sandbox profile、再克隆它的 grant 拼法的（[ADR-0003](../decisions/ADR-0003-dialect-grant-widening.md)）。上游 `@deepseek-ai/dsh-*` 处于 pre-stable，对这些形状没有 semver 承诺。

因此插件把支持矩阵收敛成一个**由基线派生的软范围**：`src/compat/dsh-version.ts` 的 `DSH_BASELINE` 是仓库基线（根 `scripts/dsh-baseline.mjs`）的运行时副本，`SUPPORTED_DSH_RANGE` 由它派生，语义是「与基线同 `major.minor` 且 ≥ 基线」。当前基线 `0.2.2-rc.1` 派生出的范围是 `>=0.2.2-rc.1 <0.3.0`（精确值以 `scripts/dsh-baseline.mjs` 为准）。

- 同一条 minor 线上的新预发布（例如 `0.2.3-alpha.1`）**自动在范围内**，不需要改仓库任何文件；
- 低于基线、或跨到下一个 minor 的版本（`0.3.0`、`0.3.0-alpha.1`）一律拒绝——只做数值比较会放行 `0.3.0-alpha.1`，所以同 minor 判定是单独做的；
- 范围是「上游在这条线上还没有改过被观测的形状」这一判断的代码化，不是对未来的 semver 承诺，也不是一份会被人手工追加的名单。

`multi-root-compat` 是 patch 的第一行，七个安全相关的行都 inject 它：

```text
multi-root-fs
multi-root-sandbox
multi-root-registry
multi-root-instructions
multi-root-lsp
multi-root-workspace-files
multi-root-file-references
```

cordis 不会启动 injected service 缺失的行。所以判定失败时这七行**根本不启动**，组合退化成“未安装本插件”——这是刻意的 fail-closed：在一个没验证过的上游版本上，宁可不授予附加根，也不要按一个可能语义不同的 profile 去授予。门禁只有一种反应：拒绝启动；没有按环境变量或命令行放行的降级档。详见 [ADR-0009](../decisions/ADR-0009-dsh-compat-contract.md)；新增消费方的门禁见 [ADR-0011](../decisions/ADR-0011-multi-root-workspace-consumers.md)。

四种判定：

| verdict | 含义 | 典型原因 |
| --- | --- | --- |
| `incomplete` | 必需包解析不到 | 宿主组合缺包，或 peer 未被安装 |
| `mixed` | 核心包对不上同一个版本 | 局部升级过某几个 `@deepseek-ai/dsh-*` |
| `unsupported` | 版本统一，但落在派生范围外 | 宿主比基线旧，或已跨到下一个 minor 线 |
| `supported` | 正常 | —— |

## 诊断方法

1. 读那条错误信息本身：`unsupported` / `mixed` / `incomplete` 三种都会把**每一个被检查包的实际版本**逐行列出；`unsupported` 还会打印 `supported: <派生范围>` 与 `installed: <实际版本>` 两行，`mixed` 会列出互相冲突的 `releases found: …`，`incomplete` 会列出 `missing: …`。这通常已经足够定位。
2. 在 `plugins/multi-root-workspace` 目录里跑：

   ```bash
   pnpm compat:check
   ```

   它复现同样的判定，并且额外检查运行时基线副本派生的范围、`dsh.engines.dsh`、DSH peer 范围、已安装树四者是否一致。
3. 想知道每个插件**实际解析到**什么版本（声明与解析是两件事）：

   ```bash
   # 在 dsh-plugins workspace 根执行
   pnpm dsh:upgrade --print-installed
   ```

## 已验证的解决方案

按判定分三种处理。

### `mixed`：把所有 `@deepseek-ai/dsh*` 对齐到同一个版本

这一种**永远是宿主侧的问题**：混装意味着文件围栏和内核方言这两半分别对着不同的上游语义工作。把宿主 profile 里所有 `@deepseek-ai/dsh-*` 重新安装到同一个发布版本。它没有降级档也没有放行开关——门禁对 `mixed` 只有拒绝启动一种反应。

### `unsupported`：把宿主换到范围内的版本，或移动基线

先分清是哪种越界：

- **同一条 minor 线上的宿主**（版本 ≥ 仓库基线）：本仓库当前构建的插件本就支持它；若宿主上仍报 `unsupported`，通常是装到宿主上的插件版本来自另一个（更新的）基线，用「诊断方法」第 2 步的 `pnpm compat:check` 对照本仓库的派生范围与已安装树。
- **比基线旧、或跨到下一个 minor**：短期把宿主换到与基线同 `major.minor` 且不低于基线的某个发布；长期则把仓库基线移到宿主这个版本（一次受评审的改动，不需要任何人工“加入清单”的动作）：

  1. 在 `dsh-plugins` workspace 根重指整棵树。脚本会先改 `scripts/dsh-baseline.mjs` 的基线，再在同一批次里重指 `catalogs.dsh`、各插件的 devDeps / `dsh.engines.dsh` / DSH peer 范围、cordis 与 schemastery pin、运行时基线副本（`plugins/*/src/compat/dsh-version.ts`）与 release-age 豁免：

     ```bash
     pnpm dsh:upgrade <候选版本> --probe
     pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0
     ```

  2. 用完整矩阵验证。`verify:all` 里的 `compat:check` 紧接 `lint`，探测与门禁跑在**同一个派生范围**上：

     ```bash
     pnpm --filter dsh-plugin-multi-root-workspace verify:all
     ```

  3. 通过后移除 probe overrides、回到冻结安装，再跑一次仓库级门禁：

     ```bash
     pnpm dsh:upgrade <候选版本>
     pnpm install --frozen-lockfile
     pnpm dsh:check
     ```

  全绿之后基线就是新版本，派生范围自动覆盖候选：没有“允许列表”要改，也没有“绿灯之后还要人工批准”的第二道门。**绿灯是回归证据**，不是授权。

  失败项落在哪里决定要不要写适配器：如果是上游 API 改了形状，改 `src/compat/`（[ADR-0009](../decisions/ADR-0009-dsh-compat-contract.md) 第 4 条），不要在业务代码里加版本判断。

  若要放弃这次探测，`git checkout --` 恢复各插件 manifest（`plugins/*/package.json`）、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`scripts/dsh-baseline.mjs` 与 `plugins/*/src/compat/dsh-version.ts`，再 `pnpm install --frozen-lockfile`。本地的 `git checkout` 会连同未提交修改一起抹掉——先提交或 stash。

### `incomplete`：补齐必需包

`REQUIRED_CORE_PACKAGES` 里的包是插件的硬依赖（被继承、被取值、或持有被 inject 的 service key）。在宿主 profile 里安装缺失的那些。可选包缺失是合法的，不会导致 `incomplete`。
