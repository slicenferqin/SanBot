import { colors } from './colors.js';

/**
 * 错误类型
 */
export enum ErrorType {
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTH_ERROR = 'AUTH_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TOOL_ERROR = 'TOOL_ERROR',
  USER_ERROR = 'USER_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 错误信息接口
 */
export interface ErrorInfo {
  type: ErrorType;
  message: string;
  details?: string;
  suggestions?: string[];
}

/**
 * 错误处理器
 */
export class ErrorHandler {
  /**
   * 格式化错误信息
   */
  format(error: Error | ErrorInfo): string {
    const errorInfo = this.parseError(error);
    const lines: string[] = [];

    // 错误标题
    lines.push('');
    lines.push(colors.error('❌ Error: ') + colors.bold(errorInfo.message));
    lines.push('');

    // 错误详情
    if (errorInfo.details) {
      lines.push(colors.system('   Details: ') + errorInfo.details);
      lines.push('');
    }

    // 解决建议
    if (errorInfo.suggestions && errorInfo.suggestions.length > 0) {
      lines.push(colors.warning('   Possible solutions:'));
      errorInfo.suggestions.forEach(suggestion => {
        lines.push(colors.system('   • ') + suggestion);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 解析错误
   */
  private parseError(error: Error | ErrorInfo): ErrorInfo {
    if ('type' in error) {
      return error as ErrorInfo;
    }

    // 从 Error 对象推断错误类型
    const message = error.message;
    const type = this.inferErrorType(message);
    const suggestions = this.getSuggestions(type, message);

    return {
      type,
      message: this.cleanErrorMessage(message),
      details: error.stack?.split('\n')[1]?.trim(),
      suggestions,
    };
  }

  /**
   * 推断错误类型
   */
  private inferErrorType(message: string): ErrorType {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
      return ErrorType.RATE_LIMIT;
    }
    if (lowerMessage.includes('auth') || lowerMessage.includes('401') || lowerMessage.includes('403')) {
      return ErrorType.AUTH_ERROR;
    }
    if (lowerMessage.includes('network') || lowerMessage.includes('econnrefused') || lowerMessage.includes('timeout')) {
      return ErrorType.NETWORK_ERROR;
    }
    if (lowerMessage.includes('api') || lowerMessage.includes('400') || lowerMessage.includes('500')) {
      return ErrorType.API_ERROR;
    }
    if (lowerMessage.includes('tool') || lowerMessage.includes('function')) {
      return ErrorType.TOOL_ERROR;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * 获取解决建议
   */
  private getSuggestions(type: ErrorType, message: string): string[] {
    switch (type) {
      case ErrorType.RATE_LIMIT:
        return [
          'Wait a moment and try again',
          'Check your API quota in the provider dashboard',
          'Consider upgrading your API plan',
        ];

      case ErrorType.AUTH_ERROR:
        return [
          'Check your API key is correct',
          'Verify the API key has not expired',
          'Ensure the API key has the required permissions',
          'Set the API key in environment variables or config',
        ];

      case ErrorType.NETWORK_ERROR:
        return [
          'Check your internet connection',
          'Verify the API endpoint is accessible',
          'Try again in a few moments',
          'Check if there are any firewall or proxy issues',
        ];

      case ErrorType.API_ERROR:
        return [
          'Check the API documentation for correct usage',
          'Verify your request parameters',
          'Try a different model or provider',
        ];

      case ErrorType.TOOL_ERROR:
        return [
          'Check the tool parameters are correct',
          'Verify the tool has the required permissions',
          'Check the tool documentation',
        ];

      case ErrorType.USER_ERROR:
        return [
          'Check your input format',
          'Refer to the help documentation',
          'Try rephrasing your request',
        ];

      default:
        return [
          'Check the error details above',
          'Try running the command again',
          'Report this issue if it persists',
        ];
    }
  }

  /**
   * 清理错误消息
   */
  private cleanErrorMessage(message: string): string {
    // 移除堆栈跟踪
    const lines = message.split('\n');
    return lines[0] ?? message;
  }

  /**
   * 创建错误信息
   */
  static create(type: ErrorType, message: string, details?: string, suggestions?: string[]): ErrorInfo {
    return { type, message, details, suggestions };
  }
}

// 导出单例
export const errorHandler = new ErrorHandler();
