import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "@/lib/sqlite";
import { getS3Config, saveS3Config } from "@/lib/media-settings";

/**
 * s3_config 单行表的读写：secret 首次必填、以后留空沿用旧值。
 */
describe("s3_config 表", () => {
  it("保存后读回，secret 留空沿用旧值", async () => {
    const db = openDatabase(":memory:");
    assert.equal(await getS3Config(db), null);

    await saveS3Config(db, {
      endpoint: "https://oss.example.com",
      region: "",
      bucket: "mars-blog",
      accessKeyId: "ak-1",
      secretAccessKey: "sk-1",
      forcePathStyle: true,
      enabled: true,
    });

    const first = await getS3Config(db);
    assert.equal(first?.endpoint, "https://oss.example.com");
    assert.equal(first?.secretAccessKey, "sk-1");
    assert.equal(first?.enabled, true);

    await saveS3Config(db, { ...first!, secretAccessKey: "" });
    const second = await getS3Config(db);
    assert.equal(second?.secretAccessKey, "sk-1");
    assert.equal(second?.forcePathStyle, true);
  });
});
