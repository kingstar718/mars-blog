import { useEffect, useRef } from "react";
import { EditorView, minimalSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * CodeMirror 6 的薄封装。
 *
 * 用 minimalSetup 而不是 basicSetup：后者带行号、折叠栏、活动行高亮，
 * 那是给代码用的，写中文长文时全是噪音。行号一栏还会白占左边距。
 *
 * lineWrapping 必须开，否则长段中文会横向溢出。
 */
export default function Markdown({ value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  // onChange 放进 ref，避免它变化时重建整个编辑器（会丢光标和撤销历史）
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (!host.current) return;

    const instance = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          minimalSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.updateListener.of(update => {
            if (update.docChanged) handler.current(update.state.doc.toString());
          }),
          EditorView.theme({
            "&": { fontSize: "16px" },
            "&.cm-focused": { outline: "none" },
            ".cm-content": {
              fontFamily: "inherit",
              lineHeight: "1.8",
              padding: "12px 0",
            },
            ".cm-line": { padding: "0" },
          }),
        ],
      }),
      parent: host.current,
    });
    view.current = instance;

    return () => instance.destroy();
    // 只在挂载时建一次；后续外部改 value 走下面那个 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部替换内容（比如切换到另一篇）时同步进来，
  // 但要跳过「值本来就一样」的情况，否则每次输入都会重设光标
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div ref={host} className="min-h-[50vh]" />;
}
