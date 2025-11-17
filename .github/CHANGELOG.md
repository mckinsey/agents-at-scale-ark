# Changelog

## [0.1.43](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.42...v0.1.43) (2025-11-13)


### Features

* add A2A arithmetic workflow sample ([#401](https://github.com/mckinsey/agents-at-scale-ark/issues/401)) ([7a89b0c](https://github.com/mckinsey/agents-at-scale-ark/commit/7a89b0c039d88b893a39e32e25eeb9a49ba3e1a1))
* Add sample workflow ([#431](https://github.com/mckinsey/agents-at-scale-ark/issues/431)) ([bdedfa5](https://github.com/mckinsey/agents-at-scale-ark/commit/bdedfa526d3357c2b88f60f61fa7fd1ce282d959))
* added cli command `ark queries delete` ([#419](https://github.com/mckinsey/agents-at-scale-ark/issues/419)) ([488c30d](https://github.com/mckinsey/agents-at-scale-ark/commit/488c30d97bf8cd0b9817a146b19b15188250948b))
* ark cli queries list ([#416](https://github.com/mckinsey/agents-at-scale-ark/issues/416)) ([440254b](https://github.com/mckinsey/agents-at-scale-ark/commit/440254b275b20116baad097ead30ae6838d51298))
* completion streaming output for ark cli query ([#424](https://github.com/mckinsey/agents-at-scale-ark/issues/424)) ([8ecb940](https://github.com/mckinsey/agents-at-scale-ark/commit/8ecb9402a1dc23beaaba89cb25ed5b95a43b2600))
* enable helm chart users to attach custom cacert for controller connections ([#421](https://github.com/mckinsey/agents-at-scale-ark/issues/421)) ([2094d23](https://github.com/mckinsey/agents-at-scale-ark/commit/2094d234aae342a49601041fc130cc09877e360d))
* header overrides ([#311](https://github.com/mckinsey/agents-at-scale-ark/issues/311)) ([e7fba56](https://github.com/mckinsey/agents-at-scale-ark/commit/e7fba567af3ac3b3c15995d74640a88580dbe34d))
* Migrate Marketplace to External Marketplace Repository ([#428](https://github.com/mckinsey/agents-at-scale-ark/issues/428)) ([210da1e](https://github.com/mckinsey/agents-at-scale-ark/commit/210da1e327e81167a5b66293591e1b41797e5032))
* selector with graph [ARKQB-458]  ([#410](https://github.com/mckinsey/agents-at-scale-ark/issues/410)) ([c19c1df](https://github.com/mckinsey/agents-at-scale-ark/commit/c19c1df04fb083b73e9e7f66caaf57f619bf64ec))
* streaming integration - dashboard, error handling, A2A, HTTPRoutes ([#435](https://github.com/mckinsey/agents-at-scale-ark/issues/435)) ([8d4e47a](https://github.com/mckinsey/agents-at-scale-ark/commit/8d4e47a6e11653f24930353a93f552620df23780))
* update marketplace service paths to include 'services/' prefix ([#442](https://github.com/mckinsey/agents-at-scale-ark/issues/442)) ([61066db](https://github.com/mckinsey/agents-at-scale-ark/commit/61066db141a0b305250f339875429326681d420c))


### Bug Fixes

* always install evaluator for evaluated E2E tests ([#417](https://github.com/mckinsey/agents-at-scale-ark/issues/417)) ([60cec9f](https://github.com/mckinsey/agents-at-scale-ark/commit/60cec9f83dbb29935460c6a2d58283989e102bc6))
* Change to xray audit command ([#439](https://github.com/mckinsey/agents-at-scale-ark/issues/439)) ([58700c1](https://github.com/mckinsey/agents-at-scale-ark/commit/58700c1be6d7b407426d5190e0387394c9298248))
* Use public registry for forked prs ([#354](https://github.com/mckinsey/agents-at-scale-ark/issues/354)) ([a601443](https://github.com/mckinsey/agents-at-scale-ark/commit/a601443bd91c430136c2089e32e295452791ee4f))

## [0.1.42](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.41...v0.1.42) (2025-11-06)


### Features

* add delete API and CLI command for queries and sessions ([#281](https://github.com/mckinsey/agents-at-scale-ark/issues/281)) ([d7ee0b9](https://github.com/mckinsey/agents-at-scale-ark/commit/d7ee0b92285acb821606f600d4f6dc67e2e05277))
* add queries get command with [@latest](https://github.com/latest) support ([#402](https://github.com/mckinsey/agents-at-scale-ark/issues/402)) ([3a050b4](https://github.com/mckinsey/agents-at-scale-ark/commit/3a050b48fdc5f56bb195bb42611b747d92566f51))
* Alternative to PyJWT in the event of cve-2025-45768 ([#388](https://github.com/mckinsey/agents-at-scale-ark/issues/388)) ([06593c6](https://github.com/mckinsey/agents-at-scale-ark/commit/06593c6040127647f72c4f37f60a6b34c09f45bf))
* argo workflows minio plugin ([#399](https://github.com/mckinsey/agents-at-scale-ark/issues/399)) ([95cc907](https://github.com/mckinsey/agents-at-scale-ark/commit/95cc907f87e1da962b3d5bd24874f8c3abaa62eb))
* ark cli evaluations ([#370](https://github.com/mckinsey/agents-at-scale-ark/issues/370)) ([36b3610](https://github.com/mckinsey/agents-at-scale-ark/commit/36b36100093d18d9e7e15d38c1416ae26edf627f))
* move observability services to marketplace ([#390](https://github.com/mckinsey/agents-at-scale-ark/issues/390)) ([2900630](https://github.com/mckinsey/agents-at-scale-ark/commit/29006308543787a5baa2edbe83f4aac21c96f0cd))
* support aws bedrock models on ark cli `ark create model` command ([#408](https://github.com/mckinsey/agents-at-scale-ark/issues/408)) ([731a402](https://github.com/mckinsey/agents-at-scale-ark/commit/731a4024677e904f018a51da11e022fbef6486c7))


### Bug Fixes

* Add retry to e2e standard & evaluated ([#396](https://github.com/mckinsey/agents-at-scale-ark/issues/396)) ([930b988](https://github.com/mckinsey/agents-at-scale-ark/commit/930b9881d8e264433504e0759dc4d588359ac837))
* enable a2a query timeout configuration ([#326](https://github.com/mckinsey/agents-at-scale-ark/issues/326)) ([616451b](https://github.com/mckinsey/agents-at-scale-ark/commit/616451bf348d2d32de8d929804ca6d60187d445e))
* sse support for golang mcp client ([#385](https://github.com/mckinsey/agents-at-scale-ark/issues/385)) ([5d93c8b](https://github.com/mckinsey/agents-at-scale-ark/commit/5d93c8b2dc31e027978ee0840543fc84e495c564))
* sse transport test failing on ci ([#404](https://github.com/mckinsey/agents-at-scale-ark/issues/404)) ([670435d](https://github.com/mckinsey/agents-at-scale-ark/commit/670435d45cca68c592d81c86679eaff792d582fa))
* **tests:** deterministic query token usage ([#386](https://github.com/mckinsey/agents-at-scale-ark/issues/386)) ([85f510c](https://github.com/mckinsey/agents-at-scale-ark/commit/85f510c288e0e55b85f11c199acc20f1dd62c9f2))
* update repository reference in code and docs ([#411](https://github.com/mckinsey/agents-at-scale-ark/issues/411)) ([b067261](https://github.com/mckinsey/agents-at-scale-ark/commit/b067261a42e6dcdbba4434c80bd5af348c902cf2))

## [0.1.41](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.40...v0.1.41) (2025-10-30)


### Features

* add inline descriptions to target selectors in ark chat ([#367](https://github.com/mckinsey/agents-at-scale-ark/issues/367)) ([d227fd1](https://github.com/mckinsey/agents-at-scale-ark/commit/d227fd19d09d5a6afbfd61bbb578a7450a1c5291))
* stateful filesystem mcp ([#249](https://github.com/mckinsey/agents-at-scale-ark/issues/249)) ([ffcfe6d](https://github.com/mckinsey/agents-at-scale-ark/commit/ffcfe6dd45174af8125af6e517c2beaada644dd0))
* **workflows:** argo workflow chart, basic docs, fanout sample ([#375](https://github.com/mckinsey/agents-at-scale-ark/issues/375)) ([672f86a](https://github.com/mckinsey/agents-at-scale-ark/commit/672f86aabe416cd646089b38ea938cf0b770a227))


### Bug Fixes

* add openinference standard input and output at query root span level ([#368](https://github.com/mckinsey/agents-at-scale-ark/issues/368)) ([efb6965](https://github.com/mckinsey/agents-at-scale-ark/commit/efb696568308be8ac3f0487e1e5eb5b158e88d61))
* update pyproject.toml version and correct the release please config ([#389](https://github.com/mckinsey/agents-at-scale-ark/issues/389)) ([5718f05](https://github.com/mckinsey/agents-at-scale-ark/commit/5718f05cfc0131e941ff211d4e3ba1d8f61842cd))

## [0.1.40](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.39...v0.1.40) (2025-10-28)


### Features

* abtract otel ([#347](https://github.com/mckinsey/agents-at-scale-ark/issues/347)) ([56fb030](https://github.com/mckinsey/agents-at-scale-ark/commit/56fb0300562a4a7f9e720dbaa8fcb53a780a59b8))
* add empty states ([#292](https://github.com/mckinsey/agents-at-scale-ark/issues/292)) ([fde3fa6](https://github.com/mckinsey/agents-at-scale-ark/commit/fde3fa64ca919479261e1c9228277b778b34d62c))
* add Phoenix Service documentation and HTTPRoute configuration ([#363](https://github.com/mckinsey/agents-at-scale-ark/issues/363)) ([71d03bb](https://github.com/mckinsey/agents-at-scale-ark/commit/71d03bbd572da18071452972d2d48b457307b1fc))
* add query annotations support in completions API and streaming ([#355](https://github.com/mckinsey/agents-at-scale-ark/issues/355)) ([68e85eb](https://github.com/mckinsey/agents-at-scale-ark/commit/68e85eba0e11bc15815087057403afae7693159b))
* adds prettier and enforces stricter linting rules ([#305](https://github.com/mckinsey/agents-at-scale-ark/issues/305)) ([48535f2](https://github.com/mckinsey/agents-at-scale-ark/commit/48535f2a2b16586914e5cd15fd036b4f9058915c))
* Agent with Partial Tools ([#310](https://github.com/mckinsey/agents-at-scale-ark/issues/310)) ([d835524](https://github.com/mckinsey/agents-at-scale-ark/commit/d83552432aa2e05a73e19d1d1f72a21d4d7705bc))
* completed conditions for queries and evaluations ([#325](https://github.com/mckinsey/agents-at-scale-ark/issues/325)) ([2b0d9a7](https://github.com/mckinsey/agents-at-scale-ark/commit/2b0d9a7fab12593e0080186937dfaeecf4393e85))
* hide execution engine field behind an experimental-feature flag ([#303](https://github.com/mckinsey/agents-at-scale-ark/issues/303)) ([ef5f69e](https://github.com/mckinsey/agents-at-scale-ark/commit/ef5f69e4f626f8c6c0539f38deedbfedf5cb4bfa))
* implement exit codes and remove auto-cleanup for queries ([#319](https://github.com/mckinsey/agents-at-scale-ark/issues/319)) ([53b40ae](https://github.com/mckinsey/agents-at-scale-ark/commit/53b40ae1def693091feea255702c22b6ac6e39f0))
* moves model editing to dedicated update page and forms ([#335](https://github.com/mckinsey/agents-at-scale-ark/issues/335)) ([694fb63](https://github.com/mckinsey/agents-at-scale-ark/commit/694fb6380a02aeb41ef9c6abf82085f17e2c373c))
* refines member UI and card styling in team editor ([#330](https://github.com/mckinsey/agents-at-scale-ark/issues/330)) ([070e858](https://github.com/mckinsey/agents-at-scale-ark/commit/070e858420b23653046d426e4359d7ce859bc5e5))
* release ark cli docker image ([#340](https://github.com/mckinsey/agents-at-scale-ark/issues/340)) ([87712d9](https://github.com/mckinsey/agents-at-scale-ark/commit/87712d94060620eb92d63aca994e66e2b16a8fdd))
* simplify query execution wait logic in ark-cli ([#357](https://github.com/mckinsey/agents-at-scale-ark/issues/357)) ([ba71385](https://github.com/mckinsey/agents-at-scale-ark/commit/ba71385b26b5f31a74ff69e35edca3d8ee307586))
* teams agent based selector strategy &lt;- teams model based selector strategy ([#270](https://github.com/mckinsey/agents-at-scale-ark/issues/270)) ([580fb94](https://github.com/mckinsey/agents-at-scale-ark/commit/580fb94282196b8ae7834ab0ff9ff260141ec992))
* update langfuse version to 1.5.7 and remove old package ([#318](https://github.com/mckinsey/agents-at-scale-ark/issues/318)) ([98c747a](https://github.com/mckinsey/agents-at-scale-ark/commit/98c747ad671ce5e2ce295dce84f6ee92b8ab5610))


### Bug Fixes

* a2a synchronous task handling ([#337](https://github.com/mckinsey/agents-at-scale-ark/issues/337)) ([03009d8](https://github.com/mckinsey/agents-at-scale-ark/commit/03009d86748668c67b2e8f0b79f02a553004b5a2))
* **ark-cli:** do not show superfluous error/success content, just the ([1e58c4a](https://github.com/mckinsey/agents-at-scale-ark/commit/1e58c4a9fcdc2021fcde42f864a73b73da1e15cb))
* **ark-cli:** properly show query error ([#343](https://github.com/mckinsey/agents-at-scale-ark/issues/343)) ([1e58c4a](https://github.com/mckinsey/agents-at-scale-ark/commit/1e58c4a9fcdc2021fcde42f864a73b73da1e15cb))
* **ark-controller:** show query error message in conditions.Message ([1e58c4a](https://github.com/mckinsey/agents-at-scale-ark/commit/1e58c4a9fcdc2021fcde42f864a73b73da1e15cb))
* arkqb 361 configurable mcp timeout ([#334](https://github.com/mckinsey/agents-at-scale-ark/issues/334)) ([4667174](https://github.com/mckinsey/agents-at-scale-ark/commit/4667174b21505d9195d36f6fa2c8a36b941e6c0c))
* correct tool calling traces ([#269](https://github.com/mckinsey/agents-at-scale-ark/issues/269)) ([7557555](https://github.com/mckinsey/agents-at-scale-ark/commit/7557555205917e0ae12ed8bf820fa5681ab85ea0))
* regenerate CRD manifests after type changes ([#345](https://github.com/mckinsey/agents-at-scale-ark/issues/345)) ([0532fd4](https://github.com/mckinsey/agents-at-scale-ark/commit/0532fd40d053219ba065d4491b97e62fddb61a66))
* require max turns on graph teams ([#300](https://github.com/mckinsey/agents-at-scale-ark/issues/300)) ([e666260](https://github.com/mckinsey/agents-at-scale-ark/commit/e6662605fe808ce403cd930fe0a1cef31c44dd16))
* stop Queries flipping between `canceled` and `running` phases ([#332](https://github.com/mckinsey/agents-at-scale-ark/issues/332)) ([65685c7](https://github.com/mckinsey/agents-at-scale-ark/commit/65685c78526606c87c41c6229d03fc5bf3ee7126))
* Trailing slash and mcp path update ([#344](https://github.com/mckinsey/agents-at-scale-ark/issues/344)) ([27b647d](https://github.com/mckinsey/agents-at-scale-ark/commit/27b647d64ab34b4ac49e52e869e594a3143889eb))
* Update documentation for debugging Docker Desktop issue ([#351](https://github.com/mckinsey/agents-at-scale-ark/issues/351)) ([37693a6](https://github.com/mckinsey/agents-at-scale-ark/commit/37693a6aef7c6a7d1ec004ca2a5c72df98e8fe10))
* update OpenAPI dependency handling in build configuration ([#297](https://github.com/mckinsey/agents-at-scale-ark/issues/297)) ([8e98316](https://github.com/mckinsey/agents-at-scale-ark/commit/8e98316e2468a38cd3ef3ed0599aecd5fe523c7d))

## [0.1.39](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.38...v0.1.39) (2025-10-16)


### Features

* add missing ark-tenant install to cli ([#321](https://github.com/mckinsey/agents-at-scale-ark/issues/321)) ([a75da2e](https://github.com/mckinsey/agents-at-scale-ark/commit/a75da2ee83c23994b91530a5c547eaa8e10c560e))

## [0.1.38](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.37...v0.1.38) (2025-10-16)


### Features

* add model headers support ([#271](https://github.com/mckinsey/agents-at-scale-ark/issues/271)) ([eb06b03](https://github.com/mckinsey/agents-at-scale-ark/commit/eb06b03cde05a9f54e504e9cd33b2f6be472ac1d))
* Add more devspace config ([#280](https://github.com/mckinsey/agents-at-scale-ark/issues/280)) ([01442d6](https://github.com/mckinsey/agents-at-scale-ark/commit/01442d6b70cb2e77219c9d80a54b63336966531a))
* adds experimental features support with dark mode toggle ([#289](https://github.com/mckinsey/agents-at-scale-ark/issues/289)) ([958f1d8](https://github.com/mckinsey/agents-at-scale-ark/commit/958f1d830a07d99d97ed374a0e63d1361f989e87))
* analyze scripts directory and remove stale migrate.sh script ([#201](https://github.com/mckinsey/agents-at-scale-ark/issues/201)) ([35702f9](https://github.com/mckinsey/agents-at-scale-ark/commit/35702f96932996f68b85d4af5a43fd7c78b8cc3a))
* create builtin tools explicitly as custom resources ([#260](https://github.com/mckinsey/agents-at-scale-ark/issues/260)) ([ec75559](https://github.com/mckinsey/agents-at-scale-ark/commit/ec755590708a45ee9bf43da1caf84434ec392b88))
* init default modelref for agents ([#262](https://github.com/mckinsey/agents-at-scale-ark/issues/262)) ([35b8b33](https://github.com/mckinsey/agents-at-scale-ark/commit/35b8b33b9b34a437e6a5dfbeead3ed5e2f593715))
* Parametrize runner selection for provision and deploy workflows ([#261](https://github.com/mckinsey/agents-at-scale-ark/issues/261)) ([8f78214](https://github.com/mckinsey/agents-at-scale-ark/commit/8f78214c63011f06ef7a54c844ee53c1868a4bfc))
* publish ark-evaluator ([#294](https://github.com/mckinsey/agents-at-scale-ark/issues/294)) ([667f60f](https://github.com/mckinsey/agents-at-scale-ark/commit/667f60fc96fc9ac8ae0d7a3d931fda23018498cc))
* refactors dashboard layout to use unified page header ([#283](https://github.com/mckinsey/agents-at-scale-ark/issues/283)) ([8d24133](https://github.com/mckinsey/agents-at-scale-ark/commit/8d24133480008244dbd801ab5cdb11eb0757910d))
* removes agent type-based selection restrictions ([#275](https://github.com/mckinsey/agents-at-scale-ark/issues/275)) ([8a0f8fe](https://github.com/mckinsey/agents-at-scale-ark/commit/8a0f8fe2bee81c0a1222d85647abac01408bc8cd))
* Service to service auth with token management UI ([#158](https://github.com/mckinsey/agents-at-scale-ark/issues/158)) ([437bf97](https://github.com/mckinsey/agents-at-scale-ark/commit/437bf970157fce1764bbe29fdfe143ccaf8da0ab))
* switches dashboard toast system to Sonner ([#286](https://github.com/mckinsey/agents-at-scale-ark/issues/286)) ([cb1502f](https://github.com/mckinsey/agents-at-scale-ark/commit/cb1502f1e4354cb620d87d7d64a0cf5b9002a31f))
* Updating teams CRD with details on Maxturn ([#189](https://github.com/mckinsey/agents-at-scale-ark/issues/189)) ([fdcb601](https://github.com/mckinsey/agents-at-scale-ark/commit/fdcb601790726c1e06bdb34f62d9ed9b0378fb38))


### Bug Fixes

* a2a docs ([#242](https://github.com/mckinsey/agents-at-scale-ark/issues/242)) ([bd6c5bc](https://github.com/mckinsey/agents-at-scale-ark/commit/bd6c5bcce2082992bfafa2d784d6d2c5050b627e))
* card header title overflowing ([#306](https://github.com/mckinsey/agents-at-scale-ark/issues/306)) ([3a7d698](https://github.com/mckinsey/agents-at-scale-ark/commit/3a7d69840627475be1f3728b6b54f34b1ee08a85))
* clarifies validation messages and adds a note for azure api version ([#284](https://github.com/mckinsey/agents-at-scale-ark/issues/284)) ([4e26cb9](https://github.com/mckinsey/agents-at-scale-ark/commit/4e26cb9dd252b84c41dbb1b3b065e20ca0b4644a))
* correct fark installation command in docs ([#301](https://github.com/mckinsey/agents-at-scale-ark/issues/301)) ([7044bb8](https://github.com/mckinsey/agents-at-scale-ark/commit/7044bb84cebe7ff9949f352089140ce86c4fade5))
* docs for ark status ([#268](https://github.com/mckinsey/agents-at-scale-ark/issues/268)) ([af26c25](https://github.com/mckinsey/agents-at-scale-ark/commit/af26c250c93ecdda4f881d4c36972eedc495cc6a))
* error handling for no model available ([#263](https://github.com/mckinsey/agents-at-scale-ark/issues/263)) ([c08b7be](https://github.com/mckinsey/agents-at-scale-ark/commit/c08b7be2ec9f277a87dd57758396a97c0afe9506))
* Improving provisioning page ([#273](https://github.com/mckinsey/agents-at-scale-ark/issues/273)) ([1af3938](https://github.com/mckinsey/agents-at-scale-ark/commit/1af3938ecc048873e61b9ca8f52233cdc76499a3))
* missing templates when globally installed ([#248](https://github.com/mckinsey/agents-at-scale-ark/issues/248)) ([0d9137c](https://github.com/mckinsey/agents-at-scale-ark/commit/0d9137cce98b157267d3a6e78c0ff313dda343da))
* **models:** probe on initial admission ([#282](https://github.com/mckinsey/agents-at-scale-ark/issues/282)) ([0564c07](https://github.com/mckinsey/agents-at-scale-ark/commit/0564c072bdc8deff8824cda9b91100da40cbfd9c))
* next build ([#290](https://github.com/mckinsey/agents-at-scale-ark/issues/290)) ([bf1e858](https://github.com/mckinsey/agents-at-scale-ark/commit/bf1e858b7ba47eb80e29a81b700dbde1a8037087))
* remove setup.py to prevent imp module error in Python 3.12+ ([#276](https://github.com/mckinsey/agents-at-scale-ark/issues/276)) ([635bcab](https://github.com/mckinsey/agents-at-scale-ark/commit/635bcab51091cd769fabde158978267d94fd9277))
* tool creation from UI ([#256](https://github.com/mckinsey/agents-at-scale-ark/issues/256)) ([c375684](https://github.com/mckinsey/agents-at-scale-ark/commit/c375684f590b0fe01c594a4e2e3262115a1c81f6))
* updating a2a agent card naming ([#246](https://github.com/mckinsey/agents-at-scale-ark/issues/246)) ([48b1252](https://github.com/mckinsey/agents-at-scale-ark/commit/48b1252acb7cb8ab79f8dae84ba070f61271619f))

## [0.1.37](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.36...v0.1.37) (2025-10-09)


### Features

* aas-install and arkrc.yaml overrides ([#221](https://github.com/mckinsey/agents-at-scale-ark/issues/221)) ([9a7dc9a](https://github.com/mckinsey/agents-at-scale-ark/commit/9a7dc9ae147160932364f2668da68e96fb14a2cd))
* Add files for devspace files for localhost gateway and mcp ([#243](https://github.com/mckinsey/agents-at-scale-ark/issues/243)) ([b446168](https://github.com/mckinsey/agents-at-scale-ark/commit/b4461687587ca583d77adf22efd47746babfc309))
* add partial success handling for queries ([#264](https://github.com/mckinsey/agents-at-scale-ark/issues/264)) ([f38be82](https://github.com/mckinsey/agents-at-scale-ark/commit/f38be8244abeb4eac6387aa134fa2273dfea267a))
* add support for MCP server sessions and settings ([#165](https://github.com/mckinsey/agents-at-scale-ark/issues/165)) ([72484bb](https://github.com/mckinsey/agents-at-scale-ark/commit/72484bb55f37bb662b86398eebdddd87e35bb8d9))
* **ark-dashboard:** Add icons for more AI providers ([#228](https://github.com/mckinsey/agents-at-scale-ark/issues/228)) ([4c39d3e](https://github.com/mckinsey/agents-at-scale-ark/commit/4c39d3ecd06f4481e83746526948c4a20bdda2f0))
* devspace improvements ([d026933](https://github.com/mckinsey/agents-at-scale-ark/commit/d0269332ae1685041a1c31d09fe53113ef8dab58))
* homepage create model ([#204](https://github.com/mckinsey/agents-at-scale-ark/issues/204)) ([f824443](https://github.com/mckinsey/agents-at-scale-ark/commit/f824443cdf6383ee1539a69c0a3dad233335f3f9))
* Install cert manager and gateway CRD's ([#226](https://github.com/mckinsey/agents-at-scale-ark/issues/226)) ([d8cc864](https://github.com/mckinsey/agents-at-scale-ark/commit/d8cc86466f9d232d48e60b34841db6f132442b14))
* **queries:** 'messages' query type for structured conversations and multi-model input ([#181](https://github.com/mckinsey/agents-at-scale-ark/issues/181)) ([df0603e](https://github.com/mckinsey/agents-at-scale-ark/commit/df0603e104b100e66bcef1b4e203cc54cc6cf8c2))
* setup simple uv workspace ([#223](https://github.com/mckinsey/agents-at-scale-ark/issues/223)) ([2789c39](https://github.com/mckinsey/agents-at-scale-ark/commit/2789c39bcf31f8c8fb9fff301a6513c308ca18a1))


### Bug Fixes

* add unit test to ci/cd and fix failing tests ([#213](https://github.com/mckinsey/agents-at-scale-ark/issues/213)) ([802a107](https://github.com/mckinsey/agents-at-scale-ark/commit/802a107f9ff77a7f83c12d3eb9e8f81c650ea6af))
* **ark-cli:** fix npmjs readme ([#205](https://github.com/mckinsey/agents-at-scale-ark/issues/205)) ([0b7ff22](https://github.com/mckinsey/agents-at-scale-ark/commit/0b7ff222dcf0b69ee3b96b0fe2ef8ba4941982d5))
* ark-sdk secrets encoding ([#251](https://github.com/mckinsey/agents-at-scale-ark/issues/251)) ([341421b](https://github.com/mckinsey/agents-at-scale-ark/commit/341421b46bd4dd5c5f2c69ed6a2ad0cb9afe11c6))
* Create CRD's first ([#234](https://github.com/mckinsey/agents-at-scale-ark/issues/234)) ([a98e182](https://github.com/mckinsey/agents-at-scale-ark/commit/a98e18287891cfa794d4fdfb5f98896776464236))
* ensures agent editor resets on dialog open state changes ([#265](https://github.com/mckinsey/agents-at-scale-ark/issues/265)) ([0199b8f](https://github.com/mckinsey/agents-at-scale-ark/commit/0199b8f48e5fd5162a03644e34c3a548631c04c4))
* improve error handling in OpenAI chat completions ([#258](https://github.com/mckinsey/agents-at-scale-ark/issues/258)) ([d0eba99](https://github.com/mckinsey/agents-at-scale-ark/commit/d0eba99837fbb2fe89114a50d1d8d9bb9336fca0))
* Improved content view format ([#210](https://github.com/mckinsey/agents-at-scale-ark/issues/210)) ([8efe25a](https://github.com/mckinsey/agents-at-scale-ark/commit/8efe25a986faecd1d6b80af7e5982ecaef5c4715))
* Install ark controller first ([#254](https://github.com/mckinsey/agents-at-scale-ark/issues/254)) ([4f596d0](https://github.com/mckinsey/agents-at-scale-ark/commit/4f596d029bf6a4694bc62b884b5a997c9f7b82de))
* raw message serialization golang structs ([#259](https://github.com/mckinsey/agents-at-scale-ark/issues/259)) ([fb6c6a5](https://github.com/mckinsey/agents-at-scale-ark/commit/fb6c6a5e734feb925fd7c8cbd0de201dedc73c65))
* Revert "feat: Move devspace config into their service directories" ([#208](https://github.com/mckinsey/agents-at-scale-ark/issues/208)) ([dd59279](https://github.com/mckinsey/agents-at-scale-ark/commit/dd59279e4de66ec2efbdaf58658b84dfb91d8108))
* sample a2a agent tags mismatch fix ([#215](https://github.com/mckinsey/agents-at-scale-ark/issues/215)) ([cf17889](https://github.com/mckinsey/agents-at-scale-ark/commit/cf1788916b67260b728a0728c170985f17a8fb53))
* SDK build for ark-api ([#203](https://github.com/mckinsey/agents-at-scale-ark/issues/203)) ([65d7008](https://github.com/mckinsey/agents-at-scale-ark/commit/65d70088b10933285ff02cae2d4ce9b36148af7a))
* skip failing evaluator tests requiring ark-evaluator service ([#230](https://github.com/mckinsey/agents-at-scale-ark/issues/230)) ([739a854](https://github.com/mckinsey/agents-at-scale-ark/commit/739a85468eb9fab3e35e5d9a0d6bfac7e573582e))
* update Azure endpoint configuration to use environment variables ([#233](https://github.com/mckinsey/agents-at-scale-ark/issues/233)) ([fcc42bb](https://github.com/mckinsey/agents-at-scale-ark/commit/fcc42bb2272bde78ff0e44e31a1d79121358e330))

## [0.1.36](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.35...v0.1.36) (2025-09-26)


### Features

* 284 - implement standalone RagasProvider with comprehensive OSS evaluation architecture ([#161](https://github.com/mckinsey/agents-at-scale-ark/issues/161)) ([c4d18ee](https://github.com/mckinsey/agents-at-scale-ark/commit/c4d18eeb46c69c1d638cdd99bcfcd4bceaaf1f8e))
* Add ARK Dashboard homepage with metrics cards ([#190](https://github.com/mckinsey/agents-at-scale-ark/issues/190)) ([acd5a4c](https://github.com/mckinsey/agents-at-scale-ark/commit/acd5a4c1e91cf8aa613d27017749d8be0416da37))
* add streaming support for query execution ([#162](https://github.com/mckinsey/agents-at-scale-ark/issues/162)) ([77f7f7f](https://github.com/mckinsey/agents-at-scale-ark/commit/77f7f7f14ae3101780b74dc8049d7e2c58f5b768))
* replace make quickstart with ark install, improved ark cli, improved install docs ([#188](https://github.com/mckinsey/agents-at-scale-ark/issues/188)) ([e51e296](https://github.com/mckinsey/agents-at-scale-ark/commit/e51e296ab9a71b3f82070b5e2b6e620cced2d728))


### Bug Fixes

* add webhook initialization delay in quickstart ([#196](https://github.com/mckinsey/agents-at-scale-ark/issues/196)) ([3429362](https://github.com/mckinsey/agents-at-scale-ark/commit/34293627c75216dc92c76b6744e565c1fcc2d1c6))
* CI/CD workflow issues ([#182](https://github.com/mckinsey/agents-at-scale-ark/issues/182)) ([f2c01e5](https://github.com/mckinsey/agents-at-scale-ark/commit/f2c01e5e8e90638e62e65e652ccd6c0bd1824eca))
* devspace httproutes missing ([#187](https://github.com/mckinsey/agents-at-scale-ark/issues/187)) ([1860dac](https://github.com/mckinsey/agents-at-scale-ark/commit/1860dacd4d32836f8030ab82df15f165df704e55))
* make namespace parameter optional across all API endpoints ([#191](https://github.com/mckinsey/agents-at-scale-ark/issues/191)) ([9c068c1](https://github.com/mckinsey/agents-at-scale-ark/commit/9c068c1f2ec6f9807aa04a717ab08117553da1a6))
* **models:** improve model probe stability and observability ([#186](https://github.com/mckinsey/agents-at-scale-ark/issues/186)) ([e6e506b](https://github.com/mckinsey/agents-at-scale-ark/commit/e6e506bb694f544cb84c46039872f68ba60fd562))
* New query display bug fix ([#185](https://github.com/mckinsey/agents-at-scale-ark/issues/185)) ([5d5e6f4](https://github.com/mckinsey/agents-at-scale-ark/commit/5d5e6f421178fd83e1e07c3b7e2aebbf2a37c785))

## [0.1.35](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.34...v0.1.35) (2025-09-24)


### Features

* add ark-cluster-memory service for in-memory message storage ([#151](https://github.com/mckinsey/agents-at-scale-ark/issues/151)) ([b5d70bd](https://github.com/mckinsey/agents-at-scale-ark/commit/b5d70bd3cd6486a8159f9445153130f0790ea3e0))
* Added secret management to ark-sdk ([#175](https://github.com/mckinsey/agents-at-scale-ark/issues/175)) ([f8abb19](https://github.com/mckinsey/agents-at-scale-ark/commit/f8abb198fe5b12c33f2f619d2accb3603ae31866))
* Agents can reference Query Parameters ([#140](https://github.com/mckinsey/agents-at-scale-ark/issues/140)) ([33e1a2d](https://github.com/mckinsey/agents-at-scale-ark/commit/33e1a2de0914d713399c232761ae08273b5737b8))
* **charts:** add http gateway and ingress opt-in support ([#179](https://github.com/mckinsey/agents-at-scale-ark/issues/179)) ([cdfb1ed](https://github.com/mckinsey/agents-at-scale-ark/commit/cdfb1edd7f9489841725cd31ef70c98add9e5680))
* model status refresh interval and conditions ([#72](https://github.com/mckinsey/agents-at-scale-ark/issues/72)) ([850a49d](https://github.com/mckinsey/agents-at-scale-ark/commit/850a49d83bd00ee659c9189277ec6646ecd139bd))
* simplified impersonation model, ark tenant chart, deployment improvements ([#139](https://github.com/mckinsey/agents-at-scale-ark/issues/139)) ([0d394b9](https://github.com/mckinsey/agents-at-scale-ark/commit/0d394b988b6c77a1e80a5c4e9ac59d2a015625f3))


### Bug Fixes

* add multi-platform fark binaries to releases and improve installation docs ([#136](https://github.com/mckinsey/agents-at-scale-ark/issues/136)) ([ced0c7a](https://github.com/mckinsey/agents-at-scale-ark/commit/ced0c7a4a5fad3443954469bb4084ae47c703203))
* agent availability conditions ([#157](https://github.com/mckinsey/agents-at-scale-ark/issues/157)) ([209a4a6](https://github.com/mckinsey/agents-at-scale-ark/commit/209a4a62bdfa0e50eb8e94f996566619699626ff))
* enable service account token mounting for ark-mcp ([#169](https://github.com/mckinsey/agents-at-scale-ark/issues/169)) ([b50d838](https://github.com/mckinsey/agents-at-scale-ark/commit/b50d83801851c8089a275271c399bf38cb29baef))
* Fix for round robin strategy in teams ([#135](https://github.com/mckinsey/agents-at-scale-ark/issues/135)) ([3653d92](https://github.com/mckinsey/agents-at-scale-ark/commit/3653d92221d539cb9bac8c33ed0b6cce49bd60b9))
* improve query-parameter-ref test with mock OpenAI server ([#177](https://github.com/mckinsey/agents-at-scale-ark/issues/177)) ([3a43454](https://github.com/mckinsey/agents-at-scale-ark/commit/3a43454bacf2e23bb44dc03f40720739fbaad183))
* status condition not met for model ([#159](https://github.com/mckinsey/agents-at-scale-ark/issues/159)) ([273101a](https://github.com/mckinsey/agents-at-scale-ark/commit/273101a351f41fe7231f06a91b0d4665b3662c3a))
* time stamp in memory logs ([#164](https://github.com/mckinsey/agents-at-scale-ark/issues/164)) ([c06bb37](https://github.com/mckinsey/agents-at-scale-ark/commit/c06bb371fac76e0fb67c9c1cf71c67bda8cfd31b))

## [0.1.34](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.33...v0.1.34) (2025-09-19)


### Features

* add auth layer ark-sdk ([#99](https://github.com/mckinsey/agents-at-scale-ark/issues/99)) ([2c81807](https://github.com/mckinsey/agents-at-scale-ark/commit/2c818077fcb448517f196acef10023bfb20c2e37))
* add native link validation for documentation ([#134](https://github.com/mckinsey/agents-at-scale-ark/issues/134)) ([c530293](https://github.com/mckinsey/agents-at-scale-ark/commit/c53029327d862a5c1664c387101de4133c8c1562))
* ark evaluator with langfuse ([#65](https://github.com/mckinsey/agents-at-scale-ark/issues/65)) ([ecf0d4e](https://github.com/mckinsey/agents-at-scale-ark/commit/ecf0d4ebb27b009743f4086c8c8a3dd003de7b5d))
* AWS and GCP bootstrapping infra and GitHub workflows ([#28](https://github.com/mckinsey/agents-at-scale-ark/issues/28)) ([4de68b3](https://github.com/mckinsey/agents-at-scale-ark/commit/4de68b39eab8310c534248075a26e63e0cf1d35f))
* dashboard fields map yaml fields ([#133](https://github.com/mckinsey/agents-at-scale-ark/issues/133)) ([94baf70](https://github.com/mckinsey/agents-at-scale-ark/commit/94baf70b5ec22fa2cecd9913303c17bc6ce973c5))
* **dashboard:** adds ODIC with 'sso' and 'open' authentication models for dashboard ([60b701d](https://github.com/mckinsey/agents-at-scale-ark/commit/60b701d9a423cbd651468c37e0815ed0c76aeba2))
* **dashboard:** Delete confirmation modal for agent, team and tool ([#90](https://github.com/mckinsey/agents-at-scale-ark/issues/90)) ([9be7f3b](https://github.com/mckinsey/agents-at-scale-ark/commit/9be7f3baf7c0af88e0cf149c19b32eae344a56b8))
* Displaying pre-selected single namespace ([#111](https://github.com/mckinsey/agents-at-scale-ark/issues/111)) ([36aeb14](https://github.com/mckinsey/agents-at-scale-ark/commit/36aeb149c66fe521d86133d06b4bf62684cf3270))
* **docs:** documentation for deploying only ark-controller and fark ([#145](https://github.com/mckinsey/agents-at-scale-ark/issues/145)) ([52cd4af](https://github.com/mckinsey/agents-at-scale-ark/commit/52cd4afdf7ca5da2f3245536389cabaea9e52987))
* enhance evaluator with proper context support ([#116](https://github.com/mckinsey/agents-at-scale-ark/issues/116)) ([d6e865f](https://github.com/mckinsey/agents-at-scale-ark/commit/d6e865fca6a954f5f82f5de48065cbf7eed22136))
* enhance evaluator with proper context support and RAGAS context ([d6e865f](https://github.com/mckinsey/agents-at-scale-ark/commit/d6e865fca6a954f5f82f5de48065cbf7eed22136))
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
* **devspace:** allow ensure-ark-sdk-wheel to run in forks ([#150](https://github.com/mckinsey/agents-at-scale-ark/issues/150)) ([7a0fc5b](https://github.com/mckinsey/agents-at-scale-ark/commit/7a0fc5b4e8ab896c5b6cc81aca36e22b55389868))
* enable external PRs to use fork's container registry ([#114](https://github.com/mckinsey/agents-at-scale-ark/issues/114)) ([feedf72](https://github.com/mckinsey/agents-at-scale-ark/commit/feedf72ab7cbe401a7ba7c27a8950a320be62836))
* Execution time and implement dynamic model pricing for LLM metrics calculations ([#146](https://github.com/mckinsey/agents-at-scale-ark/issues/146)) ([ef72e54](https://github.com/mckinsey/agents-at-scale-ark/commit/ef72e5469404abaa065fc218db24d14b2c6bfdad))
* Fix Namespace and path ([#100](https://github.com/mckinsey/agents-at-scale-ark/issues/100)) ([2fef74e](https://github.com/mckinsey/agents-at-scale-ark/commit/2fef74e5d681057e3b95fd77a069c9639b2ace54))
* helm charts use AppVersion for image tags and deploy workflow supports latest ([#95](https://github.com/mckinsey/agents-at-scale-ark/issues/95)) ([d016cfe](https://github.com/mckinsey/agents-at-scale-ark/commit/d016cfe875498d3a32a3745fc77e12e8f00aa1d7))
* missing QueryClientProvider issue, queries tab ui glitch ([#108](https://github.com/mckinsey/agents-at-scale-ark/issues/108)) ([4ac6e4b](https://github.com/mckinsey/agents-at-scale-ark/commit/4ac6e4be84e442daa77b856635caac0c872d7861))
* quickstart fark and ark-cli installation ([#117](https://github.com/mckinsey/agents-at-scale-ark/issues/117)) ([d6bffd7](https://github.com/mckinsey/agents-at-scale-ark/commit/d6bffd7f3019b01d1c0984bea74135946a97e92a))
* separate registry hostname from full path for docker login ([#120](https://github.com/mckinsey/agents-at-scale-ark/issues/120)) ([7342930](https://github.com/mckinsey/agents-at-scale-ark/commit/73429306c17912b19f60ba675b784bce491d1c83))
* update badge template URL and improve iframe usage for contributors ([#98](https://github.com/mckinsey/agents-at-scale-ark/issues/98)) ([9b61b15](https://github.com/mckinsey/agents-at-scale-ark/commit/9b61b15e1591b420bda5505c294a8c3c7920dc4f))


### Miscellaneous Chores

* force release 0.1.34 ([09e131a](https://github.com/mckinsey/agents-at-scale-ark/commit/09e131a39332b231ad74569faae16a28a4c66d03))
* release 0.1.33 ([13d6113](https://github.com/mckinsey/agents-at-scale-ark/commit/13d61139d3f247fbfd67e43925e3d77a443c41a9))

## [0.1.33](https://github.com/mckinsey/agents-at-scale-ark/compare/v0.1.33...v0.1.33) (2025-09-18)


### Features

* add auth layer ark-sdk ([#99](https://github.com/mckinsey/agents-at-scale-ark/issues/99)) ([2c81807](https://github.com/mckinsey/agents-at-scale-ark/commit/2c818077fcb448517f196acef10023bfb20c2e37))
* ark evaluator with langfuse ([#65](https://github.com/mckinsey/agents-at-scale-ark/issues/65)) ([ecf0d4e](https://github.com/mckinsey/agents-at-scale-ark/commit/ecf0d4ebb27b009743f4086c8c8a3dd003de7b5d))
* AWS and GCP bootstrapping infra and GitHub workflows ([#28](https://github.com/mckinsey/agents-at-scale-ark/issues/28)) ([4de68b3](https://github.com/mckinsey/agents-at-scale-ark/commit/4de68b39eab8310c534248075a26e63e0cf1d35f))
* dashboard fields map yaml fields ([#133](https://github.com/mckinsey/agents-at-scale-ark/issues/133)) ([94baf70](https://github.com/mckinsey/agents-at-scale-ark/commit/94baf70b5ec22fa2cecd9913303c17bc6ce973c5))
* **dashboard:** adds ODIC with 'sso' and 'open' authentication models for dashboard ([60b701d](https://github.com/mckinsey/agents-at-scale-ark/commit/60b701d9a423cbd651468c37e0815ed0c76aeba2))
* **dashboard:** Delete confirmation modal for agent, team and tool ([#90](https://github.com/mckinsey/agents-at-scale-ark/issues/90)) ([9be7f3b](https://github.com/mckinsey/agents-at-scale-ark/commit/9be7f3baf7c0af88e0cf149c19b32eae344a56b8))
* Displaying pre-selected single namespace ([#111](https://github.com/mckinsey/agents-at-scale-ark/issues/111)) ([36aeb14](https://github.com/mckinsey/agents-at-scale-ark/commit/36aeb149c66fe521d86133d06b4bf62684cf3270))
* **docs:** documentation for deploying only ark-controller and fark ([#145](https://github.com/mckinsey/agents-at-scale-ark/issues/145)) ([52cd4af](https://github.com/mckinsey/agents-at-scale-ark/commit/52cd4afdf7ca5da2f3245536389cabaea9e52987))
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
