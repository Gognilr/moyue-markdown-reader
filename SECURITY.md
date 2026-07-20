# 安全政策

## 支持范围

| 版本 | 安全更新 |
| --- | --- |
| 最新 GitHub Release | 支持 |
| 更早版本或未发布构建 | 不保证 |

## 报告漏洞

请优先使用仓库 GitHub 页面中的 **Security → Report a vulnerability** 私密报告入口，并提供：

- 受影响版本与 Windows 版本；
- 可复现的最小步骤或样本；
- 影响范围和攻击前提；
- 建议修复（如有）。

如果仓库尚未启用 GitHub Private Vulnerability Reporting，请只创建一个不含利用细节的公开 Issue，请求维护者提供私密联系渠道。不要公开发布密钥、个人文件、完整利用代码或仍可被滥用的路径。

维护者会尽快确认报告、评估影响并协调修复与披露时间。请在修复发布前给予合理处理时间。

## 范围说明

文件读取、导出、外部链接、Shell 和 Windows 注册表集成属于高敏感边界。安全设计见 [docs/security-scope.md](docs/security-scope.md)，隐私行为见 [docs/PRIVACY.md](docs/PRIVACY.md)。
