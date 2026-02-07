#!/usr/bin/env bun

/**
 * TUI v3 Demo
 * 测试新的 TUI 系统
 */

import { SanBotTUI } from "./src/tui-v3/index.ts";

async function main() {
  console.log("Starting TUI v3 Demo...");
  console.log("Press Ctrl+C to exit\n");
  
  // 等待 1 秒让用户看到提示
  await new Promise(resolve => setTimeout(resolve, 1000));

  const tui = new SanBotTUI({
    sessionId: `demo-${Date.now()}`,
    model: "claude-sonnet-4-20250514",
    memoryEnabled: true,
    toolCount: 5,
  });

  // 添加一些示例消息
  tui.addUserMessage("Hello SanBot!");
  
  // 模拟流式响应
  tui.startAssistantMessage();
  
  const response = "Hello! I'm SanBot with the new TUI v3. This is a streaming response demonstration.";
  
  for (let i = 0; i < response.length; i++) {
    tui.appendAssistantMessage(response[i]);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  
  tui.endAssistantMessage();

  // 添加工具调用示例
  tui.addToolCall({
    id: "1",
    name: "list_dir",
    status: "running",
  });

  await new Promise(resolve => setTimeout(resolve, 1500));

  tui.updateToolCall("1", {
    status: "success",
    duration: 1500,
  });

  // 再添加一条用户消息
  tui.addUserMessage("What tools do you have?");
  
  tui.startAssistantMessage();
  const response2 = "I have several built-in tools: exec, read_file, write_file, edit_file, and list_dir. I can also create custom tools using Self-Tooling!";
  
  for (let i = 0; i < response2.length; i++) {
    tui.appendAssistantMessage(response2[i]);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  
  tui.endAssistantMessage();

  // 保持运行一段时间
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  tui.stop();
  console.log("\nDemo completed!");
}

main().catch(console.error);
