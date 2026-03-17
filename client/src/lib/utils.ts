import clsx, { type ClassValue } from 'clsx';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}

export function formatDate(iso: string): string {
  try {
    const date = parseISO(iso);
    return format(date, 'MMM d, yyyy HH:mm');
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string): string {
  try {
    const date = parseISO(iso);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return iso;
  }
}

export function statusColor(status: string): {
  bg: string;
  text: string;
  dot: string;
  border: string;
} {
  switch (status) {
    case 'active':
      return {
        bg: 'bg-green-500/10',
        text: 'text-green-400',
        dot: 'bg-green-500',
        border: 'border-green-500/30',
      };
    case 'partial':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        dot: 'bg-amber-500',
        border: 'border-amber-500/30',
      };
    case 'stale':
      return {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        dot: 'bg-red-500',
        border: 'border-red-500/30',
      };
    case 'new':
      return {
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        dot: 'bg-blue-400',
        border: 'border-blue-400/30',
      };
    case 'decommissioning':
      return {
        bg: 'bg-slate-500/10',
        text: 'text-slate-400',
        dot: 'bg-slate-500',
        border: 'border-slate-500/30',
      };
    default:
      return {
        bg: 'bg-slate-500/10',
        text: 'text-slate-400',
        dot: 'bg-slate-500',
        border: 'border-slate-500/30',
      };
  }
}

export function severityColor(severity: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (severity) {
    case 'high':
      return {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/30',
      };
    case 'medium':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
      };
    case 'low':
      return {
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-400/30',
      };
    default:
      return {
        bg: 'bg-slate-500/10',
        text: 'text-slate-400',
        border: 'border-slate-500/30',
      };
  }
}

export function scoreColor(score: number): {
  text: string;
  bg: string;
  ring: string;
} {
  if (score >= 80) {
    return {
      text: 'text-green-400',
      bg: 'bg-green-500',
      ring: 'ring-green-500/30',
    };
  }
  if (score >= 50) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500',
      ring: 'ring-amber-500/30',
    };
  }
  return {
    text: 'text-red-400',
    bg: 'bg-red-500',
    ring: 'ring-red-500/30',
  };
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}
