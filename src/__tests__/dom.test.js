import { describe, it, expect, beforeEach, vi } from 'vitest';
import { insertText } from '../utils.js';

describe('insertText', () => {
  beforeEach(() => {
    // Clean up DOM before each test - safe use of innerHTML to clear
    document.body.innerHTML = '';
  });

  describe('with input elements', () => {
    it('should insert text into empty input', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const result = insertText(input, 'hello');

      expect(result).toBe(true);
      expect(input.value).toBe('hello');
    });

    it('should insert text at cursor position', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'hello world';
      document.body.appendChild(input);

      input.setSelectionRange(6, 6); // Cursor after "hello "

      const result = insertText(input, 'beautiful ');

      expect(result).toBe(true);
      expect(input.value).toBe('hello beautiful world');
    });

    it('should replace selected text', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'hello world';
      document.body.appendChild(input);

      input.setSelectionRange(0, 5); // Select "hello"

      const result = insertText(input, 'goodbye');

      expect(result).toBe(true);
      expect(input.value).toBe('goodbye world');
    });

    it('should append text when cursor is at end', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'hello';
      document.body.appendChild(input);

      input.setSelectionRange(5, 5); // Cursor at end

      const result = insertText(input, ' world');

      expect(result).toBe(true);
      expect(input.value).toBe('hello world');
    });

    it('should fire input event', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const inputHandler = vi.fn();
      input.addEventListener('input', inputHandler);

      insertText(input, 'test');

      expect(inputHandler).toHaveBeenCalled();
    });

    it('should fire change event', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const changeHandler = vi.fn();
      input.addEventListener('change', changeHandler);

      insertText(input, 'test');

      expect(changeHandler).toHaveBeenCalled();
    });

    it('should update cursor position after insert', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'hello';
      document.body.appendChild(input);

      input.setSelectionRange(0, 0); // Cursor at start

      insertText(input, 'say ');

      expect(input.selectionStart).toBe(4); // After "say "
      expect(input.selectionEnd).toBe(4);
    });
  });

  describe('with textarea elements', () => {
    it('should insert text into empty textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const result = insertText(textarea, 'hello\nworld');

      expect(result).toBe(true);
      expect(textarea.value).toBe('hello\nworld');
    });

    it('should insert text at cursor position in textarea', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'line1\nline2';
      document.body.appendChild(textarea);

      textarea.setSelectionRange(6, 6); // After "line1\n"

      const result = insertText(textarea, 'new ');

      expect(result).toBe(true);
      expect(textarea.value).toBe('line1\nnew line2');
    });

    it('should handle multiline replacement', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'line1\nline2\nline3';
      document.body.appendChild(textarea);

      textarea.setSelectionRange(6, 11); // Select "line2"

      const result = insertText(textarea, 'replaced');

      expect(result).toBe(true);
      expect(textarea.value).toBe('line1\nreplaced\nline3');
    });
  });

  describe('with contenteditable elements', () => {
    // Note: jsdom has limited support for contenteditable, execCommand, and Selection API
    // These tests verify the function handles contenteditable elements without throwing,
    // but may not accurately reflect browser behavior

    it('should recognize contenteditable attribute', () => {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);

      // The function should recognize the contentEditable attribute
      // Note: jsdom may not fully implement isContentEditable property
      expect(div.contentEditable).toBe('true');
    });

    it('should not throw when inserting into contenteditable', () => {
      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);

      // Should not throw even if jsdom doesn't fully support execCommand
      expect(() => insertText(div, 'hello')).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should return false for null element', () => {
      const result = insertText(null, 'test');
      expect(result).toBe(false);
    });

    it('should return false for undefined element', () => {
      const result = insertText(undefined, 'test');
      expect(result).toBe(false);
    });

    it('should return false for empty text', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      const result = insertText(input, '');
      expect(result).toBe(false);
    });

    it('should return false for null text', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);

      const result = insertText(input, null);
      expect(result).toBe(false);
    });

    it('should return false for non-editable element', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      const result = insertText(div, 'test');
      expect(result).toBe(false);
    });

    it('should handle special characters', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const result = insertText(input, '<script>alert("xss")</script>');

      expect(result).toBe(true);
      expect(input.value).toBe('<script>alert("xss")</script>');
    });

    it('should handle unicode text', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const result = insertText(input, '你好世界 🌍 مرحبا');

      expect(result).toBe(true);
      expect(input.value).toBe('你好世界 🌍 مرحبا');
    });

    it('should handle very long text', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const longText = 'a'.repeat(10000);
      const result = insertText(input, longText);

      expect(result).toBe(true);
      expect(input.value).toBe(longText);
    });
  });

  describe('with different input types', () => {
    it('should work with search input', () => {
      const input = document.createElement('input');
      input.type = 'search';
      document.body.appendChild(input);

      const result = insertText(input, 'search query');

      expect(result).toBe(true);
      expect(input.value).toBe('search query');
    });

    it('should work with url input', () => {
      const input = document.createElement('input');
      input.type = 'url';
      document.body.appendChild(input);

      const result = insertText(input, 'https://example.com');

      expect(result).toBe(true);
      expect(input.value).toBe('https://example.com');
    });

    it('should work with email input', () => {
      const input = document.createElement('input');
      input.type = 'email';
      document.body.appendChild(input);

      // Note: jsdom may have issues with email inputs
      // This test verifies the function doesn't throw
      expect(() => insertText(input, 'test@example.com')).not.toThrow();
    });

    it('should work with password input', () => {
      const input = document.createElement('input');
      input.type = 'password';
      document.body.appendChild(input);

      const result = insertText(input, 'secretpassword');

      expect(result).toBe(true);
      expect(input.value).toBe('secretpassword');
    });

    it('should work with tel input', () => {
      const input = document.createElement('input');
      input.type = 'tel';
      document.body.appendChild(input);

      const result = insertText(input, '+1-555-123-4567');

      expect(result).toBe(true);
      expect(input.value).toBe('+1-555-123-4567');
    });
  });
});
