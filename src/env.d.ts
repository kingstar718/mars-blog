/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** 由 src/middleware.ts 写入：带着有效会话 cookie 的请求才有值 */
    session?: import("./lib/session").SessionPayload;
  }
}
