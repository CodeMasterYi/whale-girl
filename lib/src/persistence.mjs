// 宠物账本持久化：归一化、序列化与下限合并（纯函数；文件 IO 在宿主 index.mjs）。
// 契约：normalizeState(saved) 合并 INITIAL_STATE 并对数值/数组/称号做字段级容错
// （容忍手改/旧版本越界与不一致），缺失/非法返回 null（宿主回退初始态）；
// serializeState 输出 JSON 文本；pickHigherLedger(saved, floor) 取 xp 较大者
// （下限只抬不压，两侧均为 null 时返回 null）。
import { INITIAL_STATE, levelFor, MEMORY_MAX, TITLES } from './pet-state.mjs'

const KNOWN_TITLES = new Set(TITLES.map((t) => t.id))

/** 手改/损坏文件的安全 xp 上限（1e12 远超现实积累；配合 levelFor 闭式解防挂起）。 */
export const XP_CAP = 1e12

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN
}

function int(v, lo = 0) {
  const n = num(v)
  return Number.isFinite(n) ? Math.max(lo, Math.floor(n)) : lo
}

/** 归一化保存的状态；非法输入返回 null。 */
export function normalizeState(saved) {
  if (typeof saved !== 'object' || saved === null) return null
  const xpRaw = num(saved.xp)
  if (!Number.isFinite(xpRaw)) return null
  // 手改/损坏文件的安全上限（1e12 远超现实积累）与整数取整。
  const xp = Math.max(0, Math.floor(Math.min(xpRaw, XP_CAP)))
  // stats 走 INITIAL_STATE 合并：未来新增字段时旧文件不静默丢失。
  const stats = {
    ...INITIAL_STATE.stats,
    tasksDone: int(saved.stats?.tasksDone),
    failures: int(saved.stats?.failures),
    sessions: int(saved.stats?.sessions),
    activeMs: num(saved.stats?.activeMs) > 0 ? saved.stats.activeMs : 0,
    firstSeenAt: num(saved.stats?.firstSeenAt) || null,
  }
  const titles = [...new Set(Array.isArray(saved.titles)
    ? saved.titles.filter((t) => typeof t === 'string' && KNOWN_TITLES.has(t))
    : [])]
  const memory = Array.isArray(saved.memory)
    ? saved.memory.filter((m) => typeof m === 'string').slice(-MEMORY_MAX)
    : []
  const updatedAt = num(saved.updatedAt)
  // level 是 xp 的派生值：以 xp 为准重算，杜绝手改不一致。
  return {
    ...INITIAL_STATE,
    xp,
    level: levelFor(xp),
    stats,
    titles,
    memory,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  }
}

/** 序列化状态为 JSON 文本。 */
export function serializeState(state) {
  return JSON.stringify(state)
}

/**
 * 在已归一化的账本与下限之间取 xp 较大者。
 * 下限用于恢复/迁移存档：加载期合并是唯一能赢过内存态的时机（退出落盘会用内存值覆盖文件）。
 * @param {object|null} saved 归一化后的 state.json 账本；缺失/损坏为 null
 * @param {object|null} floor 归一化后的下限账本；未配置为 null
 * @returns {object|null} 生效账本；两侧都缺失为 null（宿主回退初始态）
 */
export function pickHigherLedger(saved, floor) {
  if (floor === null) return saved
  if (saved === null) return floor
  return floor.xp > saved.xp ? floor : saved
}
