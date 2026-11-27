export function elevenLabsVoiceInstruction(characterIds: string[], call = false): string {
    return `【语音表达·ElevenLabs】仅适用于角色ID：${characterIds.join("、")}。
按人设、关系、当前情境决定内容与语气，可自然变化情绪，不强制和解或迎合。
可用 {voice:英文指令} 标注声音（happy、sighs、whispers 等），紧邻台词，每个不超过100字符。
${call ? "通话中在口述正文内标注。" : "只在 [语音条:内容] 内标注，普通文字不加。"}
现场声音按场景酌情使用。只输出消息内容，不输出判断过程。`;
}
