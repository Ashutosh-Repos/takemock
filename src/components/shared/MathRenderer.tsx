/**
 * Offline Math and Markdown Content Renderer using KaTeX.
 * Parses and renders inline ($...$) and block ($$...$$) KaTeX expressions safely.
 */

import React, { useMemo } from 'react';
import katex from 'katex';

interface MathRendererProps {
  content: string;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '' }) => {
  const renderedParts = useMemo(() => {
    if (!content) return [];

    // Split content by block math $$...$$ first, then inline math $...$
    const parts: Array<{ type: 'text' | 'math'; isBlock?: boolean; value: string }> = [];

    // Regex matching $$...$$ or $...$
    const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mathRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          value: content.substring(lastIndex, match.index),
        });
      }

      const matchedStr = match[0];
      const isBlock = matchedStr.startsWith('$$');
      const mathCode = isBlock
        ? matchedStr.substring(2, matchedStr.length - 2).trim()
        : matchedStr.substring(1, matchedStr.length - 1).trim();

      parts.push({
        type: 'math',
        isBlock,
        value: mathCode,
      });

      lastIndex = match.index + matchedStr.length;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        value: content.substring(lastIndex),
      });
    }

    return parts;
  }, [content]);

  return (
    <div className={`text-foreground leading-relaxed ${className}`}>
      {renderedParts.map((part, idx) => {
        if (part.type === 'math') {
          try {
            // In LaTeX, % is a comment character. Escape unescaped % so percentages render correctly
            const sanitizedValue = part.value.replace(/(?<!\\)%/g, '\\%');
            const html = katex.renderToString(sanitizedValue, {
              displayMode: part.isBlock,
              throwOnError: false,
            });
            return (
              <span
                key={idx}
                className={part.isBlock ? 'my-2 block overflow-x-auto py-1 text-center' : 'inline'}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return (
              <code key={idx} className="text-error font-mono">
                {part.value}
              </code>
            );
          }
        }

        // Render plain text with line breaks preserved
        return (
          <span key={idx} className="whitespace-pre-line">
            {part.value}
          </span>
        );
      })}
    </div>
  );
};
