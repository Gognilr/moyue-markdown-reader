## 变更说明

<!-- 说明问题、解决方法和为什么需要此变更。 -->

## 范围与风险

- 影响的用户流程：
- 文件系统 / Shell / 注册表权限是否变化：否 / 是（请解释）
- 是否改变 Markdown、DOCX、PDF、XLSX 或打印输出：否 / 是（请附样本）

## 验证

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] 涉及核心流程时运行 `npm run test:e2e`
- [ ] 涉及原生行为时完成 Windows 实机验证并写明结果
- [ ] 涉及导出版式时检查生成文件或逐页截图

## 文档与隐私

- [ ] 已更新相关 README、CHANGELOG 或 `docs/`
- [ ] 测试样本、日志和截图不含个人信息、密钥、内部路径或未授权内容
- [ ] 未提交构建目录、安装包或调试符号
