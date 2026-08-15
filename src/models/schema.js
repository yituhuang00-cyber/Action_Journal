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
 *   problemSolvingEntries: ProblemSolvingEntry[], // 针对当前目标保存的问题解决梳理记录
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * ProblemSolvingEntry:
 * {
 *   id: string,
 *   answers: Array<{ questionId: string, content: string, skipped: boolean }>,
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * LongTermTarget (长期目标):
 * {
 *   id: string,
 *   title: string,
 *   reasons: string[], // 想实现该目标的一个或多个理由
 *   descriptions: string[], // 对目标的具体描述，可为空或包含多个要点
 *   pathways: string[], // 实现目标的一个或多个路径
 *   category: 'conservative' | 'ambitious', // 保守型或进取型
 *   periodStart: string, // 目标周期开始日期（YYYY-MM-DD）
 *   periodEnd: string, // 计划达成日期（YYYY-MM-DD）
 *   position: number, // 同一分类中的优先级顺序，数字越小越重要
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
 *   estimatedHours: number | null, // 预估需要投入的小时数，可为空
 *   status: 'want' | 'doing' | 'done',
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }

 * WeeklyPlan (某一周的计划):
 * {
 *   weekKey: string,
 *   startDate: string,
 *   endDate: string,
 *   conservativeHoursTarget: number, // 保守版周计划目标时长（小时）
 *   ambitiousHoursTarget: number, // 进取版周计划目标时长（小时）
 *   conservativeSubTargetRefs: Array<{ goalId: string, subTargetId: string }>,
 *   ambitiousSubTargetRefs: Array<{ goalId: string, subTargetId: string }>,
 *   subTargetRefs: Array<{ goalId: string, subTargetId: string }>, // 两个版本的合集，兼容旧逻辑
 *   confirmedAt: ISOString
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
 *   motivationalFeelings: MotivationalFeelings, // 自主感、胜任感、意义感、联结感
 *   workExperienceTitle: string, // 工作经验标题
 *   workExperienceHtml: string, // 富文本工作经验记录（HTML）
 *   createdAt: ISOString,
 *   updatedAt: ISOString
 * }
 *
 * MotivationalFeelings:
 * {
 *   autonomy: { content: string, intensity: number | null },
 *   competence: { content: string, intensity: number | null },
 *   meaning: { content: string, intensity: number | null },
 *   connection: { content: string, intensity: number | null }
 * }
 *
 * 存储结构（在 localStorage 中以一个对象保存）
 * {
 *   goals: { [id]: Goal },
 *   longTermTargets: { [id]: LongTermTarget },
 *   actions: { [id]: Action },
 *   exerciseGoals: { [id]: ExerciseGoal },
 *   exerciseActions: { [id]: ExerciseAction },
 *   writingTemplates: { [id]: WritingTemplate },
 *   writingEntries: { [id]: WritingEntry },
 *   dailyFlames: { [date]: MotivationalFeelings }
 *   flameEntries: { [id]: FlameEntry }
 * }
 *
 * FlameEntry:
 * {
 *   id: string,
 *   dimension: 'autonomy' | 'competence' | 'meaning' | 'connection',
 *   content: string,
 *   intensity: number | null,
 *   createdAt: ISOString,
 *   updatedAt: ISOString
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
 *   motivationalFeelings: MotivationalFeelings,
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
      estimatedHours: 2,
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
