/**
 * MCP server setup and request handling
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import crypto from "crypto";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NotionClientWrapper } from "../client/index.js";
import { filterTools } from "../utils/index.js";
import * as schemas from "../types/schemas.js";
import * as args from "../types/args.js";

function createMcpServer(
  notionToken: string,
  enabledToolsSet: Set<string>,
  enableMarkdownConversion: boolean
) {
  const server = new Server(
    {
      name: "Notion MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const notionClient = new NotionClientWrapper(notionToken);

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.error("Received CallToolRequest:", request);
      try {
        if (!request.params.arguments) {
          throw new Error("No arguments provided");
        }

        let response;

        switch (request.params.name) {
          case "notion_append_block_children": {
            const a = request.params.arguments as unknown as args.AppendBlockChildrenArgs;
            if (!a.block_id || !a.children) throw new Error("Missing required arguments: block_id and children");
            response = await notionClient.appendBlockChildren(a.block_id, a.children);
            break;
          }
          case "notion_retrieve_block": {
            const a = request.params.arguments as unknown as args.RetrieveBlockArgs;
            if (!a.block_id) throw new Error("Missing required argument: block_id");
            response = await notionClient.retrieveBlock(a.block_id);
            break;
          }
          case "notion_retrieve_block_children": {
            const a = request.params.arguments as unknown as args.RetrieveBlockChildrenArgs;
            if (!a.block_id) throw new Error("Missing required argument: block_id");
            response = await notionClient.retrieveBlockChildren(a.block_id, a.start_cursor, a.page_size);
            break;
          }
          case "notion_delete_block": {
            const a = request.params.arguments as unknown as args.DeleteBlockArgs;
            if (!a.block_id) throw new Error("Missing required argument: block_id");
            response = await notionClient.deleteBlock(a.block_id);
            break;
          }
          case "notion_update_block": {
            const a = request.params.arguments as unknown as args.UpdateBlockArgs;
            if (!a.block_id || !a.block) throw new Error("Missing required arguments: block_id and block");
            response = await notionClient.updateBlock(a.block_id, a.block);
            break;
          }
          case "notion_retrieve_page": {
            const a = request.params.arguments as unknown as args.RetrievePageArgs;
            if (!a.page_id) throw new Error("Missing required argument: page_id");
            response = await notionClient.retrievePage(a.page_id);
            break;
          }
          case "notion_update_page_properties": {
            const a = request.params.arguments as unknown as args.UpdatePagePropertiesArgs;
            if (!a.page_id || !a.properties) throw new Error("Missing required arguments: page_id and properties");
            response = await notionClient.updatePageProperties(a.page_id, a.properties);
            break;
          }
          case "notion_list_all_users": {
            const a = request.params.arguments as unknown as args.ListAllUsersArgs;
            response = await notionClient.listAllUsers(a.start_cursor, a.page_size);
            break;
          }
          case "notion_retrieve_user": {
            const a = request.params.arguments as unknown as args.RetrieveUserArgs;
            if (!a.user_id) throw new Error("Missing required argument: user_id");
            response = await notionClient.retrieveUser(a.user_id);
            break;
          }
          case "notion_retrieve_bot_user": {
            response = await notionClient.retrieveBotUser();
            break;
          }
          case "notion_query_database": {
            const a = request.params.arguments as unknown as args.QueryDatabaseArgs;
            if (!a.database_id) throw new Error("Missing required argument: database_id");
            response = await notionClient.queryDatabase(a.database_id, a.filter, a.sorts, a.start_cursor, a.page_size);
            break;
          }
          case "notion_create_database": {
            const a = request.params.arguments as unknown as args.CreateDatabaseArgs;
            response = await notionClient.createDatabase(a.parent, a.properties, a.title);
            break;
          }
          case "notion_retrieve_database": {
            const a = request.params.arguments as unknown as args.RetrieveDatabaseArgs;
            response = await notionClient.retrieveDatabase(a.database_id);
            break;
          }
          case "notion_update_database": {
            const a = request.params.arguments as unknown as args.UpdateDatabaseArgs;
            response = await notionClient.updateDatabase(a.database_id, a.title, a.description, a.properties);
            break;
          }
          case "notion_create_database_item": {
            const a = request.params.arguments as unknown as args.CreateDatabaseItemArgs;
            response = await notionClient.createDatabaseItem(a.database_id, a.properties);
            break;
          }
          case "notion_create_comment": {
            const a = request.params.arguments as unknown as args.CreateCommentArgs;
            if (!a.parent && !a.discussion_id) throw new Error("Either parent.page_id or discussion_id must be provided");
            response = await notionClient.createComment(a.parent, a.discussion_id, a.rich_text);
            break;
          }
          case "notion_retrieve_comments": {
            const a = request.params.arguments as unknown as args.RetrieveCommentsArgs;
            if (!a.block_id) throw new Error("Missing required argument: block_id");
            response = await notionClient.retrieveComments(a.block_id, a.start_cursor, a.page_size);
            break;
          }
          case "notion_search": {
            const a = request.params.arguments as unknown as args.SearchArgs;
            response = await notionClient.search(a.query, a.filter, a.sort, a.start_cursor, a.page_size);
            break;
          }
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }

        const requestedFormat = (request.params.arguments as any)?.format || "markdown";
        if (enableMarkdownConversion && requestedFormat === "markdown") {
          const markdown = await notionClient.toMarkdown(response);
          return { content: [{ type: "text", text: markdown }] };
        } else {
          return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
        }
      } catch (error) {
        console.error("Error executing tool:", error);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          }],
        };
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = [
      schemas.appendBlockChildrenTool, schemas.retrieveBlockTool,
      schemas.retrieveBlockChildrenTool, schemas.deleteBlockTool,
      schemas.updateBlockTool, schemas.retrievePageTool,
      schemas.updatePagePropertiesTool, schemas.listAllUsersTool,
      schemas.retrieveUserTool, schemas.retrieveBotUserTool,
      schemas.createDatabaseTool, schemas.queryDatabaseTool,
      schemas.retrieveDatabaseTool, schemas.updateDatabaseTool,
      schemas.createDatabaseItemTool, schemas.createCommentTool,
      schemas.retrieveCommentsTool, schemas.searchTool,
    ];
    return { tools: filterTools(allTools, enabledToolsSet) };
  });

  return server;
}

/**
 * Start the MCP server
 */
export async function startServer(
  notionToken: string,
  enabledToolsSet: Set<string>,
  enableMarkdownConversion: boolean
) {
  if (process.env.MCP_TRANSPORT === "http") {
    const port = parseInt(process.env.PORT || "8080");
    const sessions = new Map<string, StreamableHTTPServerTransport>();

    const httpServer = createServer(async (req, res) => {
      if (req.url !== "/mcp") {
        res.writeHead(200);
        res.end("MCP Notion HTTP Server running");
        return;
      }

      const sessionId = req.headers["mcp-session-id"] as string;

      try {
        if (req.method === "POST") {
          let transport: StreamableHTTPServerTransport;
          if (sessionId && sessions.has(sessionId)) {
            transport = sessions.get(sessionId)!;
          } else {
            const server = createMcpServer(notionToken, enabledToolsSet, enableMarkdownConversion);
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
            });
            await server.connect(transport);
          }
          await transport.handleRequest(req, res);
          if (transport.sessionId && !sessions.has(transport.sessionId)) {
            sessions.set(transport.sessionId, transport);
            
        } else if (req.method === "GET") {
          if (sessionId && sessions.has(sessionId)) {
            await sessions.get(sessionId)!.handleRequest(req, res);
          } else {
            res.writeHead(400);
            res.end("No session");
          }
        } else if (req.method === "DELETE") {
          if (sessionId && sessions.has(sessionId)) {
            await sessions.get(sessionId)!.handleRequest(req, res);
            sessions.delete(sessionId);
          } else {
            res.writeHead(400);
            res.end("No session");
          }
        } else {
          res.writeHead(405);
          res.end("Method not allowed");
        }
      } catch (err) {
        console.error("Error:", err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal error");
        }
      }
    });

    httpServer.listen(port, () => {
      console.error(`HTTP server running on port ${port}`);
    });
  } else {
    const server = createMcpServer(notionToken, enabledToolsSet, enableMarkdownConversion);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
