# 项目链接验证与推荐阅读顺序

`verifyProjectDocuments(documents, options)` 是 U9 的纯规则核心。调用方必须显式提供已经打开、选择或枚举得到的 Markdown 文档；该函数不会自行扫描目录、读取文件、解析图片或联网。

它检查可证明的问题：指向未提供文档的本地 Markdown 链接、存在但片段锚点不存在的链接、由 `resourceInventory` 明确标为不存在的相对图片、单篇文档中的重复 GitHub 风格标题锚点，以及在已提供集合中没有任何 Markdown 入边或出边的孤立文档。未提供资源事实不是“缺失”，因此不会产生误报。

推荐顺序同样只使用给定集合：显式 `entryPaths` 优先；否则从 `README.md` 开始；再按链接广度优先展开；无法从入口抵达的文档按路径稳定排序并标为 `unlinked`。每项都携带 `entry`、`linked-from` 或 `unlinked` 原因，以及可能的来源路径，界面可直接解释推荐结果，而无需知识图谱或 AI。
