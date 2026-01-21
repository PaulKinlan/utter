/**
 * Type declarations for custom globals and web APIs used in the Utter extension
 */

// Custom window properties used for state management across content scripts
interface Window {
  __utterActive?: boolean;
  __utterTargetElement?: Element | null;
  __utterSessionText?: string;
  __utterMessageListener?: (event: MessageEvent) => void;
  __utterRecognitionFrame?: HTMLIFrameElement | null;
  __utterLastInsertionInfo?: {
    element: Element;
    startPos?: number;
    length?: number;
    text: string;
    isContentEditable: boolean;
  } | null;
  __utterLastTranscription?: string;

  // Web Speech API (webkit prefixed)
  webkitSpeechRecognition?: typeof SpeechRecognition;
  webkitAudioContext?: typeof AudioContext;
}

// Chrome Prompt API (LanguageModel) - experimental API
declare const LanguageModel: {
  availability(): Promise<'available' | 'downloading' | 'unavailable'>;
  params(): Promise<{
    defaultTopK: number;
    maxTopK: number;
    defaultTemperature: number;
    maxTemperature: number;
  }>;
  create(options?: {
    temperature?: number;
    topK?: number;
    initialPrompts?: Array<{ role: string; content: string }>;
    signal?: AbortSignal;
  }): Promise<LanguageModelSession>;
};

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): ReadableStream<string>;
  append(messages: Array<{ role: string; content: string }>): Promise<void>;
  clone(): Promise<LanguageModelSession>;
  measureInputUsage(input: string): Promise<number>;
  destroy(): void;
  inputUsage: number;
  inputQuota: number;
}
