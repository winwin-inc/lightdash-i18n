# Lightdash i18n

Lightdash 多语言支持，翻译文件位于“locales”目录中。

Lightdash 使用 [i18next](https://www.i18next.com/) 进行国际化。

目前支持的语言：

- English (en)
- Chinese (zh-CN)

## 如何贡献翻译？

欢迎参与翻译，请 fork 项目，在“locales”目录下创建对应的语言目录，并在该目录下创建对应的翻译文件。

## 分支管理

- main：最新稳定版本
- dev：开发分支，用于开发新功能
- feat/xxx：新功能分支，用于开发新功能

具体操作步骤参考 [分支管理](/docs/branch-manage.md)

## Docker 镜像

使用 Git Actions 自动构建 Docker 镜像，并推送到 Docker Hub。

- 镜像地址：[yzqzy/lightdash-i18n](https://hub.docker.com/r/yzqzy/lightdash-i18n)
- 镜像版本：[yzqzy/lightdash-i18n:latest](https://hub.docker.com/r/yzqzy/lightdash-i18n/tags)

## 如何使用 Docker 镜像？

和官方 Lightdash 使用方式一致，参考 [Lightdash 官方文档](https://docs.lightdash.com)

