import { useCallback, useEffect, useState } from "react";
import EntryList from "./EntryList";
import Editor from "./Editor";

/**
 * 整个 /admin 是一个 React 根，内部自己路由。
 *
 * 后台是应用不是内容页：元信息表单、编辑器、预览、自动保存要共享状态，
 * 拆成多个 Astro island 之后跨 island 通信会很难受。公开页面仍然是 Astro
 * 的零 JS 渲染，两边各取所长。
 *
 * 路由用 History API 而不是 hash：Astro 那边是 [...path].astro 通配，
 * 任何 /admin/* 都返回同一个壳，刷新不会 404。
 */

type Route =
  | { name: "list" }
  | { name: "edit"; id: number }
  | { name: "new"; kind: "post" | "note" };

const parseRoute = (pathname: string): Route => {
  const edit = pathname.match(/^\/admin\/edit\/(\d+)\/?$/);
  if (edit) return { name: "edit", id: Number(edit[1]) };

  const create = pathname.match(/^\/admin\/new\/(post|note)\/?$/);
  if (create) return { name: "new", kind: create[1] as "post" | "note" };

  return { name: "list" };
};

export default function AdminApp() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(location.pathname)
  );

  const navigate = useCallback((path: string) => {
    history.pushState(null, "", path);
    setRoute(parseRoute(path));
  }, []);

  // 浏览器前进后退
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  if (route.name === "edit") {
    // key 让切换文章时整个编辑器重建，不会残留上一篇的状态
    return (
      <Editor key={route.id} id={route.id} kind="post" onNavigate={navigate} />
    );
  }

  if (route.name === "new") {
    return (
      <Editor
        key={`new-${route.kind}`}
        kind={route.kind}
        onNavigate={navigate}
      />
    );
  }

  return <EntryList onNavigate={navigate} />;
}
