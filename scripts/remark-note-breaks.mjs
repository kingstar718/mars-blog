/** 随记中的单次回车对应换行；文章保留标准 Markdown 规则。 */
export default function remarkNoteBreaks({ notesOnly = true } = {}) {
  return (tree, file) => {
    const path = String(file?.path ?? "").replaceAll("\\", "/");
    if (notesOnly && !/(?:^|\/)src\/content\/notes\//.test(path)) return;

    const visit = node => {
      if (!node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type === "text" && /\r?\n/.test(child.value)) {
          return child.value
            .split(/\r?\n/)
            .flatMap((value, index) => [
              ...(index ? [{ type: "break" }] : []),
              ...(value ? [{ type: "text", value }] : []),
            ]);
        }
        visit(child);
        return [child];
      });
    };
    visit(tree);
  };
}
