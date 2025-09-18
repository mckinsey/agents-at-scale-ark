# Changelog

## [0.1.33](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.33...v0.1.33) (2025-09-18)


### Features

* add auth layer ark-sdk ([#99](https://github.com/mckinsey/agents-at-scale-ark/issues/99)) ([2c81807](https://github.com/mckinsey/agents-at-scale-ark/commit/2c818077fcb448517f196acef10023bfb20c2e37))
* ark evaluator with langfuse ([#65](https://github.com/mckinsey/agents-at-scale-ark/issues/65)) ([ecf0d4e](https://github.com/mckinsey/agents-at-scale-ark/commit/ecf0d4ebb27b009743f4086c8c8a3dd003de7b5d))
* AWS and GCP bootstrapping infra and GitHub workflows ([#28](https://github.com/mckinsey/agents-at-scale-ark/issues/28)) ([4de68b3](https://github.com/mckinsey/agents-at-scale-ark/commit/4de68b39eab8310c534248075a26e63e0cf1d35f))
* **dashboard:** adds ODIC with 'sso' and 'open' authentication models for dashboard ([60b701d](https://github.com/mckinsey/agents-at-scale-ark/commit/60b701d9a423cbd651468c37e0815ed0c76aeba2))
* **dashboard:** Delete confirmation modal for agent, team and tool ([#90](https://github.com/mckinsey/agents-at-scale-ark/issues/90)) ([9be7f3b](https://github.com/mckinsey/agents-at-scale-ark/commit/9be7f3baf7c0af88e0cf149c19b32eae344a56b8))
* Displaying pre-selected single namespace ([#111](https://github.com/mckinsey/agents-at-scale-ark/issues/111)) ([36aeb14](https://github.com/mckinsey/agents-at-scale-ark/commit/36aeb149c66fe521d86133d06b4bf62684cf3270))
* implement A2AServer dependency checking for agents ([#121](https://github.com/mckinsey/agents-at-scale-ark/issues/121)) ([18ea7bc](https://github.com/mckinsey/agents-at-scale-ark/commit/18ea7bc09526d319d8b5442e20f68f0321e1d7a7))
* non-blocking agent creation with deferred dependency validation ([#89](https://github.com/mckinsey/agents-at-scale-ark/issues/89)) ([71bab8f](https://github.com/mckinsey/agents-at-scale-ark/commit/71bab8f50c0b720b4bb5e908c244419f1f9fe684))
* query response format ([#82](https://github.com/mckinsey/agents-at-scale-ark/issues/82)) ([7a4a5f6](https://github.com/mckinsey/agents-at-scale-ark/commit/7a4a5f6567ad337cc344de88b7332b59cb3424d3))
* Update agent UI to show status ([#104](https://github.com/mckinsey/agents-at-scale-ark/issues/104)) ([5013f00](https://github.com/mckinsey/agents-at-scale-ark/commit/5013f002590ed1189e3b3bf5b73f19a5975d84c5))


### Bug Fixes

* `devspace dev` dashboard console errors ([#105](https://github.com/mckinsey/agents-at-scale-ark/issues/105)) ([2918dd1](https://github.com/mckinsey/agents-at-scale-ark/commit/2918dd112296b5c4d5350ef10d17fe121e5c5cb7))
* `devspace dev` to register sdk changes at reload ([#122](https://github.com/mckinsey/agents-at-scale-ark/issues/122)) ([c71ac84](https://github.com/mckinsey/agents-at-scale-ark/commit/c71ac84638ce60534b03fd61f9b9a5c5c3325521))
* add BaseURL support for Bedrock models ([#124](https://github.com/mckinsey/agents-at-scale-ark/issues/124)) ([48e247a](https://github.com/mckinsey/agents-at-scale-ark/commit/48e247ac945676e6648dc7c5cd325c491313ba30))
* ark-api container restart in devspace ([#102](https://github.com/mckinsey/agents-at-scale-ark/issues/102)) ([a1bd681](https://github.com/mckinsey/agents-at-scale-ark/commit/a1bd681ebe67abe31951720894c027210562cb9d))
* **ark-api:** return default model if not set for agent ([#73](https://github.com/mckinsey/agents-at-scale-ark/issues/73)) ([09c8dcc](https://github.com/mckinsey/agents-at-scale-ark/commit/09c8dccd5311611c92ebe81d6dae91b019e75dd7))
* enable external PRs to use fork's container registry ([#114](https://github.com/mckinsey/agents-at-scale-ark/issues/114)) ([feedf72](https://github.com/mckinsey/agents-at-scale-ark/commit/feedf72ab7cbe401a7ba7c27a8950a320be62836))
* Fix Namespace and path ([#100](https://github.com/mckinsey/agents-at-scale-ark/issues/100)) ([2fef74e](https://github.com/mckinsey/agents-at-scale-ark/commit/2fef74e5d681057e3b95fd77a069c9639b2ace54))
* helm charts use AppVersion for image tags and deploy workflow supports latest ([#95](https://github.com/mckinsey/agents-at-scale-ark/issues/95)) ([d016cfe](https://github.com/mckinsey/agents-at-scale-ark/commit/d016cfe875498d3a32a3745fc77e12e8f00aa1d7))
* missing QueryClientProvider issue, queries tab ui glitch ([#108](https://github.com/mckinsey/agents-at-scale-ark/issues/108)) ([4ac6e4b](https://github.com/mckinsey/agents-at-scale-ark/commit/4ac6e4be84e442daa77b856635caac0c872d7861))
* quickstart fark and ark-cli installation ([#117](https://github.com/mckinsey/agents-at-scale-ark/issues/117)) ([d6bffd7](https://github.com/mckinsey/agents-at-scale-ark/commit/d6bffd7f3019b01d1c0984bea74135946a97e92a))
* separate registry hostname from full path for docker login ([#120](https://github.com/mckinsey/agents-at-scale-ark/issues/120)) ([7342930](https://github.com/mckinsey/agents-at-scale-ark/commit/73429306c17912b19f60ba675b784bce491d1c83))
* update badge template URL and improve iframe usage for contributors ([#98](https://github.com/mckinsey/agents-at-scale-ark/issues/98)) ([9b61b15](https://github.com/mckinsey/agents-at-scale-ark/commit/9b61b15e1591b420bda5505c294a8c3c7920dc4f))


### Miscellaneous Chores

* release 0.1.33 ([13d6113](https://github.com/mckinsey/agents-at-scale-ark/commit/13d61139d3f247fbfd67e43925e3d77a443c41a9))

## [0.1.33](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.33...v0.1.33) (2025-09-17)


### Features

* add auth layer ark-sdk ([#99](https://github.com/mckinsey/agents-at-scale-ark/issues/99)) ([2c81807](https://github.com/mckinsey/agents-at-scale-ark/commit/2c818077fcb448517f196acef10023bfb20c2e37))
* ark evaluator with langfuse ([#65](https://github.com/mckinsey/agents-at-scale-ark/issues/65)) ([ecf0d4e](https://github.com/mckinsey/agents-at-scale-ark/commit/ecf0d4ebb27b009743f4086c8c8a3dd003de7b5d))
* AWS and GCP bootstrapping infra and GitHub workflows ([#28](https://github.com/mckinsey/agents-at-scale-ark/issues/28)) ([4de68b3](https://github.com/mckinsey/agents-at-scale-ark/commit/4de68b39eab8310c534248075a26e63e0cf1d35f))
* **dashboard:** adds ODIC with 'sso' and 'open' authentication models for dashboard ([60b701d](https://github.com/mckinsey/agents-at-scale-ark/commit/60b701d9a423cbd651468c37e0815ed0c76aeba2))
* **dashboard:** Delete confirmation modal for agent, team and tool ([#90](https://github.com/mckinsey/agents-at-scale-ark/issues/90)) ([9be7f3b](https://github.com/mckinsey/agents-at-scale-ark/commit/9be7f3baf7c0af88e0cf149c19b32eae344a56b8))
* implement A2AServer dependency checking for agents ([#121](https://github.com/mckinsey/agents-at-scale-ark/issues/121)) ([18ea7bc](https://github.com/mckinsey/agents-at-scale-ark/commit/18ea7bc09526d319d8b5442e20f68f0321e1d7a7))
* non-blocking agent creation with deferred dependency validation ([#89](https://github.com/mckinsey/agents-at-scale-ark/issues/89)) ([71bab8f](https://github.com/mckinsey/agents-at-scale-ark/commit/71bab8f50c0b720b4bb5e908c244419f1f9fe684))
* query response format ([#82](https://github.com/mckinsey/agents-at-scale-ark/issues/82)) ([7a4a5f6](https://github.com/mckinsey/agents-at-scale-ark/commit/7a4a5f6567ad337cc344de88b7332b59cb3424d3))
* Update agent UI to show status ([#104](https://github.com/mckinsey/agents-at-scale-ark/issues/104)) ([5013f00](https://github.com/mckinsey/agents-at-scale-ark/commit/5013f002590ed1189e3b3bf5b73f19a5975d84c5))


### Bug Fixes

* `devspace dev` dashboard console errors ([#105](https://github.com/mckinsey/agents-at-scale-ark/issues/105)) ([2918dd1](https://github.com/mckinsey/agents-at-scale-ark/commit/2918dd112296b5c4d5350ef10d17fe121e5c5cb7))
* `devspace dev` to register sdk changes at reload ([#122](https://github.com/mckinsey/agents-at-scale-ark/issues/122)) ([c71ac84](https://github.com/mckinsey/agents-at-scale-ark/commit/c71ac84638ce60534b03fd61f9b9a5c5c3325521))
* add BaseURL support for Bedrock models ([#124](https://github.com/mckinsey/agents-at-scale-ark/issues/124)) ([48e247a](https://github.com/mckinsey/agents-at-scale-ark/commit/48e247ac945676e6648dc7c5cd325c491313ba30))
* ark-api container restart in devspace ([#102](https://github.com/mckinsey/agents-at-scale-ark/issues/102)) ([a1bd681](https://github.com/mckinsey/agents-at-scale-ark/commit/a1bd681ebe67abe31951720894c027210562cb9d))
* **ark-api:** return default model if not set for agent ([#73](https://github.com/mckinsey/agents-at-scale-ark/issues/73)) ([09c8dcc](https://github.com/mckinsey/agents-at-scale-ark/commit/09c8dccd5311611c92ebe81d6dae91b019e75dd7))
* enable external PRs to use fork's container registry ([#114](https://github.com/mckinsey/agents-at-scale-ark/issues/114)) ([feedf72](https://github.com/mckinsey/agents-at-scale-ark/commit/feedf72ab7cbe401a7ba7c27a8950a320be62836))
* Fix Namespace and path ([#100](https://github.com/mckinsey/agents-at-scale-ark/issues/100)) ([2fef74e](https://github.com/mckinsey/agents-at-scale-ark/commit/2fef74e5d681057e3b95fd77a069c9639b2ace54))
* helm charts use AppVersion for image tags and deploy workflow supports latest ([#95](https://github.com/mckinsey/agents-at-scale-ark/issues/95)) ([d016cfe](https://github.com/mckinsey/agents-at-scale-ark/commit/d016cfe875498d3a32a3745fc77e12e8f00aa1d7))
* missing QueryClientProvider issue, queries tab ui glitch ([#108](https://github.com/mckinsey/agents-at-scale-ark/issues/108)) ([4ac6e4b](https://github.com/mckinsey/agents-at-scale-ark/commit/4ac6e4be84e442daa77b856635caac0c872d7861))
* quickstart fark and ark-cli installation ([#117](https://github.com/mckinsey/agents-at-scale-ark/issues/117)) ([d6bffd7](https://github.com/mckinsey/agents-at-scale-ark/commit/d6bffd7f3019b01d1c0984bea74135946a97e92a))
* separate registry hostname from full path for docker login ([#120](https://github.com/mckinsey/agents-at-scale-ark/issues/120)) ([7342930](https://github.com/mckinsey/agents-at-scale-ark/commit/73429306c17912b19f60ba675b784bce491d1c83))
* update badge template URL and improve iframe usage for contributors ([#98](https://github.com/mckinsey/agents-at-scale-ark/issues/98)) ([9b61b15](https://github.com/mckinsey/agents-at-scale-ark/commit/9b61b15e1591b420bda5505c294a8c3c7920dc4f))


### Miscellaneous Chores

* release 0.1.33 ([13d6113](https://github.com/mckinsey/agents-at-scale-ark/commit/13d61139d3f247fbfd67e43925e3d77a443c41a9))

## [0.1.33](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.33...v0.1.33) (2025-09-10)


### Miscellaneous Chores

* release 0.1.33 ([13d6113](https://github.com/mckinsey/agents-at-scale-ark/commit/13d61139d3f247fbfd67e43925e3d77a443c41a9))

## [0.1.33](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.32...v0.1.33) (2025-09-10)


### Features

* agent as tool creation ([#43](https://github.com/mckinsey/agents-at-scale-ark/issues/43)) ([4b58aa3](https://github.com/mckinsey/agents-at-scale-ark/commit/4b58aa368c4cc3b8e13c887879c80b24e278196a))
* agents as tools ([#40](https://github.com/mckinsey/agents-at-scale-ark/issues/40)) ([d75c1cb](https://github.com/mckinsey/agents-at-scale-ark/commit/d75c1cbe294917b0a6d51a87db84109bda52d6a3))
* **dashboard:** Define config as map in Helm chart values ([#80](https://github.com/mckinsey/agents-at-scale-ark/issues/80)) ([f946aa2](https://github.com/mckinsey/agents-at-scale-ark/commit/f946aa259b420df1860712a3086fe8bf12b9e4c3))
* devspace live reload for ark-controller ([#60](https://github.com/mckinsey/agents-at-scale-ark/issues/60)) ([5ac7996](https://github.com/mckinsey/agents-at-scale-ark/commit/5ac79963de8393d31ec8396005794bbcbcfda798))
* update charts to use GHCR images by default ([#86](https://github.com/mckinsey/agents-at-scale-ark/issues/86)) ([fabfd38](https://github.com/mckinsey/agents-at-scale-ark/commit/fabfd38a2b544eefd1cd511f2b71ab5e2b810da0))

## [0.1.32](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.31...v0.1.32) (2025-09-05)


### Features

* AAS-2595 library change for a2a ([#53](https://github.com/mckinsey/agents-at-scale-ark/issues/53)) ([84cc982](https://github.com/mckinsey/agents-at-scale-ark/commit/84cc982370eee3c98cee7676590c8cfd32952da0))
* add DevSpace support for ark-api and improve dashboard icons ([#22](https://github.com/mckinsey/agents-at-scale-ark/issues/22)) ([d492579](https://github.com/mckinsey/agents-at-scale-ark/commit/d492579b63e1f01bc75310ca725655c8d1e81b7a))
* add DevSpace support for local development ([#24](https://github.com/mckinsey/agents-at-scale-ark/issues/24)) ([8d70543](https://github.com/mckinsey/agents-at-scale-ark/commit/8d705432a251a30ac4f61f22785cddde3b1b69ca))
* Add navigation from error chat ([#19](https://github.com/mckinsey/agents-at-scale-ark/issues/19)) ([2d9a187](https://github.com/mckinsey/agents-at-scale-ark/commit/2d9a187f8596da827d932ae8affc7794d62a85e1))
* add new page for tool details ([#15](https://github.com/mckinsey/agents-at-scale-ark/issues/15)) ([5e48c25](https://github.com/mckinsey/agents-at-scale-ark/commit/5e48c251f14accbdd13e4f219fb6c3e238db3f03))
* add PyPI publishing for ARK Python SDK ([#52](https://github.com/mckinsey/agents-at-scale-ark/issues/52)) ([2a438c8](https://github.com/mckinsey/agents-at-scale-ark/commit/2a438c83e48049714bfb1ce5820af9c8e13cda50))
* add RBAC permissions for evaluation resources ([#8](https://github.com/mckinsey/agents-at-scale-ark/issues/8)) ([6763ef7](https://github.com/mckinsey/agents-at-scale-ark/commit/6763ef797bbcd54cdcf4f676e5c6915d31b34a9f))
* adding navigation from tools to query ([#16](https://github.com/mckinsey/agents-at-scale-ark/issues/16)) ([a6051c4](https://github.com/mckinsey/agents-at-scale-ark/commit/a6051c48b1177a602f9da1b6c10f67f3c57d48b3))
* **ark-api:** enable evaluation and evaluator API endpoints          ([#30](https://github.com/mckinsey/agents-at-scale-ark/issues/30)) ([5636db4](https://github.com/mckinsey/agents-at-scale-ark/commit/5636db41918d35e4c11c3632d5c3b76df73968e0))
* **ark:** implement evaluation controller with all evaluation types ([#9](https://github.com/mckinsey/agents-at-scale-ark/issues/9)) ([f983820](https://github.com/mckinsey/agents-at-scale-ark/commit/f9838203475d12ecaae9bf78d45b18f3c7ce8336))
* ARKQB-189 implement stream-based memory API system ([#45](https://github.com/mckinsey/agents-at-scale-ark/issues/45)) ([de08838](https://github.com/mckinsey/agents-at-scale-ark/commit/de08838acda58a5b0b82299149df7cabd4db2b70))
* **ARKQB-189:** complete ARK memory dashboard and fix discriminated union error ([#51](https://github.com/mckinsey/agents-at-scale-ark/issues/51)) ([602b20e](https://github.com/mckinsey/agents-at-scale-ark/commit/602b20e2d0ada5db3a3937f0789e8c92ed7acc8f))
* complete evaluator-llm service implementation with all evaluation types ([#12](https://github.com/mckinsey/agents-at-scale-ark/issues/12)) ([ce98d5f](https://github.com/mckinsey/agents-at-scale-ark/commit/ce98d5ffe42550094f2d977165666ca9d4190109))
* create A2A Server from the dashboard ([#21](https://github.com/mckinsey/agents-at-scale-ark/issues/21)) ([9d2530c](https://github.com/mckinsey/agents-at-scale-ark/commit/9d2530c09fef6c46d5c4a9aaa6e9f44e1e797272))
* delete unavailable tools UI ([#26](https://github.com/mckinsey/agents-at-scale-ark/issues/26)) ([84cdb3a](https://github.com/mckinsey/agents-at-scale-ark/commit/84cdb3aa1a8e6c5ce827f893e0f9f07d9d19e85d))
* enable HTTP tool creation from the dashboard ([6d615e0](https://github.com/mckinsey/agents-at-scale-ark/commit/6d615e0ce5ef911a28bacc9f80b94e6e09eae5c8))
* evaluation-metric service ([#29](https://github.com/mckinsey/agents-at-scale-ark/issues/29)) ([f0329f9](https://github.com/mckinsey/agents-at-scale-ark/commit/f0329f96e2918861610383dc2355a683a2e2fee6))
* HTTP post tool ([#5](https://github.com/mckinsey/agents-at-scale-ark/issues/5)) ([1a659e0](https://github.com/mckinsey/agents-at-scale-ark/commit/1a659e0d4802639f423f396e705b941f4581c192))
* implement custom dashboard icons and annotation inheritance ([#14](https://github.com/mckinsey/agents-at-scale-ark/issues/14)) ([8c86a28](https://github.com/mckinsey/agents-at-scale-ark/commit/8c86a28f1b1f6a6c713862f16a1bb240b9a057bf))
* **installer:** make quickstart.sh cross-platform ([#46](https://github.com/mckinsey/agents-at-scale-ark/issues/46)) ([5aa5020](https://github.com/mckinsey/agents-at-scale-ark/commit/5aa50202f0fe3067a79e01ed4f099bab5b40426b))
* integrate evaluation and evaluator management into ARK dashboard ([#32](https://github.com/mckinsey/agents-at-scale-ark/issues/32)) ([1d9e266](https://github.com/mckinsey/agents-at-scale-ark/commit/1d9e266605db89f74491fd3dcfdec99b77522d3a))


### Bug Fixes

* #ARKQB-52 tool caching ([#27](https://github.com/mckinsey/agents-at-scale-ark/issues/27)) ([1892c0e](https://github.com/mckinsey/agents-at-scale-ark/commit/1892c0e80c7ba6596095e5a344999bb52b688bcf))
* add helm chart deployment and fix python package releases ([#13](https://github.com/mckinsey/agents-at-scale-ark/issues/13)) ([576c0c2](https://github.com/mckinsey/agents-at-scale-ark/commit/576c0c23367702abbe66d81a3f70e82ce3476196))
* docs links to repo ([#11](https://github.com/mckinsey/agents-at-scale-ark/issues/11)) ([8b81cf6](https://github.com/mckinsey/agents-at-scale-ark/commit/8b81cf617f360f0f8db770e1c02d9be8b9b41d49))
* **docs:** fix memory and tool doc issues ([#17](https://github.com/mckinsey/agents-at-scale-ark/issues/17)) ([1b1f1c0](https://github.com/mckinsey/agents-at-scale-ark/commit/1b1f1c04b85bab00a6ddded0e2ab0da5db448f81))
* improve CI/CD reliability and container registry configuration ([#3](https://github.com/mckinsey/agents-at-scale-ark/issues/3)) ([b23b4ce](https://github.com/mckinsey/agents-at-scale-ark/commit/b23b4ce32834602470d5cf3413a4b64de1e5fa89))
* include missing evaluations CRD in Helm chart ([#18](https://github.com/mckinsey/agents-at-scale-ark/issues/18)) ([faa0cf5](https://github.com/mckinsey/agents-at-scale-ark/commit/faa0cf5931766a1380c5ba2a459c36d9d7bb95e4))
* **installer:** revert make quickstart.sh cross-platform ([#46](https://github.com/mckinsey/agents-at-scale-ark/issues/46))" ([#57](https://github.com/mckinsey/agents-at-scale-ark/issues/57)) ([80ba1ae](https://github.com/mckinsey/agents-at-scale-ark/commit/80ba1aefcfe0684fd3acd638175846e5bbed0cbc))
* retire mcp tool selection by label [AAS-2613] ([#7](https://github.com/mckinsey/agents-at-scale-ark/issues/7)) ([e415790](https://github.com/mckinsey/agents-at-scale-ark/commit/e415790bea4d33791f0a0271831ce535e58bdd6e))
* use corev1 constants for Kubernetes event types ([#20](https://github.com/mckinsey/agents-at-scale-ark/issues/20)) ([b3c591e](https://github.com/mckinsey/agents-at-scale-ark/commit/b3c591e690aec35cc5b0965e0d785163ad089587))

## [0.1.31](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.30...v0.1.31) (2025-08-28)


### Bug Fixes

* increase chainsaw test assertion timeouts for LLM operations ([#1](https://github.com/mckinsey/agents-at-scale-ark/issues/1)) ([3787db7](https://github.com/mckinsey/agents-at-scale-ark/commit/3787db7517e69f623fca9de8478e3771412ecbc9))

## [0.1.30](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.29...v0.1.30) (2025-08-28)


### Features

* initial ARK codebase with multi-arch build pipeline and conventional commits ([b9f8528](https://github.com/mckinsey/agents-at-scale-ark/commit/b9f8528ab1631a12dc691d713b257a5bce2998db))
