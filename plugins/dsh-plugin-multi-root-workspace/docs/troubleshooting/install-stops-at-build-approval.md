# 安装停在构建授权（`ERR_PNPM_IGNORED_BUILDS` / `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`）

## 症状

`dsh plugin --profile <name> add dsh-plugin-multi-root-workspace`（或 tarball / git 来源）以非 0 退出，输出里有：

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: koffi@3.3.0

Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
dsh: pnpm failed in profile directory <$DSH_HOME>/profiles/<name>
```

本插件自本仓 `v1.2.0` 起 git 来源**不再**触发插件自身的构建授权（产物 `lib/` 随 tag 提交、无 `prepare`），唯一剩下的表态就是上面 `koffi` 这一次。安装 `v1.1.0` 及更早的 tag 时，git 来源还会先撞上另一条更早的失败——插件自己的 `prepare` 也要授权：

```text
ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED  Failed to prepare git-hosted package fetched from
"https://codeload.github.com/<owner>/<repo>/tar.gz/<commit>": The git-hosted package
"dsh-plugin-multi-root-workspace@<version>" needs to execute build scripts but is not in the
"onlyBuiltDependencies" allowlist.
```

安装**没有完成**：该 profile 的 `dsh.profile.bundles` 里没有本插件，`dsh --profile <name>` 也就完全没有多根能力。再执行一次 `add` 仍然是同样的失败——它不是瞬时错误。

## 根本原因

### pnpm ≥10 的供应链纪律

pnpm ≥10 **默认不运行任何依赖的生命周期脚本**：未在 profile 的 `pnpm-workspace.yaml` 里显式表态的构建脚本会被跳过。本插件带一个需要构建的原生依赖 `koffi`（Windows 上 Registry Authority 的 FFI 封装，见 [ADR-0007](../decisions/ADR-0007-registry-authority-lease.md)），它的 `install` 脚本做本地预编译，被跳过后 pnpm 以非 0 退出，`dsh plugin add` 随即把这次安装判定为失败。

### 为什么 git 来源曾是硬失败、注册表来源只是警告（机制）

以下依据 pnpm 10.34.6 的打包源码（`dist/pnpm.cjs` 中的 `packageShouldBeBuilt` / `preparePackage` / `createAllowBuildFunction` / `reportIgnoredBuilds`）：

1. **两条不同的代码路径**。注册表依赖的构建脚本被忽略时走 `reportIgnoredBuilds()` 一族逻辑：默认只打印 `Ignored build scripts: …` 警告（`strictDepBuilds: true` 时才升级为 `ERR_PNPM_IGNORED_BUILDS` 错误）。git 依赖则走 `preparePackage()`：`packageShouldBeBuilt()` 只要看到 `scripts.prepare` 非空就判定"必须构建"，而 `prepare` 的产物（`lib/`）是包能加载的前提——没有"跳过但可用"的降级路径，所以 `allowBuild(depPath)` 不通过时**直接 throw** `GIT_DEP_PREPARE_NOT_ALLOWED`。
2. **键里为什么带 commit**。throw 之前算出的 depPath 是 `包名@pkgResolutionId`；git 来源的 resolutionId 是 codeload 的 tarball URL（内含 commit）加 `#path:<子目录>`，于是授权键形如 `dsh-plugin-multi-root-workspace@https://codeload.github.com/…/tar.gz/<commit>#path:plugins/…`——换 tag 后 commit 变了，旧键失效，这也是它"随每次升级过期一次"的原因。
3. **没有通配**。`createAllowBuildFunction` 是纯 `Set.has()` 精确匹配：git 依赖比整串 depPath，注册表依赖比 `name` 或 `name@version`。`*`、前缀匹配都不存在，所以无法写一条一劳永逸的 git 依赖授权。
4. **注册表依赖按包名匹配**。`koffi` 有 semver 版本，用裸包名即可，版本/tag 变化都不影响这条键。

### 本仓的根治（v1.2.0 起）

既然授权门只在"包需要构建"时触发，就让包**不需要构建**：删除全部插件的 `prepare` 脚本、把构建产物 `lib/` 随 tag 提交（`scripts/release.mjs` 在每次发布提交前递归重建并入库，新鲜度由发布流程构造性保证），另补一个 `prepack` 供将来 npm 发布使用。pnpm 对"无 `prepare`，或仅有 `prepack` 但 `main` 文件（`lib/index.js`）已存在"的包判 `packageShouldBeBuilt = false`——授权门根本不被咨询，pnpm 10/11 行为一致。社区同类先例：`dsh-better-input`、`dsh-pocket` 同样把 `lib/` 提交进仓库换取 tag 开箱即用；多数派（官方包、`dsh-context` 等）则以 npm 分发规避（tarball 在发布时构建，仓库不入库）。

## 诊断方法

1. 看该 profile 的 `pnpm-workspace.yaml`。**pnpm ≥11** 会把待决项留在文件里，形如

   ```yaml
   allowBuilds:
     koffi: set this to true or false
   ```

   出现 `set this to true or false` 就说明卡在构建授权，不用再找别的原因。**pnpm 10 不写占位**（文件保持原样），只在失败输出里给出确切的键。
2. 确认 profile 目录：`<$DSH_HOME>/profiles/<name>`（桌面端是 `desktop`，CLI 常用 `web` / `headless`）。
3. 想要更完整的 pnpm 输出，可以直接在 profile 目录里跑 `pnpm install`——`dsh plugin add` 只转述了最后一行。

## 已验证的解决方案

### pnpm ≥11：改 `allowBuilds` 占位

把 `koffi` 那一行改成 `true`（该 profile 的 `pnpm-workspace.yaml`）：

```yaml
allowBuilds:
  koffi: true
```

重新执行同一条 `add`。这一次会看到 `node_modules/koffi install: Done`，安装完成，插件出现在 `dsh.profile.bundles` 里。

### pnpm 10：把 `koffi` 加进 `onlyBuiltDependencies`

```yaml
onlyBuiltDependencies:
  - koffi
```

按包名匹配，一次写入永久有效（不随插件 tag 或 koffi 版本变化）。

把 `koffi` 置 `true` 意味着**允许该依赖的安装脚本在你的机器上执行**（不在 agent 运行的任何沙箱之内）；它的脚本只做本地预编译。置 `false` 也能让 pnpm 退出 0，但 koffi 的原生二进制就不会被准备，Windows 上的 Registry Authority 会因此在运行时失败——不确定时选 `true`。

### 历史 tag（≤ v1.1.0）的 git 安装

安装 `v1.1.0` 及更早 tag 时插件自身还带 `prepare`，git 来源除 `koffi` 外还要多一条**精确 dep path** 的授权：pnpm 10 需把报错原样打印的那一行（`name@<codeload URL 含 commit>#path:<子目录>`）加进 `onlyBuiltDependencies`，且换 tag 后要按新一次失败的输出刷新；pnpm ≥11 则把本包的 `allowBuilds` 占位也改成 `true`。升级到 ≥ `v1.2.0` 的 tag 后这两条插件自身的条目可以删掉，只留 `koffi`。

## 相关

- [README §安装](../../README.md)（四种安装来源与构建授权说明）
- [故障排查：DSH 版本不在支持矩阵上](./unsupported-dsh-release.md)（装完之后插件仍不生效的另一种原因）
