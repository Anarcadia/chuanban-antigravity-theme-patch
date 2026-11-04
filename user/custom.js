/**
 * user/custom.js — 用户与执行端 Agent 专属前端脚本钩子
 * 说明：
 * 1. 本文件在 core/runtime.js 执行完毕后，在独立 try/catch 沙箱中自动执行（顶层窗口作用域）。
 * 2. 可通过入参 `ctx`（或全局变量 `window.__AG_PATCH_CTX__`）访问：
 *    - ctx.version: 当前注入补丁版本签名
 *    - ctx.preset: 当前默认预设名
 *    - ctx.dict: 无原型汉化词典对象
 *    - ctx.syncPreset(): 手动触发预设同步
 *    - ctx.ensureMetricsPill(true): 手动触发指标胶囊重排
 * 3. 修改保存后 2.5 秒内自动热生效；升级 core/ 内核时永不覆盖本文件。
 */
