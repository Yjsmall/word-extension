import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'AI 划词助手',
    description: '划词后用 AI 解释句意、翻译句子并提供示例，支持导出学习记录。',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'AI 划词助手'
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    },
    web_accessible_resources: [
      {
        resources: ['icon.svg'],
        matches: ['<all_urls>']
      }
    ]
  }
})
