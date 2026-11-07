import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  Button,
  Checkbox,
  IconSlidersTwoOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  MenuItemButton,
  Menu,
  Modal,
  SegmentedTabs,
  Switch,
} from '../src/ui-primitives.tsx'
/**
 * 本包测试底座自身的最小自测：关键具名导出在场 + 基础 primitive 能被
 * `renderToStaticMarkup`（react-dom/server，纯 node，零新增依赖）渲染。
 *
 * 不渲染 `open` 状态的 `Modal` / portal 菜单：`createPortal` 不被
 * react-dom/server 支持（SSR 渲染器遇 portal 即抛），组件套件的 DOM 断言
 * 由消费方包的 jsdom 套件负责，这里只验证「能渲染、形状标记在位」。
 */
describe('ui-primitives 底座', () => {
  it('关键具名导出全部在场且为函数', () => {
    for (const component of [
      Button,
      Input,
      Switch,
      Checkbox,
      SegmentedTabs,
      Menu,
      MenuItemButton,
      Modal,
      IconSlidersTwoOutlineRegular,
      IconTrashOutlineRegular,
    ]) {
      expect(typeof component).toBe('function')
    }
  })

  it('renderToStaticMarkup 渲染基础 primitive 不抛，可观测标记在位', () => {
    const markup = [
      renderToStaticMarkup(
        <Button
          variant="primary"
          size="sm"
          disabled
          aria-label="刷新"
          icon={<IconSlidersTwoOutlineRegular size={16} />}
        >
          保存
        </Button>,
      ),
      renderToStaticMarkup(<Input data-input-id="q" placeholder="搜索" />),
      renderToStaticMarkup(<Switch checked onChange={() => {}} label="开关" title="tip" />),
      renderToStaticMarkup(<Checkbox checked={false} onChange={() => {}} label="勾选" />),
      renderToStaticMarkup(
        <SegmentedTabs
          label="视图"
          value="tree"
          onChange={() => {}}
          items={[{ value: 'tree', label: '树', id: 'tab-tree', panelId: 'panel-tree' }]}
        />,
      ),
      renderToStaticMarkup(<MenuItemButton danger separatorBefore onSelect={() => {}}>删除</MenuItemButton>),
      renderToStaticMarkup(<IconTrashOutlineRegular size={20} />),
      renderToStaticMarkup(<Modal open={false} onClose={() => {}} title="不渲染" />),
    ].join('')

    expect(markup).toContain('data-variant="primary"')
    expect(markup).toContain('data-size="sm"')
    expect(markup).toContain('aria-label="刷新"')
    expect(markup).toContain('保存')
    expect(markup).toContain('data-input="true"')
    expect(markup).toContain('placeholder="搜索"')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('data-switch="true"')
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('role="menuitem"')
    expect(markup).toContain('data-danger="true"')
    expect(markup).toContain('data-separator="true"')
    expect(markup).toContain('data-icon="trash"')
    // Modal open=false：不渲染任何 DOM。
    expect(markup).not.toContain('data-modal')
    // Switch 的 onClick 不判 disabled 的语义由组件守卫测试覆盖；这里验证 title 透传。
    expect(markup).toContain('title="tip"')
  })
})
