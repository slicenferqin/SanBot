/**
 * Context 模块导出
 */

export { gatherRuntimeContext, formatRuntimeContext } from './engine.ts';
export type { RuntimeContext } from './engine.ts';

export { recordContextEvent, getRecentContextEvents } from './tracker.ts';
export type { ContextEvent } from './tracker.ts';

export {
  ContextCompactor,
  DEFAULT_COMPACTION_CONFIG,
} from './compaction.ts';
export type {
  CompactionConfig,
  CompactionResult,
  ExtractedInfo,
  GenericMessage,
} from './compaction.ts';
