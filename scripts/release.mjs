#!/usr/bin/env node
/**
 * 发布：同步仓库级版本号，产出发布提交与 annotated tag。
 *
 * 用法：
 *   pnpm release <version> [--dry-run]     # 等价于 node scripts/release.mjs <version>
 *   pnpm release <version>                 # 同步版本 → 重建产物 → 提交 chore(release): v<version> → 打 tag v<version>
 *
 * 约定（见根 README「发布与版本」）：
 * - **仓库级统一版本**：根 `package.json` 与每个插件包的 `package.json`
 *   （即 plugins/<目录>/package.json）的
 *   `version` 同步为同一个值，tag 风格 `v<version>`。
 * - tag 是 profile 侧安装的唯一锚点：`github:<owner>/<repo>#v<version>&path:plugins/<目录>`；
 *   `package.json` 的 `version` 与 tag 保持一致，是为了让 DSH 的
 *   `package@version` 版本豁免与排障输出能直接对上发布点。
 * - **构建产物 `plugins/<name>/lib/` 随仓库提交**（v1.2.0 起）：git 来源安装因此
 *   不触发 pnpm 的构建脚本授权（无 `prepare` → `packageShouldBeBuilt` 为 false）。
 *   发布提交前递归重建一次全部产物并连同版本号入库，新鲜度由发布流程构造性保证。
 *
 * 脚本只做本地动作（校验 → 改版本 → 重建产物 → 提交 → 打 tag）。容器内没有 ssh，
 * push 请在宿主执行：`git push origin main --tags`；tag 未推送到远程前，
 * profile 无法按 `#v<version>` 解析安装。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 版本号：semver 三段 + 可选预发布后缀（tag 一律带 v 前缀）。 */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

function fail(message) {
  process.stderr.write(`release: ${message}\n`)
  process.exit(1)
}

/**
 * 解析提交身份。`pnpm release` 在 volta 容器里执行，那里读不到 dsh 容器
 * 挂载的 ~/.gitconfig，于是 `git commit` 会因缺少 user.email 失败；此时
 * 回退到 HEAD 的提交者身份（个人仓库里与本地身份同源），并用 `-c` 显式传入。
 */
function resolveIdentity() {
  const read = (key) => {
    try {
      return execFileSync('git', ['config', key], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
    } catch {
      return ''
    }
  }
  const name = read('user.name')
  const email = read('user.email')
  if (name !== '' && email !== '') return { name, email, source: 'git config' }
  try {
    const [headName, headEmail] = git(['log', '-1', '--format=%an%n%ae']).split('\n')
    if (headName && headEmail) return { name: headName, email: headEmail, source: 'HEAD 提交者（环境读不到 gitconfig）' }
  } catch {
    // 仓库还没有提交：没有可回退的身份。
  }
  fail('无法确定 git 身份：请在有 gitconfig 的环境执行，或先设置 user.name / user.email')
}

const identity = resolveIdentity()
const identityArgs = ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`]

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const positional = argv.filter((argument) => !argument.startsWith('-'))
if (positional.length !== 1) {
  fail('用法：node scripts/release.mjs <version> [--dry-run]（例：1.0.0）')
}

const version = positional[0].replace(/^v/, '')
if (!SEMVER.test(version)) {
  fail(`版本号不合法：${positional[0]}（期望 semver，如 1.0.0 或 1.1.0-rc.1）`)
}
const tag = `v${version}`

// 前置条件：main 分支、工作区干净、tag 未被占用。
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main') fail(`当前分支是 ${branch}，发布必须在 main 上`)
const dirty = git(['status', '--porcelain'])
if (dirty !== '') fail(`工作区不干净，先提交或清理：\n${dirty}`)
try {
  git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`])
  fail(`tag ${tag} 已存在（本地）`)
} catch (error) {
  // rev-parse --verify 对不存在的 ref 以退出码 1 失败，正是期望路径。
  if (error.status !== 1) throw error
}

// 目标清单：workspace 根 + 每个插件目录。
const pluginDirs = readdirSync(join(REPO_ROOT, 'plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
if (pluginDirs.length === 0) fail('plugins/ 下没有插件目录')
const targets = [
  { path: 'package.json', label: 'workspace 根' },
  ...pluginDirs.map((name) => ({ path: `plugins/${name}/package.json`, label: name })),
]

const results = []
/** 原文件内容，供提交/打 tag 失败时回滚（发布要么整体成功，要么不留痕迹）。 */
const backups = new Map()
for (const target of targets) {
  const file = join(REPO_ROOT, target.path)
  const original = readFileSync(file, 'utf8')
  let manifest
  try {
    manifest = JSON.parse(original)
  } catch (error) {
    fail(`读取 ${target.path} 失败：${error.message}`)
  }
  if (typeof manifest.version !== 'string') fail(`${target.path} 缺少字符串 version 字段`)
  const before = manifest.version
  const changed = before !== version
  results.push({ ...target, before, changed })
  if (changed && !dryRun) {
    backups.set(target.path, original)
    manifest.version = version
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  }
}

process.stdout.write(`release: 目标版本 ${version}（tag ${tag}）\n`)
for (const result of results) {
  const note = result.changed ? '' : '（已一致）'
  process.stdout.write(`  ${result.path.padEnd(46)} ${result.before} → ${version}${note}\n`)
}

if (dryRun) {
  process.stdout.write('\nrelease: dry-run，未写入、未提交、未打 tag\n')
  process.exit(0)
}

const changed = results.filter((result) => result.changed)
process.stdout.write(`release: 提交身份 ${identity.name} <${identity.email}>（${identity.source}）\n`)
process.stdout.write('release: 递归重建全部插件产物（lib/ 随仓库提交）…\n')
try {
  // 产物新鲜度构造性保证：发布提交里的 lib 一定对应当前源码，不依赖提交纪律。
  execFileSync('pnpm', ['build'], { cwd: REPO_ROOT, stdio: 'inherit' })
  const libPaths = pluginDirs
    .map((name) => `plugins/${name}/lib`)
    .filter((path) => existsSync(join(REPO_ROOT, path)))
  if (libPaths.length > 0) git(['add', ...libPaths])
  if (changed.length > 0) {
    git(['add', ...changed.map((result) => result.path)])
  }
  // 有任何暂存内容才提交（版本未变且产物字节稳定的重复发布只补 tag）。
  const staged = git(['status', '--porcelain'])
    .split('\n')
    .filter((line) => /^[AM]/.test(line)).length
  if (staged > 0) {
    git([...identityArgs, 'commit', '-m', `chore(release): ${tag}`])
  }
  git([...identityArgs, 'tag', '-a', tag, '-m', tag])
} catch (error) {
  for (const [path, original] of backups) writeFileSync(join(REPO_ROOT, path), original)
  try {
    // 发布前工作区是干净的，checkout 即可撤销重建出的产物与版本改动。
    git(['checkout', 'HEAD', '--', 'plugins'])
  } catch {
    // 回滚失败不影响版本文件已还原的事实，交由用户处理。
  }
  if (changed.length > 0) {
    try {
      git(['reset', '-q', 'HEAD', '--', ...changed.map((result) => result.path)])
    } catch {
      // 同上。
    }
  }
  fail(`重建、提交或打 tag 失败，已回滚改动：${error.message.split('\n')[0]}`)
}

const head = git(['rev-parse', '--short', 'HEAD'])
process.stdout.write(`\nrelease: 完成（提交 ${head}，tag ${tag}）\n`)
process.stdout.write('下一步（容器内没有 ssh，请在宿主执行）：\n')
process.stdout.write('  git push origin main --tags\n')
process.stdout.write(`推送后 profile 才能按 #${tag} 解析安装；升级 profile 时把 spec 里的 tag 改成 ${tag} 再重装\n`)
