# 漫画成品合集 GitHub 下载交付

## Problem

创作者要求将第01–12话 ZIP 放到 GitHub 并提供下载链接。现有 ZIP 约114MB，超过 Git 普通文件100MiB限制；本地 gh release create 附件上传访问 uploads.github.com 返回 EOF，未留下 Release。

## Proposal

使用独立漫画交付工作流在 GitHub runner 内校验、打包和上传 Release 附件，不混入现有软件版本/ClawHub 发布流程。清单锁定57张PNG的路径与SHA256，保留原ZIP说明、条目名与时间；不重画、不转码。工作流只响应当前工作分支的自身/打包工具变更，权限限 contents:write，创建独立预发布。完成后核验 Release asset 状态与大小，给出 browser_download_url。

## Alternatives considered

- 普通 Git 提交文件最直观，但 ZIP 超过单文件上限且会膨胀历史，不采用。
- 缩小图或改JPEG能减小体积，但用户要完整合集，不损失原画质量。

## Consequences

- 收益：用户获得公开稳定的单文件附件链接，仓库内只保存小体积工具与校验清单。
- 代价：首次交付需一次 Actions 运行；工作流需写入 Release 的权限。
