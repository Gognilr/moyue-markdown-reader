import { describe, expect, it } from 'vitest'
import { createTextAnchor, relocateTextAnchor } from './textAnchor'

describe('文本锚点', () => {
  it('内容前插后仍能依靠上下文重新定位', () => {
    const original = '# 安装\n\n先安装依赖，然后运行命令。\n'
    const anchor = createTextAnchor(original, original.indexOf('安装依赖'), original.indexOf('安装依赖') + 4)
    const updated = '# 安装\n\n说明文字。\n\n先安装依赖，然后运行命令。\n'

    expect(relocateTextAnchor(updated, anchor)).toMatchObject({ start: updated.indexOf('安装依赖'), end: updated.indexOf('安装依赖') + 4 })
  })

  it('重复文本时选择标题和邻域一致的实例', () => {
    const source = '# 第一章\n\n目标内容，旧后文。\n\n# 第二章\n\n目标内容，正确后文。\n'
    const anchor = createTextAnchor(source, source.lastIndexOf('目标内容'), source.lastIndexOf('目标内容') + 4)
    const moved = `前言。\n\n${source}`

    expect(relocateTextAnchor(moved, anchor)?.start).toBe(moved.lastIndexOf('目标内容'))
  })
})
