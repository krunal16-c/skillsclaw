import ReactMarkdown from "react-markdown";

interface SkillPreviewProps {
  content: string;
}

export default function SkillPreview({ content }: SkillPreviewProps) {
  // Extract YAML frontmatter and body
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : null;
  const body = frontmatterMatch ? frontmatterMatch[2] : content;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-4">
        {frontmatter && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge-blue">YAML Frontmatter</span>
              <span className="text-xs text-gray-500">Claude reads this to activate the skill</span>
            </div>
            <pre className="text-xs leading-relaxed overflow-x-auto bg-gray-950 border border-gray-800 rounded-lg p-4">
              <code className="text-yellow-200">---{"\n"}</code>
              <code className="text-gray-300">{frontmatter}</code>
              <code className="text-yellow-200">{"\n"}---</code>
            </pre>
          </div>
        )}

        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-xl font-bold text-white mb-3 mt-6 first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-semibold text-gray-200 mb-2 mt-5 border-b border-gray-800 pb-1">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-semibold text-gray-300 mb-2 mt-4">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-gray-400 text-sm leading-relaxed mb-3">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside space-y-1 mb-3 text-gray-400 text-sm">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside space-y-2 mb-3 text-gray-400 text-sm">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-gray-400 text-sm">{children}</li>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.includes("language-");
                if (isBlock) {
                  return (
                    <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto my-3">
                      <code className="text-xs font-mono text-gray-300">{children}</code>
                    </pre>
                  );
                }
                return (
                  <code className="bg-gray-800 text-brand-300 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                );
              },
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-brand-600 pl-4 my-3 text-gray-500 text-sm italic">{children}</blockquote>
              ),
            }}
          >
            {body}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
