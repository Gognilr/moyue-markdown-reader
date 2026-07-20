import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputPath = resolve(process.argv[2] ?? 'test-artifacts/large-performance-fixture.md');
const sectionCount = Number(process.argv[3] ?? 4500);
const sections = ['# 大文件性能验收样本', '', '> 本文件由测试脚本生成，仅用于本地性能验收。', ''];

for (let index = 1; index <= sectionCount; index += 1) {
  sections.push(
    `## 第 ${index} 节 性能与稳定性验证`,
    '',
    `这是第 ${index} 节的中文正文，用于验证 Markdown 大文件的打开速度、内存占用、目录导航与连续滚动性能。内容包含 **强调文本**、\`inline_code_${index}\` 和 [本地锚点](#第-${index}-节-性能与稳定性验证)。`,
    '',
    `- 检查项 A：首屏是否及时显示；编号 ${index}`,
    `- 检查项 B：快速滚动是否卡顿；编号 ${index}`,
    `- 检查项 C：目录跳转是否准确；编号 ${index}`,
    '',
    `| 序号 | 中文字段 | 状态 | 说明 |`,
    `| ---: | --- | :---: | --- |`,
    `| ${index} | 示例数据 ${index} | 正常 | 用于宽表与大量节点渲染基线 |`,
    '',
  );
}

await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, sections.join('\n'), 'utf8');
console.log(JSON.stringify({ outputPath, sectionCount, bytes: Buffer.byteLength(sections.join('\n')) }));
