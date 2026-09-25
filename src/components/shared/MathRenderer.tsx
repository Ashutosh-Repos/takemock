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
    <div className={`prose max-w-none leading-relaxed text-base-content ${className}`}>
      {renderedParts.map((part, idx) => {
        if (part.type === 'math') {
          try {
            const html = katex.renderToString(part.value, {
              displayMode: part.isBlock,
              throwOnError: false,
            });
            return (
              <span
                key={idx}
                className={part.isBlock ? 'my-3 block overflow-x-auto py-1 text-center' : 'inline-block px-1'}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return (
              <code key={idx} className="font-mono text-error">
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
