import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Pi 中文文档',
  description: 'Pi Coding Agent 中文翻译文档站点',
  lang: 'zh-CN',
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      { text: 'GitHub', link: 'https://github.com/earendil-works/pi' }
    ],

    sidebar: [
      {
        text: '开始使用',
        items: [
          { text: '概览', link: '/index' },
          { text: '快速开始', link: '/quickstart' },
          { text: '使用指南', link: '/usage' },
          { text: '提供商', link: '/providers' },
          { text: '设置', link: '/settings' },
          { text: '快捷键', link: '/keybindings' },
          { text: '会话', link: '/sessions' },
          { text: '压缩', link: '/compaction' }
        ]
      },
      {
        text: '自定义',
        items: [
          { text: '扩展', link: '/extensions' },
          { text: '技能', link: '/skills' },
          { text: '提示模板', link: '/prompt-templates' },
          { text: '主题', link: '/themes' },
          { text: 'Pi 包管理', link: '/packages' },
          { text: '自定义模型', link: '/models' },
          { text: '自定义提供商', link: '/custom-provider' }
        ]
      },
      {
        text: '参考',
        items: [
          { text: '会话格式', link: '/session-format' }
        ]
      },
      {
        text: '编程接口',
        items: [
          { text: 'SDK', link: '/sdk' },
          { text: 'RPC 模式', link: '/rpc' },
          { text: 'JSON 事件流', link: '/json' },
          { text: 'TUI 组件', link: '/tui' }
        ]
      },
      {
        text: '平台设置',
        items: [
          { text: 'Windows', link: '/windows' },
          { text: 'Termux (Android)', link: '/termux' },
          { text: 'tmux', link: '/tmux' },
          { text: '终端设置', link: '/terminal-setup' },
          { text: 'Shell 别名', link: '/shell-aliases' }
        ]
      },
      {
        text: '开发',
        items: [
          { text: '开发指南', link: '/development' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/earendil-works/pi' }
    ],

    outline: {
      label: '页面导航'
    },

    lastUpdated: {
      text: '最后更新于'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换'
            }
          }
        }
      }
    }
  }
})
