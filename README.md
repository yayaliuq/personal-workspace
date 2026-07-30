# 鸭鸭的加油站 v6.0

个人信息聚合工作台 — 治愈系 UI，CloudBase 云端同步，Mac/iPhone 独立适配。

## 功能模块

| 模块 | 子项 | 说明 |
|------|------|------|
| 总览 | — | 问候卡 + 天气 + 健康打卡 + 待办速览 + 日历 |
| 待办 | 工作/生活/灵感 | 任务管理 + 灵感记录 |
| 赚钱 | 投资/小红书/网店/灵感库 | 投资标的追踪 + 小红书内容管线 + 网店管理 + 灵感库 |
| 学习 | 日语/读书 | 学习笔记 + 读书进度 |

## 健康打卡

- 喝水 8 杯（SVG 水杯可视化）
- 早睡/早起打卡
- 饮食红黄绿灯（早/午/晚）
- 每周运动计数
- 日历视图查看历史记录

## 快速开始

### 线上访问

- GitHub Pages: https://yayaliuq.github.io/personal-workspace/
- 腾讯云: https://tcloudbaseapp.com

### 本地运行

```bash
node server.js
# 电脑访问: http://localhost:3100
# 手机访问: http://<局域网IP>:3100
```

## 技术栈

- 纯 HTML + CSS + JavaScript，零框架依赖
- CloudBase JS SDK 云端数据同步（env: yayaliu-d4g1i1dc2fdb04417）
- 治愈系配色（蜜桃/薄荷/薰衣草/天蓝/奶油）
- 响应式设计，Mac 和 iPhone 独立优化
- PWA 支持离线访问
- Open-Meteo 天气 API（西安 34.26°N, 108.94°E）
