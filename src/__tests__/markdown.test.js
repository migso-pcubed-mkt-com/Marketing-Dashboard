import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from '../lib/markdown.jsx';

describe('markdownToHtml', () => {
    it('returns empty string for falsy input', () => {
        expect(markdownToHtml('')).toBe('');
        expect(markdownToHtml(null)).toBe('');
        expect(markdownToHtml(undefined)).toBe('');
    });

    it('converts bold text', () => {
        expect(markdownToHtml('**hello**')).toContain('<strong>hello</strong>');
    });

    it('converts italic text', () => {
        expect(markdownToHtml('*hello*')).toContain('<em>hello</em>');
    });

    it('converts strikethrough', () => {
        expect(markdownToHtml('~~hello~~')).toContain('<s>hello</s>');
    });

    it('converts inline code', () => {
        const result = markdownToHtml('use `npm install`');
        expect(result).toContain('<code');
        expect(result).toContain('npm install');
    });

    it('converts headings', () => {
        expect(markdownToHtml('# Title')).toContain('<h1>');
        expect(markdownToHtml('## Subtitle')).toContain('<h2>');
        expect(markdownToHtml('### Section')).toContain('<h3>');
    });

    it('converts unordered lists', () => {
        expect(markdownToHtml('- item one')).toContain('<li>');
        expect(markdownToHtml('- item one')).toContain('<ul>');
    });

    it('converts ordered lists', () => {
        expect(markdownToHtml('1. first')).toContain('<li>');
        expect(markdownToHtml('1. first')).toContain('<ol>');
    });

    it('converts code blocks', () => {
        const result = markdownToHtml('```\nconsole.log("hi")\n```');
        expect(result).toContain('<pre');
        expect(result).toContain('<code>');
    });

    it('escapes HTML in content (XSS prevention)', () => {
        const result = markdownToHtml('<script>alert("xss")</script>');
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
    });

    it('escapes HTML inside headings', () => {
        const result = markdownToHtml('# <b>bold</b>');
        expect(result).not.toContain('<b>bold</b>');
        expect(result).toContain('&lt;b&gt;');
    });

    it('escapes HTML in code blocks', () => {
        const result = markdownToHtml('```\n<div>hello</div>\n```');
        expect(result).toContain('&lt;div&gt;');
    });

    it('converts links', () => {
        const result = markdownToHtml('[Google](https://google.com)');
        expect(result).toContain('href=');
        expect(result).toContain('Google');
    });
});

// htmlToMarkdown requires DOM (document.createElement) — skip in Node environment
describe('htmlToMarkdown', () => {
    it('returns empty string for falsy input', () => {
        expect(htmlToMarkdown('')).toBe('');
        expect(htmlToMarkdown(null)).toBe('');
    });
});
