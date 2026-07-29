import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorView, minimalSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";

export interface MarkdownHandle {
  /** 在光标处插入文本，插完把光标移到末尾 */
  insert: (text: string) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onFiles?: (files: File[]) => void;
  ref?: Ref<MarkdownHandle>;
}

/**
 * CodeMirror 6 的薄封装。
 *
 * 用 minimalSetup 而不是 basicSetup：后者带行号、折叠栏、活动行高亮，
 * 那是给代码用的，写中文长文时全是噪音。行号一栏还会白占左边距。
 *
 * lineWrapping 必须开，否则长段中文会横向溢出。
 */
export default function Markdown({ value, onChange, onFiles, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  // 回调放进 ref，避免它变化时重建整个编辑器（会丢光标和撤销历史）
  const handler = useRef(onChange);
  handler.current = onChange;
  const filesHandler = useRef(onFiles);
  filesHandler.current = onFiles;

  useImperativeHandle(ref, () => ({
    insert: text => {
      const instance = view.current;
      if (!instance) return;
      const at = instance.state.selection.main.head;
      instance.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
      });
      instance.focus();
    },
  }));

  useEffect(() => {
    if (!host.current) return;

    const pickFiles = (list: FileList | null | undefined) => {
      const files = [...(list ?? [])].filter(file =>
        file.type.startsWith("image/")
      );
      if (files.length === 0) return false;
      filesHandler.current?.(files);
      return true;
    };

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
          // 贴图和拖图直接进上传，这是手机和截图流最顺的路径
          EditorView.domEventHandlers({
            paste: event => pickFiles(event.clipboardData?.files),
            drop: event => {
              if (pickFiles(event.dataTransfer?.files)) {
                event.preventDefault();
                return true;
              }
              return false;
            },
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
