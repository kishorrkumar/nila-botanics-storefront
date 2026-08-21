import fs from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let clientPromise;

function configurationError() {
  if (!process.env.SNAPSERVE_API_KEY) return "SNAPSERVE_API_KEY is missing";
  if (!process.env.SNAPSERVE_MCP_SCRIPT) return "SNAPSERVE_MCP_SCRIPT is missing";
  if (!fs.existsSync(process.env.SNAPSERVE_MCP_SCRIPT)) return `SnapServe MCP script not found at ${process.env.SNAPSERVE_MCP_SCRIPT}`;
  return null;
}

async function getClient() {
  const error = configurationError();
  if (error) throw new Error(error);
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: "nila-botanics-admin", version: "1.0.0" });
      const transport = new StdioClientTransport({
        command: "node",
        args: [process.env.SNAPSERVE_MCP_SCRIPT],
        env: {
          ...process.env,
          SNAPSERVE_API_KEY: process.env.SNAPSERVE_API_KEY,
          SNAPSERVE_BASE_URL: process.env.SNAPSERVE_BASE_URL || "https://app.snapserve.ai/api"
        }
      });
      await client.connect(transport);
      return client;
    })().catch(error => { clientPromise = undefined; throw error; });
  }
  return clientPromise;
}

export async function listSnapServeTools() {
  const error = configurationError();
  if (error) return { configured: false, error, tools: [] };
  const client = await getClient();
  const result = await client.listTools();
  return { configured: true, tools: result.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) };
}

export async function placeDeliveryCall(order) {
  const client = await getClient();
  const toolList = await client.listTools();
  const configuredTool = process.env.SNAPSERVE_MCP_CALL_TOOL;
  const tool = configuredTool
    ? toolList.tools.find(item => item.name === configuredTool)
    : toolList.tools.find(item => /(start|create|make|initiate).*(call)|outbound.*call/i.test(`${item.name} ${item.description || ""}`));
  if (!tool) throw new Error("No delivery-call tool selected. Set SNAPSERVE_MCP_CALL_TOOL after checking /api/admin/snapserve/tools.");

  const rawTemplate = process.env.SNAPSERVE_MCP_CALL_ARGS_JSON;
  if (!rawTemplate) throw new Error("SNAPSERVE_MCP_CALL_ARGS_JSON is missing");
  const context = {
    orderId: order.id,
    customerName: order.customer_name,
    phone: normalizePhone(order.phone),
    total: String(order.total),
    address: `${order.address}, ${order.city} - ${order.pincode}`,
    items: order.items.map(item => `${item.quantity} x ${item.name}`).join(", ")
  };
  const args = replaceTokens(JSON.parse(rawTemplate), context);
  const result = await client.callTool({ name: tool.name, arguments: args });
  if (result.isError) throw new Error(extractText(result.content) || "SnapServe MCP call failed");
  const structured = result.structuredContent || {};
  return { tool: tool.name, callId: structured.call_id || structured.callId || structured.id || null, result };
}

function replaceTokens(value, context) {
  if (typeof value === "string") return value.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? "");
  if (Array.isArray(value)) return value.map(item => replaceTokens(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, context)]));
  return value;
}

function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, "");
  if (String(value).trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function extractText(content = []) { return content.filter(item => item.type === "text").map(item => item.text).join(" "); }
