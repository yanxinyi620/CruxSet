import type { ReadyEnv, Row } from './common.js'

const messages = {
  LAB_IMAGE_QUOTA: '最多保留 10 张图片，请删除旧图片及关联资源后再上传。',
  LAB_TASK_QUOTA: '最多保留 20 个分割任务，请删除旧任务后再提交。',
  LAB_DAILY_QUOTA: '今日分割任务已达 20 次，删除任务不会退回次数，请在北京时间零点后再试。',
  LAB_WALL_QUOTA: '最多公开 10 面墙，请到“我的墙面”删除旧墙面后再发布。',
} as const

export function quotaError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const code = (Object.keys(messages) as (keyof typeof messages)[]).find(code => message.includes(code))
  return code ? { code, message: messages[code] } : null
}

export async function labUsage(env: ReadyEnv, user: Row) {
  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const used = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM lab_experiments WHERE owner_id=? AND deleted_at IS NULL) AS images,
    (SELECT COUNT(*) FROM lab_tasks WHERE owner_id=? AND deleted_at IS NULL) AS tasks,
    COALESCE((SELECT task_count FROM lab_daily_usage WHERE owner_id=? AND day=?),0) AS dailyTasks,
    (SELECT COUNT(*) FROM walls WHERE owner_id=? AND published=1 AND visibility='public') AS publicWalls`)
    .bind(user.id,user.id,user.id,day,user.id).first()
  return { used, limits: user.role === 'admin' ? null : { images:10,tasks:20,dailyTasks:20,publicWalls:10 }, day, timeZone:'Asia/Shanghai' }
}
