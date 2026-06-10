import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";

const taskListMarkerPattern = /^\[( |x|X)?\](?:\s+|$)/;
const sourceTaskListMarkerPattern = /^(\s*(?:[-+*]|\d+[.)])\s+)\[( |x|X)?\]/;

function isFirstInlineTokenInListItem(tokens: Token[], index: number) {
  return (
    tokens[index - 1]?.type === "paragraph_open" && tokens[index - 2]?.type === "list_item_open"
  );
}

function stripTaskListMarkerFromChildren(children: Token[], markerLength: number) {
  for (const child of children) {
    if (child.type !== "text") continue;
    child.content = child.content.slice(markerLength);
    return;
  }
}

export interface MarkdownTaskListTarget {
  taskIndex: number;
  sourceLine: number | null;
}

export function taskListTargetFromEventTarget(
  target: EventTarget | null,
): MarkdownTaskListTarget | null {
  if (!(target instanceof Element)) return null;
  const checkbox = target.closest<HTMLInputElement>(".markdown-task-checkbox");
  if (!checkbox) return null;

  const taskIndex = Number(checkbox.dataset.taskIndex);
  const sourceLine = Number(checkbox.dataset.taskLine);
  if (!Number.isInteger(taskIndex)) return null;

  return {
    taskIndex,
    sourceLine: Number.isInteger(sourceLine) ? sourceLine : null,
  };
}

function toggleTaskMarker(line: string) {
  const match = sourceTaskListMarkerPattern.exec(line);
  if (!match) return null;

  const checked = match[2]?.toLowerCase() === "x";
  return `${match[1]}[${checked ? " " : "x"}]${line.slice(match[0].length)}`;
}

export function toggleMarkdownTaskListItem(markdown: string, target: MarkdownTaskListTarget) {
  const parts = markdown.split(/(\r?\n)/);

  if (target.sourceLine !== null) {
    const partIndex = target.sourceLine * 2;
    const toggledLine = toggleTaskMarker(parts[partIndex] ?? "");
    if (toggledLine !== null) {
      parts[partIndex] = toggledLine;
      return parts.join("");
    }
  }

  let currentTaskIndex = 0;
  for (let index = 0; index < parts.length; index += 2) {
    const toggledLine = toggleTaskMarker(parts[index]);
    if (toggledLine === null) continue;

    if (currentTaskIndex === target.taskIndex) {
      parts[index] = toggledLine;
      return parts.join("");
    }

    currentTaskIndex += 1;
  }

  return markdown;
}

export function markdownTaskListPlugin(md: MarkdownIt) {
  md.core.ruler.after("inline", "fluidity_task_lists", (state: StateCore) => {
    let taskIndex = 0;

    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type !== "inline" || !isFirstInlineTokenInListItem(state.tokens, index)) continue;

      const match = taskListMarkerPattern.exec(token.content);
      if (!match) continue;

      const checked = match[1]?.toLowerCase() === "x";
      const listItemToken = state.tokens[index - 2];
      listItemToken.attrJoin("class", "markdown-task-list-item");

      const checkbox = new state.Token("html_inline", "", 0);
      const sourceLine = token.map?.[0];
      const sourceLineAttribute =
        typeof sourceLine === "number" ? ` data-task-line="${sourceLine}"` : "";
      checkbox.content = `<input class="markdown-task-checkbox" type="checkbox" tabindex="-1" data-task-index="${taskIndex}"${sourceLineAttribute}${checked ? " checked" : ""}>`;
      taskIndex += 1;

      token.content = token.content.slice(match[0].length);
      const children = token.children ?? [];
      stripTaskListMarkerFromChildren(children, match[0].length);
      token.children = [checkbox, ...children];
    }
  });
}
