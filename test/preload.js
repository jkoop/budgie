import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = mkdtempSync(join(tmpdir(), "budgie-test-"));
process.env.BUDGIE_DB = join(dir, "test.db");
