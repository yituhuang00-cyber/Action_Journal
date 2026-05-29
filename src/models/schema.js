/**
 * 数据模型说明（JavaScript 表示，供存储层与前端使用）
 *
 * Goal (想要努力的事情):
 * {
 *   id: string, // 唯一 id
 *   title: string,
 *   reasons: string[], // 为什么想做这件事
 *   expectedOutcome: string, // 期待的结果/目标/时间
 *   supports: string[], // 在实现过程中可能提供动力与支持的人际联结
 *   factors: [ { name: string, controllability: number } ], // 内外部因素与可控程度评分（0-10）
 *   startDate: string, // 目标开始日期（YYYY-MM-DD）
 *   completedDate: string | null, // 目标完成日期（YYYY-MM-DD），未完成则为 null
 *   subTargets: SubTarget[], // 目标拆分出的子目标
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * SubTarget (目标下的子目标):
 * {
 *   id: string,
 *   startDate: string, // 从什么时候开始做，可为空；格式 YYYY-MM-DD
 *   endDate: string, // 到什么时候结束，可为空；格式 YYYY-MM-DD
 *   content: string, // 子目标内容
 *   status: 'want' | 'doing' | 'done',
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * Action (一次具体行动记录):
 * {
 *   id: string,
 *   goalId: string, // 关联到哪个 Goal
 *   startTime: ISOString | null,
 *   endTime: ISOString | null,
 *   expectedDurationMinutes: number | null, // 本次行动预期持续时长（分钟）
 *   expectedOutcome: string, // 本次行动结束后期待达成的具体目标；行动结束后会自动并入 content
 *   content: string, // 行动内容（包含从预期目标迁移来的内容）
 *   nextAction: string, // 下一步行动
 *   scores: { arousal: number, valence: number }, // 唤醒度(0-10), 效价(-10..10)
 *   feeling: string, // 行动感受（兼容旧 rant/bingo 数据）
 *   rant: string, // 兼容旧字段；归一化后存储合并后的行动感受
 *   bingo: string, // 兼容旧字段；归一化后不再单独呈现
 *   celebration: string, // 设计的庆祝事项
 *   workExperienceTitle: string, // 工作经验标题
 *   workExperienceHtml: string, // 富文本工作经验记录（HTML）
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * 存储结构（在 localStorage 中以一个对象保存）
 * {
 *   goals: { [id]: Goal },
 *   actions: { [id]: Action },
 *   exerciseGoals: { [id]: ExerciseGoal },
 *   exerciseActions: { [id]: ExerciseAction },
 *   writingTemplates: { [id]: WritingTemplate },
 *   writingEntries: { [id]: WritingEntry }
 * }
 */

/**
 * ExerciseGoal:
 * {
 *   id: string,
 *   title: string,
 *   reasons: string[],
 *   supports: string[],
 *   status: 'want' | 'doing' | 'done',
 *   startDate: string,
 *   completedDate: string,
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * ExerciseAction:
 * {
 *   id: string,
 *   goalId: string,
 *   startTime: ISOString | null,
 *   endTime: ISOString | null,
 *   exerciseName: string,
 *   content: string,
 *   scores: { arousal: number, valence: number },
 *   feeling: string, // 运动感受（兼容旧 bingo 数据）
 *   bingo: string, // 兼容旧字段；归一化后不再单独呈现
 *   celebration: string,
 *   workExperienceTitle: string, // 运动经验标题
 *   workExperienceHtml: string, // 富文本运动经验记录（HTML）
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 */

/**
 * WritingTemplate:
 * {
 *   id: string,
 *   title: string, // 模板名称
 *   purpose: string, // 模板意义
 *   sections: Array<{
 *     id: string,
 *     question: string, // 模板问题
 *     prompt: string // 针对问题的提示词
 *   }>,
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * WritingEntry:
 * {
 *   id: string,
 *   templateId: string,
 *   answers: Array<{
 *     sectionId: string,
 *     content: string
 *   }>,
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 */

export const exampleGoal = {
  id: 'g-1',
  title: '示例：学习写作',
  reasons: ['提升表达', '希望写书'],
  expectedOutcome: '6 个月内完成 30 篇短文',
  supports: ['朋友 A', '写作小组'],
  factors: [{ name: '时间', controllability: 6 }],
  // status: one of 'want' (想要做), 'doing' (正在做), 'done' (做完了')
  status: 'want',
  startDate: new Date().toISOString().slice(0, 10),
  completedDate: null,
  subTargets: [
    {
      id: 'st-1',
      startDate: '',
      endDate: '',
      content: '先写一个 200 字提纲',
      status: 'want',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

export const exampleAction = {
  id: 'a-1',
  goalId: 'g-1',
  startTime: new Date().toISOString(),
  endTime: null,
  expectedDurationMinutes: 45,
  expectedOutcome: '完成提纲并写出 300 字初稿',
  content: '写了 300 字草稿，梳理大纲',
  nextAction: '',
  scores: { arousal: 5, valence: 2 },
  feeling: '',
  rant: '',
  bingo: '',
  celebration: '',
  workExperienceTitle: '这次行动的经验标题',
  workExperienceHtml: '<p>记录一次行动中的经验和复盘。</p>',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

export default {}
