import { migrate } from "./db.js";
import { runMcpStdioServer } from "./mcp/stdio.js";

migrate();
runMcpStdioServer();
