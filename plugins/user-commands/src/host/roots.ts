/**
 * 工作区根枚举：发现要走的目录清单。
 *
 * 主来源是 workspace registry 自己的顺序（用户在侧边栏看到的顺序）：登记顺序是一条持久化事实，
 * 它决定附加根归属的先后（见 `attribution.ts`）与扫描清单的顺序，而不是由扫描时机决定。
 * 每个主根随后带上 multi-root registry 授予它的附加根；那个服务是**软依赖**，缺席（插件未装
 * 或未激活）时降级为只看主根，而不是让整次发现失败。
 *
 * 薄再导出（G4）：枚举实现是内核的 `workspaceRoots`，经结构化端口读登记表，不 import 任何
 * 宿主 DSH 类型；包内调用方直接传自己的 cordis 上下文。
 * @module dsh-plugin-user-commands/host/roots
 */

export { workspaceRoots } from '@dsh-plugins/host-kit/roots'
