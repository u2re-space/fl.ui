/**
 * Shared safe Markdown rendering for view-level prose surfaces.
 *
 * FIND:safe-markdown-render
 * TAG:code-highlight
 * WHY: Rendering and sanitization must stay identical for markdown-view and
 * assistant output; raw structured model output is never safe HTML.
 * Fence language is stamped on `data-language` (and `language-*`) for highlight.js.
 */
import DOMPurify from "dompurify";
import { marked, type MarkedExtension } from "marked";
import markedKatex from "marked-katex-extension";
import renderMathInElement from "katex/contrib/auto-render";

export const CODE_LANGUAGE_ATTR = "data-language";

const LANGUAGE_TOKEN = /^[\w.+#-]+$/;

export const normalizeFenceLanguage = (raw: string | undefined | null): string => {
    const token = String(raw || "").trim().split(/\s+/)[0] || "";
    return LANGUAGE_TOKEN.test(token) ? token : "";
};

const MATH_DELIMITER_PATTERN = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<!\$)\$[^$\n]+\$|\\\([\s\S]*?\\\)/;
const MATH_TOKEN_PATTERN = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<!\$)\$[^$\n]+\$|\\\([\s\S]*?\\\))/g;
const FENCED_CODE_PATTERN = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;
const INLINE_CODE_PATTERN = /`[^`\n]+`/g;

export const MARKDOWN_SANITIZE_OPTIONS = {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_ATTR: [CODE_LANGUAGE_ATTR, "data-lang"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "applet", "link", "meta", "base", "form", "noscript", "template"],
    FORBID_CONTENTS: ["script", "style", "iframe", "object", "embed", "applet", "noscript", "template"]
};

const escapeHtml = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** marked v15+ fence token → `<pre data-language>` + `<code class="language-*">`. */
const renderFencedCode = (token: { text?: string; lang?: string }): string => {
    const language = normalizeFenceLanguage(token.lang);
    const body = escapeHtml(String(token.text ?? ""));
    const langAttr = language ? ` ${CODE_LANGUAGE_ATTR}="${escapeHtml(language)}"` : "";
    const langClass = language ? ` class="language-${escapeHtml(language)}"` : "";
    return `<pre${langAttr}><code${langAttr}${langClass}>${body}</code></pre>\n`;
};

const maskCodeSegments = (markdown: string): { masked: string; restore: (value: string) => string } => {
    const maskedValues: string[] = [];
    const tokenPrefix = "__MD_MASK_";
    const tokenSuffix = "__";
    const mask = (value: string): string => value.replace(FENCED_CODE_PATTERN, (segment) => {
        const token = `${tokenPrefix}${maskedValues.length}${tokenSuffix}`;
        maskedValues.push(segment);
        return token;
    });
    const maskInline = (value: string): string => value.replace(INLINE_CODE_PATTERN, (segment) => {
        const token = `${tokenPrefix}${maskedValues.length}${tokenSuffix}`;
        maskedValues.push(segment);
        return token;
    });

    return {
        masked: maskInline(mask(markdown)),
        restore: (value: string): string =>
            value.replace(/__MD_MASK_(\d+)__/g, (_, index) => maskedValues[Number(index)] ?? "")
    };
};

let configured = false;

const KATEX_MARKED_OPTIONS = {
    throwOnError: false,
    nonStandard: true,
    output: "mathml" as const,
    strict: false
};

const looksLikeMarkedExtension = (value: unknown): value is MarkedExtension => {
    if (!value || typeof value !== "object") return false;
    const ext = value as MarkedExtension & { extensions?: unknown };
    return Array.isArray(ext.extensions) || ext.hooks != null || ext.renderer != null;
};

/**
 * WHY: CRX Rolldown remaps `marked-katex-extension`'s default onto `katex`.
 * `marked.use(katex({…}))` then throws and every markdown parse dies.
 */
const markedKatexExtension = (): MarkedExtension | null => {
    if (typeof markedKatex !== "function") return null;
    try {
        const ext = markedKatex(KATEX_MARKED_OPTIONS) as unknown;
        return looksLikeMarkedExtension(ext) ? ext : null;
    } catch {
        return null;
    }
};

const renderMathSnippet = (snippet: string): string => {
    const node = document.createElement("span");
    node.textContent = snippet;
    renderMathInElement(node, {
        ...KATEX_MARKED_OPTIONS,
        delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false }
        ]
    });
    return node.innerHTML;
};

const preprocessMathInMarkdown = (markdown: string): string => {
    const { masked, restore } = maskCodeSegments(markdown);
    /* WHY: `${…}` inside fences used to trip this hook; textContent of the whole
     * file then escaped raw HTML (`<h1 align>`, badges) so Open showed tags. */
    if (!MATH_DELIMITER_PATTERN.test(masked)) return markdown;
    if (typeof document === "undefined") return markdown;
    MATH_TOKEN_PATTERN.lastIndex = 0;
    return restore(masked.replace(MATH_TOKEN_PATTERN, (match) => renderMathSnippet(match)));
};

const fenceAndMathHooks: MarkedExtension = {
    hooks: {
        preprocess: preprocessMathInMarkdown
    },
    renderer: {
        code: renderFencedCode
    }
};

/** Install the shared MathML-aware marked hook exactly once per document realm. */
export const configureMarkdownRendering = (): void => {
    if (configured) return;
    configured = true;
    const katexExt = markedKatexExtension();
    try {
        if (katexExt) marked.use(katexExt, fenceAndMathHooks);
        else marked.use(fenceAndMathHooks);
    } catch (error) {
        console.warn("[safe-markdown] marked.use failed; fence renderer only", error);
        try {
            marked.use({ renderer: { code: renderFencedCode } });
        } catch {
            /* marked stays at defaults — still parseable */
        }
    }
};

/** Parse Markdown synchronously and sanitize all generated or embedded HTML. */
export const renderSafeMarkdown = (markdown: string): string => {
    configureMarkdownRendering();
    const html = marked.parse(String(markdown || "")) as string;
    return DOMPurify.sanitize(html, MARKDOWN_SANITIZE_OPTIONS);
};

/** Sanitize raw HTML before a Markdown surface inserts it into the document. */
export const sanitizeMarkdownHtml = (html: string): string =>
    DOMPurify.sanitize(String(html || ""), MARKDOWN_SANITIZE_OPTIONS);
