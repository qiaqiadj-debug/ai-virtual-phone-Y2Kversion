"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportCleanChatHistory, downloadCleanChatJson } from "@/lib/export-clean-chat";

export function CleanChatExportButton() {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await exportCleanChatHistory();
      if (data.length === 0) {
        alert("没有可导出的聊天记录");
        return;
      }
      downloadCleanChatJson(data);
      alert(`已导出 ${data.length} 个会话，共 ${data.reduce((s, c) => s + c.messages.length, 0)} 条消息`);
    } catch (err) {
      console.error(err);
      alert("导出失败，请查看控制台");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 text-white text-sm disabled:opacity-50"
    >
      <Download size={16} />
      {busy ? "导出中…" : "导出干净聊天记录（JSON）"}
    </button>
  );
}
