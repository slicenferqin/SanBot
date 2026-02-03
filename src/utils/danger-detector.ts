/**
 * 危险命令检测器
 * 识别可能造成破坏性影响的命令
 */

export type DangerLevel = 'safe' | 'warning' | 'danger' | 'critical';

export interface DangerAnalysis {
  level: DangerLevel;
  reasons: string[];
  suggestion?: string;
}

/**
 * 危险命令模式定义
 */
const DANGER_PATTERNS: Array<{
  pattern: RegExp;
  level: DangerLevel;
  reason: string;
}> = [
  // Critical - 可能导致系统不可恢复
  { pattern: /rm\s+(-[rf]+\s+)*[\/~](\s|$)/, level: 'critical', reason: '删除根目录或用户目录' },
  { pattern: /rm\s+-rf?\s+\*/, level: 'critical', reason: '递归删除当前目录所有文件' },
  { pattern: /mkfs/, level: 'critical', reason: '格式化文件系统' },
  { pattern: /dd\s+.*of=\/dev\//, level: 'critical', reason: '直接写入设备' },
  { pattern: /:(){ :|:& };:/, level: 'critical', reason: 'Fork bomb' },
  { pattern: />\s*\/dev\/sd[a-z]/, level: 'critical', reason: '覆盖磁盘设备' },

  // Danger - 可能导致数据丢失
  { pattern: /rm\s+-rf?\s+/, level: 'danger', reason: '递归删除文件' },
  { pattern: /rm\s+.*\*/, level: 'danger', reason: '批量删除文件' },
  { pattern: />\s*[^|]/, level: 'warning', reason: '覆盖文件内容' },
  { pattern: /truncate/, level: 'danger', reason: '截断文件' },
  { pattern: /shred/, level: 'danger', reason: '安全删除文件' },
  { pattern: /chmod\s+777/, level: 'danger', reason: '设置过于宽松的权限' },
  { pattern: /chmod\s+-R/, level: 'warning', reason: '递归修改权限' },
  { pattern: /chown\s+-R/, level: 'warning', reason: '递归修改所有者' },

  // Warning - 需要注意的操作
  { pattern: /curl\s+.*\|\s*(ba)?sh/, level: 'danger', reason: '从网络下载并执行脚本' },
  { pattern: /wget\s+.*\|\s*(ba)?sh/, level: 'danger', reason: '从网络下载并执行脚本' },
  { pattern: /curl\s+/, level: 'warning', reason: '网络请求' },
  { pattern: /wget\s+/, level: 'warning', reason: '网络请求' },
  { pattern: /ssh\s+/, level: 'warning', reason: 'SSH 连接' },
  { pattern: /scp\s+/, level: 'warning', reason: 'SCP 文件传输' },
  { pattern: /rsync\s+/, level: 'warning', reason: 'rsync 同步' },
  { pattern: /git\s+push/, level: 'warning', reason: 'Git 推送' },
  { pattern: /git\s+reset\s+--hard/, level: 'danger', reason: 'Git 硬重置' },
  { pattern: /git\s+clean\s+-fd/, level: 'danger', reason: 'Git 清理未跟踪文件' },
  { pattern: /npm\s+publish/, level: 'warning', reason: 'NPM 发布' },
  { pattern: /docker\s+rm/, level: 'warning', reason: '删除 Docker 容器' },
  { pattern: /docker\s+rmi/, level: 'warning', reason: '删除 Docker 镜像' },
  { pattern: /kill\s+-9/, level: 'warning', reason: '强制终止进程' },
  { pattern: /pkill/, level: 'warning', reason: '批量终止进程' },
  { pattern: /killall/, level: 'warning', reason: '批量终止进程' },
  { pattern: /sudo\s+/, level: 'warning', reason: '使用 sudo 提权' },
  { pattern: /su\s+/, level: 'warning', reason: '切换用户' },
  { pattern: /mv\s+.*\/dev\/null/, level: 'danger', reason: '移动到 /dev/null' },
  { pattern: />\s*\/dev\/null\s*2>&1/, level: 'safe', reason: '重定向输出到 null（安全）' },

  // 数据库操作
  { pattern: /DROP\s+(DATABASE|TABLE)/i, level: 'critical', reason: '删除数据库/表' },
  { pattern: /DELETE\s+FROM/i, level: 'danger', reason: '删除数据库记录' },
  { pattern: /TRUNCATE/i, level: 'danger', reason: '清空数据库表' },
];

/**
 * 分析命令的危险等级
 */
export function analyzeDanger(command: string): DangerAnalysis {
  const reasons: string[] = [];
  let maxLevel: DangerLevel = 'safe';

  const levelPriority: Record<DangerLevel, number> = {
    safe: 0,
    warning: 1,
    danger: 2,
    critical: 3,
  };

  for (const { pattern, level, reason } of DANGER_PATTERNS) {
    if (pattern.test(command)) {
      reasons.push(reason);
      if (levelPriority[level] > levelPriority[maxLevel]) {
        maxLevel = level;
      }
    }
  }

  // 生成建议
  let suggestion: string | undefined;
  if (maxLevel === 'critical') {
    suggestion = '此命令可能导致不可恢复的损失，强烈建议不要执行';
  } else if (maxLevel === 'danger') {
    suggestion = '此命令可能导致数据丢失，请确认后再执行';
  } else if (maxLevel === 'warning') {
    suggestion = '此命令需要注意，建议确认后执行';
  }

  return { level: maxLevel, reasons, suggestion };
}

/**
 * 判断是否需要用户确认
 */
export function requiresConfirmation(analysis: DangerAnalysis): boolean {
  return analysis.level === 'warning' || analysis.level === 'danger' || analysis.level === 'critical';
}

/**
 * 获取危险等级的显示颜色
 */
export function getDangerColor(level: DangerLevel): string {
  switch (level) {
    case 'critical': return '\x1b[41m\x1b[37m'; // 红底白字
    case 'danger': return '\x1b[31m';           // 红色
    case 'warning': return '\x1b[33m';          // 黄色
    default: return '\x1b[32m';                 // 绿色
  }
}

/**
 * 格式化危险分析结果
 */
export function formatDangerAnalysis(command: string, analysis: DangerAnalysis): string {
  const color = getDangerColor(analysis.level);
  const reset = '\x1b[0m';

  let output = `\n${color}[${analysis.level.toUpperCase()}]${reset} 检测到潜在危险操作\n`;
  output += `命令: ${command}\n`;
  output += `原因:\n`;
  for (const reason of analysis.reasons) {
    output += `  - ${reason}\n`;
  }
  if (analysis.suggestion) {
    output += `建议: ${analysis.suggestion}\n`;
  }

  return output;
}
