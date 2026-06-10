import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";

const taskListMarkerPattern = /^\[( |x|X)?\](?:\s+|$)/;

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

export function markdownTaskListPlugin(md: MarkdownIt) {
  md.core.ruler.after("inline", "fluidity_task_lists", (state: StateCore) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type !== "inline" || !isFirstInlineTokenInListItem(state.tokens, index)) continue;

      const match = taskListMarkerPattern.exec(token.content);
      if (!match) continue;

      const checked = match[1]?.toLowerCase() === "x";
      const listItemToken = state.tokens[index - 2];
      listItemToken.attrJoin("class", "markdown-task-list-item");

      const checkbox = new state.Token("html_inline", "", 0);
      checkbox.content = `<input class="markdown-task-checkbox" type="checkbox" disabled${checked ? " checked" : ""}>`;

      token.content = token.content.slice(match[0].length);
      const children = token.children ?? [];
      stripTaskListMarkerFromChildren(children, match[0].length);
      token.children = [checkbox, ...children];
    }
  });
}
