# AI 划词助手

一个 WXT 浏览器扩展：在网页中划选单词或短语后，自动高亮选区，并调用 AI 解释它在原句中的含义、翻译整句、给出示例。学习记录保存在浏览器本地，可从弹窗导出 JSON 或 CSV。

## 功能

- 划词后显示页面浮层
- 高亮当前页面中的划词选区
- 解释单词/短语在句子中的含义
- 翻译完整句子
- 生成示例句
- 保存最近 500 条记录
- 导出 JSON / CSV
- 支持 DeepSeek 与 OpenAI-compatible Chat Completions 接口

## AI 配置

DeepSeek 默认配置：

- Base URL: `https://api.deepseek.com`
- Path: `/chat/completions`
- Model: `deepseek-v4-flash`
- Authorization: `Bearer <API Key>`

OpenAI-compatible 默认配置：

- Base URL: `https://api.openai.com/v1`
- Path: `/chat/completions`
- Model: `gpt-4.1-mini`
- Authorization: `Bearer <API Key>`

其他兼容服务只要支持 `POST {baseUrl}/chat/completions`，一般只需要替换 Base URL、API Key 和 Model。

## 开发

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```
