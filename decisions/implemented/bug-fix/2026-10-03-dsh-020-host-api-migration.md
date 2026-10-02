# Decision: 0.2.0 宿主 API 迁移——任务终态事件流、agent/created、按会话 id 列任务

Status: implemented

## Problem

DSH 0.2.0-rc.2 撤掉了 whale-girl 依赖的宿主面，插件在 web 组合里加载即失败：启动日志
`dsh: warning: 1 entry did not activate` + `TypeError: ctx.jobs.onJobDone is not a function`
（[lib/index.mjs](../../../lib/index.mjs) 的 apply 抛错，路由、SSE、记账全不注册，宠物不挂载）。
四处不一致：

- `ctx.jobs.onJobDone` 不存在——0.2.0 的 registry 只暴露事件流 `ctx.jobs.events.subscribe`。
- `agent/session-start` 事件不存在——会话建立改发 `agent/created`（`payload.source` 词表不变）。
- `jobs.list(caller)` 的 caller 是会话 id（判定为 `job.owner.id === caller`）——传 Agent 对象只命中 unowned 任务，
  working 派生看不到任何会话任务。
- client `inject` 声明的 `settingsScope` 服务不存在——cordis 注入是激活门槛，client half 因而不挂载（宠物不渲染）。

## Decision

- **任务终态**改用 `ctx.jobs.events.subscribe({ owners: 'all' }, …)`，只处理 `type === 'settled'`
  （`registered`/`progress`/`stopping`/`removed`/`output` 不记账）；`event.job` 投影（status/label）即记账输入。
  `owners: 'all'`：进程内单 registry，宠物是 profile 级消费者，需覆盖全部会话（同 `dsh-api-job-controller` 的名单口径）；
  `settled` 每次终态恰一次，killed 仍中性。
- **会话事件**改订 `agent/created`；`payload.source` 判据（startup 新会话 / 其余续接）与 XP 分配不变。
- **任务列举**改 `jobs.list(agent.id)`：逐个 agent 传会话 id，绕过单次调用的 owner fence，语义仍是
  「owned + unowned 按 id 去重」。
- **client inject** 缩为 `['slots', 'locale']`；`settingsScope` 改在 apply 内按服务在场守卫
  （缺席仅「无卡片」，宠物本体照常跑）。
- **设置面板卡片在本宿主上不注册**：宿主同时撤掉了 `settings.plugin.item` 槽与 `settingsScope` 传输，
  且 `ctx.settings` 改为无 `register` 的面（`<dshHome>/settings.yaml` 路径随之移除）。卡片源码与
  `tests/settings-form.test.mjs` 保留待接入新设置面；配置在接入前回退 [lib/src/config.mjs](../../../lib/src/config.mjs) 的 DEFAULTS。

## 取代检查

部分取代 [../feature/2026-08-08-session-count-semantics.md](../feature/2026-08-08-session-count-semantics.md)
（其 Decision 以旧事件名写宿主契约）与 [../feature/2026-08-31-settings-panel-card.md](../feature/2026-08-31-settings-panel-card.md)
（其 Decision 以 settingsScope/settings.plugin.item 写卡片接入面）；两条记录保持活跃并已互链。
账本、情绪窗口、持久化格式与门禁清单不受本记录影响。

## Alternatives considered

**A：为 `ctx.jobs.onJobDone` 加兼容垫片（存在性分支）。** 宿主没有可回落的旧面——0.2.0 的 registry 只有事件流，
垫片等于把新契约复述一遍再包旧名，两份契约并存反而更易漂移。落败。

**B：保留 `settingsScope` 注入、靠 apply 内 try/catch 兜底。** cordis 注入是激活门槛，服务缺席时 apply
根本不被调用，try/catch 无从生效，宠物不挂载。落败。

**C：本轮把设置卡片迁到宿主新设置面（Node half 声明 schemastery Config + 官方自动生成页）。** 那是新增能力与新的
跨 half 契约（命名空间从设置命名空间改为 profile 条目 id，写面改为官方 `describe`/`mutate`），超出兼容修复的范围。落败（另行提案）。

## Consequences

- 记账链路恢复设计语义：任务终态入账（完成/失败/killed 中性）、会话 XP 与 welcome、working 派生、SSE 即时广播。
- 配置写入面缺席：卡片不出现、`settings.yaml` 不再被读取，体验层参数取 DEFAULTS；接入新设置面前
  「用户在 GUI 内可调」这一条不成立。
- 宿主事件名与 jobs 契约是跨版本依赖：升级宿主须重跑 `node scripts/gates/run.mjs`，并在 web 重启后确认日志无
  `did not activate`。
- 生成物 [lib/client.js](../../../lib/client.js) 由 [scripts/build-client.mjs](../../../scripts/build-client.mjs) 重新生成（`--check` 守护）。
