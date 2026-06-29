import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown, sanitizeUrl } from '../lib/markdown.jsx';

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

    it('neutralizes javascript: links (stored XSS) in the innerHTML render path', () => {
        const result = markdownToHtml('[click](javascript:alert(1))');
        expect(result).not.toContain('javascript:');
        expect(result).toContain('href="#"');
    });

    it('neutralizes data:text/html and vbscript: links', () => {
        expect(markdownToHtml('[x](data:text/html,<script>alert(1)</script>)')).toContain('href="#"');
        expect(markdownToHtml('[x](vbscript:msgbox(1))')).toContain('href="#"');
    });

    it('keeps legitimate http/https/mailto links', () => {
        expect(markdownToHtml('[a](https://x.com)')).toContain('href="https://x.com"');
        expect(markdownToHtml('[a](mailto:x@y.com)')).toContain('href="mailto:x@y.com"');
    });
});

describe('sanitizeUrl', () => {
    it('blocks javascript:/vbscript:/data: schemes (returns #)', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
        expect(sanitizeUrl('JavaScript:alert(1)')).toBe('#');
        expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('#');
        expect(sanitizeUrl('data:text/html,<script>')).toBe('#');
    });

    it('blocks scheme obfuscated with control chars / whitespace', () => {
        expect(sanitizeUrl('java\tscript:alert(1)')).toBe('#');
        expect(sanitizeUrl('  javascript:alert(1)')).toBe('#');
        expect(sanitizeUrl('java\nscript:alert(1)')).toBe('#');
    });

    it('allows http/https/mailto/tel and relative/anchor URLs', () => {
        expect(sanitizeUrl('https://x.com/a?b=1')).toBe('https://x.com/a?b=1');
        expect(sanitizeUrl('http://x.com')).toBe('http://x.com');
        expect(sanitizeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
        expect(sanitizeUrl('/relative/path')).toBe('/relative/path');
        expect(sanitizeUrl('#anchor')).toBe('#anchor');
        expect(sanitizeUrl('example.com/path')).toBe('example.com/path');
    });

    it('permits data: only when allowData is set (attachment payloads)', () => {
        expect(sanitizeUrl('data:image/png;base64,AAAA', { allowData: true })).toBe('data:image/png;base64,AAAA');
        // javascript: is still blocked even with allowData
        expect(sanitizeUrl('javascript:alert(1)', { allowData: true })).toBe('#');
    });

    it('returns # for nullish input', () => {
        expect(sanitizeUrl(null)).toBe('#');
        expect(sanitizeUrl(undefined)).toBe('#');
    });
});

// htmlToMarkdown requires DOM (document.createElement) — skip in Node environment
describe('htmlToMarkdown', () => {
    it('returns empty string for falsy input', () => {
        expect(htmlToMarkdown('')).toBe('');
        expect(htmlToMarkdown(null)).toBe('');
    });
});
