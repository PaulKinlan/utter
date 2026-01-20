// Text refinement service using Chrome Prompt API (Gemini Nano)
// API Reference: https://developer.chrome.com/docs/ai/prompt-api
// Uses window.LanguageModel API

/**
 * Preset refinement prompts
 */
export const PRESET_PROMPTS = {
  'remove-filler': {
    id: 'remove-filler',
    name: 'Remove Filler Words',
    description: 'Remove ums, uhs, and other filler words',
    systemPrompt: 'You are a text refinement assistant. Remove filler words like "um", "uh", "like", "you know", "basically", "actually", and similar hesitations from the text. Preserve the original meaning and tone. Return only the cleaned text without any additional commentary.',
  },
  'basic-cleanup': {
    id: 'basic-cleanup',
    name: 'Basic Cleanup',
    description: 'Remove filler words and fix basic grammar',
    systemPrompt: 'You are a text refinement assistant. Clean up the text by removing filler words and fixing basic grammar errors, capitalization, and punctuation. Preserve the original meaning and casual tone. Return only the cleaned text without any additional commentary.',
  },
  'formal': {
    id: 'formal',
    name: 'Make Formal',
    description: 'Rephrase in a professional, formal tone',
    systemPrompt: 'You are a text refinement assistant. Rephrase the text in a professional, formal tone suitable for business communication. Remove filler words, improve grammar, and use appropriate formal language. Return only the refined text without any additional commentary.',
  },
  'friendly': {
    id: 'friendly',
    name: 'Make Friendly',
    description: 'Rephrase in a warm, conversational tone',
    systemPrompt: 'You are a text refinement assistant. Rephrase the text in a warm, friendly, and conversational tone. Remove filler words but keep the casual feel. Make it approachable and personable. Return only the refined text without any additional commentary.',
  },
  'concise': {
    id: 'concise',
    name: 'Make Concise',
    description: 'Shorten while preserving key information',
    systemPrompt: 'You are a text refinement assistant. Make the text more concise and to-the-point while preserving all key information. Remove redundancy and unnecessary words. Return only the refined text without any additional commentary.',
  },
};

/**
 * Check if the Prompt API is available
 * @returns {Promise<{available: boolean, reason?: string, canDownload?: boolean, params?: object}>}
 */
export async function checkAvailability() {
  try {
    if (typeof LanguageModel === 'undefined') {
      return {
        available: false,
        reason: 'Prompt API not supported in this browser',
      };
    }

    const availability = await LanguageModel.availability();

    if (availability === 'available') {
      const params = await LanguageModel.params();
      return { available: true, params };
    } else if (availability === 'downloading') {
      return {
        available: false,
        reason: 'Model is downloading. Please wait and try again.',
        canDownload: true,
      };
    } else {
      return {
        available: false,
        reason: 'Prompt API not available on this device',
      };
    }
  } catch (err) {
    console.error('Error checking Prompt API availability:', err);
    return {
      available: false,
      reason: err.message || 'Unknown error',
    };
  }
}

/**
 * Create a language model session
 * @param {object} options - Session options
 * @param {number} [options.temperature=0.3] - Response randomness (0-1)
 * @param {number} [options.topK=3] - Token diversity filtering
 * @param {Array} [options.initialPrompts] - Prior messages to seed context
 * @param {AbortSignal} [options.signal] - AbortSignal to destroy session
 * @returns {Promise<object>} Language model session
 */
export async function createSession(options = {}) {
  try {
    const session = await LanguageModel.create({
      temperature: options.temperature ?? 0.3, // Lower for more consistent refinement
      topK: options.topK ?? 3,
      ...options,
    });
    return session;
  } catch (err) {
    console.error('Error creating language model session:', err);
    throw err;
  }
}

/**
 * Trigger model download and monitor progress
 * @param {function} onStatusChange - Callback called with status updates
 * @returns {Promise<boolean>} True if model is ready, false if unavailable
 */
export async function ensureModelReady(onStatusChange = null) {
  try {
    if (typeof LanguageModel === 'undefined') {
      onStatusChange?.({ status: 'error', message: 'Prompt API not supported' });
      return false;
    }

    // Check initial availability
    const availability = await LanguageModel.availability();

    if (availability === 'available') {
      onStatusChange?.({ status: 'available', message: 'Ready' });
      return true;
    }

    if (availability === 'unavailable') {
      onStatusChange?.({ status: 'error', message: 'Not available on this device' });
      return false;
    }

    // Status is 'downloading' - trigger download via create() with progress monitor
    // This approach uses the monitor callback to get real download progress
    // instead of polling, which prevents UI blocking
    onStatusChange?.({ status: 'downloading', message: 'Downloading model... 0%' });

    let session = null;
    try {
      session = await LanguageModel.create({
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            if (e.total > 0) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onStatusChange?.({ status: 'downloading', message: `Downloading model... ${percent}%` });
            }
          });
        }
      });

      // If we get here, the model is ready
      onStatusChange?.({ status: 'available', message: 'Ready' });
      return true;
    } catch (createErr) {
      console.error('Error creating session during download:', createErr);
      onStatusChange?.({ status: 'error', message: createErr.message || 'Download failed' });
      return false;
    } finally {
      // Clean up the session we created just for downloading
      if (session) {
        session.destroy();
      }
    }
  } catch (err) {
    console.error('Error ensuring model ready:', err);
    onStatusChange?.({ status: 'error', message: err.message || 'Unknown error' });
    return false;
  }
}

/**
 * Refine text using a preset prompt
 */
export async function refineWithPreset(text, presetId, onProgress = null) {
  const preset = PRESET_PROMPTS[presetId];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }

  return refineText(text, preset.systemPrompt, onProgress);
}

/**
 * Refine text using a custom prompt
 */
export async function refineWithCustomPrompt(text, customPrompt, onProgress = null) {
  const systemPrompt = `You are a text refinement assistant. ${customPrompt}\n\nReturn only the refined text without any additional commentary.`;
  return refineText(text, systemPrompt, onProgress);
}

/**
 * Core refinement function
 */
async function refineText(text, systemPrompt, onProgress = null) {
  let session = null;
  try {
    session = await createSession();

    const fullPrompt = `${systemPrompt}\n\nOriginal text:\n${text}`;

    if (onProgress) {
      // Use streaming for progress updates
      const stream = session.promptStreaming(fullPrompt);
      let result = '';

      for await (const chunk of stream) {
        result = chunk; // Each chunk is the full text so far
        onProgress(result);
      }

      return result.trim();
    } else {
      // Non-streaming
      const result = await session.prompt(fullPrompt);
      return result.trim();
    }
  } catch (err) {
    console.error('Error refining text:', err);
    throw err;
  } finally {
    // Always destroy session to prevent resource leak
    if (session) {
      session.destroy();
    }
  }
}

/**
 * Get all available prompts (presets + custom)
 */
export async function getAvailablePrompts() {
  try {
    const result = await chrome.storage.local.get(['customRefinementPrompts']);
    const customPrompts = result.customRefinementPrompts || [];

    return {
      presets: Object.values(PRESET_PROMPTS),
      custom: customPrompts,
    };
  } catch (err) {
    console.error('Error loading prompts:', err);
    return {
      presets: Object.values(PRESET_PROMPTS),
      custom: [],
    };
  }
}
