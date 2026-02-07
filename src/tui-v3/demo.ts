/**
 * TUI v3 Demo - 演示 TUI 基本功能
 * 运行: bun run src/tui-v3/demo.ts
 */

import { SanBotTUI } from "./index";

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const tui = new SanBotTUI({
    sessionId: "demo-12345678",
    model: "claude-3-5-sonnet",
    memoryEnabled: true,
    toolCount: 11,
  });

  // 设置提交回调
  tui.onSubmit(async (text) => {
    // 添加用户消息
    tui.addUserMessage(text);

    // 模拟工具调用
    if (text.includes("search") || text.includes("搜索")) {
      const toolId = `tool_${Date.now()}`;
      tui.addToolCall({
        id: toolId,
        name: "web_search",
        status: "running",
        input: { query: text },
      });

      await sleep(1500);

      tui.updateToolCall(toolId, {
        status: "success",
        duration: 1500,
      });
    }

    // 模拟流式响应
    tui.startAssistantMessage();
    tui.setStatus("Thinking...");

    const response = `这是对你消息 "${text}" 的回复。\n\n我是 SanBot，一个自主超级助手。我可以帮你执行各种任务，包括搜索网络、分析数据、编写代码等。\n\n如果你需要帮助，随时告诉我！`;

    for (const char of response) {
      tui.appendAssistantMessage(char);
      await sleep(20);
    }

    tui.endAssistantMessage();
    tui.setStatus("Ready. Type your message and press Ctrl+Enter to submit.");
  });

  // 启动 TUI
  tui.start();
}

main().catch(console.error);
