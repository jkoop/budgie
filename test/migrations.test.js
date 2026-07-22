import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  getUserVersion,
  latestVersion,
  migrations,
  runMigrations,
} from "../src/migrations.js";

describe("migrations", () => {
  test("runMigrations applies pending migrations and sets user_version", () => {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");

    expect(getUserVersion(db)).toBe(0);
    runMigrations(db);
    expect(getUserVersion(db)).toBe(latestVersion);

    const tables = db
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((r) => r.name);
    expect(tables).toContain("accounts");
    expect(tables).toContain("transactions");

    runMigrations(db);
    expect(getUserVersion(db)).toBe(latestVersion);
  });

  test("runMigrations rejects a gap in version numbers", () => {
    const db = new Database(":memory:");
    db.exec(`PRAGMA user_version = ${latestVersion - 1}`);

    const broken = [
      ...migrations.slice(0, -1),
      {
        version: latestVersion + 2,
        name: "skipped",
        up() {},
      },
    ];

    expect(() => {
      let current = getUserVersion(db);
      for (const m of broken) {
        if (m.version <= current) continue;
        if (m.version !== current + 1) {
          throw new Error(`Missing migration: expected ${current + 1}, found ${m.version}`);
        }
        m.up(db);
        db.exec(`PRAGMA user_version = ${m.version}`);
        current = m.version;
      }
    }).toThrow(/Missing migration/);
  });
});
