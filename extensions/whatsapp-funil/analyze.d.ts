// Tipos só para o teste (src/lib/domain/whatsapp-analyze.test.ts).
type Msg = { out: boolean; kind: string; text: string }
type Step = { index: number; kind: string; text: string }
export declare const OOSAnalyze: {
  similarity(a: string, b: string): number
  analyzeConversation(msgs: Msg[], steps: Step[], serverStep: number): { sent: number[]; positions: Record<number, number>; nextIndex: number; replied: boolean; lastSent: number; lastIncomingText: string }
  timeFromPrePlain(attr: string): string
}
