import { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommandEntry } from '@/lib/api';

interface CommandBlockProps {
  commands: CommandEntry[];
  compact?: boolean;
}

export default function CommandBlock({ commands, compact }: CommandBlockProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyToClipboard = async (text: string, idx?: number) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (idx !== undefined) {
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  if (commands.length === 0) return null;

  const allCommandsText = commands
    .map((c) => `# ${c.label}\n# Run from: ${c.runFrom}\n${c.command}`)
    .join('\n\n');

  return (
    <div className={cn('space-y-2', compact && 'space-y-1')}>
      {commands.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => copyToClipboard(allCommandsText)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
          >
            {copiedAll ? (
              <>
                <Check className="w-3 h-3 text-green-400" />
                <span className="text-green-400">Copied All</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy All Commands
              </>
            )}
          </button>
        </div>
      )}

      {commands.map((cmd, idx) => (
        <div key={idx} className="group">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-400 font-medium">{cmd.label}</span>
            </div>
            <span className="text-[10px] text-slate-500 px-1.5 py-0.5 bg-slate-700/50 rounded">
              {cmd.runFrom}
            </span>
          </div>
          <div className="relative">
            <pre className="bg-slate-900/80 border border-slate-700/50 rounded-lg p-3 text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {cmd.command}
            </pre>
            <button
              onClick={() => copyToClipboard(cmd.command, idx)}
              className="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded transition-colors opacity-0 group-hover:opacity-100"
              title="Copy command"
            >
              {copiedIdx === idx ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
